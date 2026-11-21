import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { wearArtifact } from '../src/engine/artifactEngine';
import { ARTIFACT_SALVAGE_WEAR_LIMIT, availableArtifactSalvageActions, proveWorkshopArtifactOrigin,
  resolveArtifactSalvageAction } from '../src/engine/artifactSalvageEngine';
import { advanceEstates,captureEstate,resolveEstateAction } from '../src/engine/estateEngine';
import { claimFurnaceUse } from '../src/engine/furnaceReservationEngine';
import { projectResourceFlowMonth } from '../src/engine/resourceFlowEngine';
import { advanceWorkshops,resolveWorkshopAction,WORKSHOP_TERMINAL_LIMIT } from '../src/engine/workshopEngine';
import type { Cultivator,LLMDecisionPayload } from '../src/types/world';

const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'核对旧器来历和实际炉位。'});
const salvage=(targetArtifactId:string,targetLocationId:string)=>action('SALVAGE_ARTIFACT',{targetArtifactId,targetLocationId});
const workshop=(fields:Partial<LLMDecisionPayload>)=>action('WORKSHOP',fields);

function fixture(){
  const world=createInitialWorld(341);
  world.tick=23;
  const site=world.locations.find(row=>row.id==='loc-market')!;
  const [maker,patron,heir]=[...world.cultivators.slice(0,3)].sort((a,b)=>a.id<b.id?-1:1);
  for(const actor of world.cultivators) actor.locationId=world.locations[0].id;
  for(const actor of [maker,patron,heir]){
    actor.locationId=site.id;actor.alive=true;actor.hp=actor.maxHp;actor.artifacts=[];
    actor.spiritStones=400;actor.herbs.earth_root=10;actor.techniqueMastery=70;actor.tribulation=undefined;
  }
  site.furnaceGrade=1;maker.spiritRoot=site.spiritRoot;
  const run=(actor:Cultivator,fields:Partial<LLMDecisionPayload>)=>resolveWorkshopAction(world,actor,workshop(fields),()=>.99);
  const offer=()=>run(patron,{workshopMove:'offer',targetCultivatorId:maker.id,workshopTier:'法器',workshopQuantity:1,
    workshopQualityFloor:'standard'});
  expect(offer()).not.toBeNull();
  const order=world.workshops.orders[0];
  expect(run(maker,{workshopMove:'accept',targetWorkshopId:order.id})).not.toBeNull();
  for(let turns=0;turns<2;turns++){
    world.tick++;
    expect(run(maker,{workshopMove:'work',targetWorkshopId:order.id})).not.toBeNull();
  }
  const item=patron.artifacts[0];
  expect(item.id).toBe(order.work[1].artifactId);
  expect(item.workshopOrigin).toMatchObject({orderId:order.id,piece:1,makerId:maker.id,siteId:site.id,
    blankTick:order.work[0].tick,finishedTick:order.work[1].tick});
  world.tick++;
  const wear=()=>{while(item.durability!>item.maxDurability!*ARTIFACT_SALVAGE_WEAR_LIMIT) wearArtifact(patron,false);};
  return {world,site,maker,patron,heir,run,offer,order,item,wear};
}

describe('verified workshop material from a truly retired worn item',()=>{
  it('takes both exact IDs and one actual slot, removes the original once, and recovers exactly one reusable root',()=>{
    const {world,site,patron,item,wear}=fixture();
    const id=item.id!;
    const roots=patron.herbs.earth_root, stones=patron.spiritStones;
    expect(availableArtifactSalvageActions(patron,world)).toEqual([]);
    wear();
    site.furnaceGrade=2;
    world.tick--;
    expect(availableArtifactSalvageActions(patron,world)).toEqual([]);
    expect(resolveArtifactSalvageAction(patron,world,salvage(id,site.id))).toBeNull();
    world.tick++;
    site.furnaceGrade=1;
    expect(availableArtifactSalvageActions(patron,world)).toEqual([{action:'SALVAGE_ARTIFACT',targetArtifactId:id,targetLocationId:site.id}]);
    expect(resolveArtifactSalvageAction(patron,world,salvage(id,world.locations[0].id))).toBeNull();
    expect(resolveArtifactSalvageAction(patron,world,action('SALVAGE_ARTIFACT',{targetArtifactId:id}))).toBeNull();
    expect(resolveArtifactSalvageAction(patron,world,{...salvage(id,site.id),targetCultivatorId:patron.id})).toBeNull();
    expect(world.furnaceReservations.uses.some(row=>row.kind==='salvage')).toBe(false);
    expect(resolveArtifactSalvageAction(patron,world,salvage(id,site.id))?.witnessScope).toBe('participants');
    expect(patron.artifacts).toEqual([]);
    expect(patron.spiritStones).toBe(stones);
    expect(patron.herbs.earth_root).toBe(roots+1);
    expect(world.artifactSalvages.receipts).toEqual([{artifactId:id,artifactName:item.name,ownerId:patron.id,siteId:site.id,
      tick:world.tick,tier:item.tier,durability:item.durability,maxDurability:item.maxDurability,origin:item.workshopOrigin}]);
    expect(world.furnaceReservations.uses.at(-1)).toMatchObject({kind:'salvage',actorId:patron.id,siteId:site.id,tick:world.tick});
    expect(projectResourceFlowMonth(world,world.tick,{kind:'observer'})?.rows).toContainEqual(expect.objectContaining({
      kind:'production',good:'earth_root',amount:1,mechanism:'artifact_salvage',refId:id,to:{kind:'actor',id:patron.id},
      visibility:{kind:'participants',actorIds:[patron.id]},
    }));
    expect(resolveArtifactSalvageAction(patron,world,salvage(id,site.id))).toBeNull();
    world.tick++;
    patron.artifacts.push(structuredClone(item)); // Even an invalid reinserted object cannot resurrect the consumed identity.
    expect(resolveArtifactSalvageAction(patron,world,salvage(id,site.id))).toBeNull();
    expect(patron.herbs.earth_root).toBe(roots+1);
  });

  it('uses exact retained native work for older artifacts and actual stamped provenance after legitimate history pruning',()=>{
    const {world,site,maker,patron,item,order,wear,offer,run}=fixture();
    wear();
    const origin=structuredClone(item.workshopOrigin!);
    delete item.workshopOrigin;
    expect(proveWorkshopArtifactOrigin(world,item)).toEqual(origin);
    item.workshopOrigin={...origin,finishedTick:origin.finishedTick+1};
    expect(proveWorkshopArtifactOrigin(world,item)).toBeUndefined();
    item.workshopOrigin=origin;
    for(let count=0;count<WORKSHOP_TERMINAL_LIMIT;count++){
      world.tick++;
      expect(offer()).not.toBeNull();
      const next=world.workshops.orders.at(-1)!;
      expect(run(maker,{workshopMove:'decline',targetWorkshopId:next.id})).not.toBeNull();
      advanceWorkshops(world);
    }
    expect(world.workshops.orders.some(row=>row.id===order.id)).toBe(false);
    expect(proveWorkshopArtifactOrigin(world,item)).toEqual(origin);
    const unstamped={...item,workshopOrigin:undefined};
    expect(proveWorkshopArtifactOrigin(world,unstamped)).toBeUndefined();
    expect(proveWorkshopArtifactOrigin(world,{tier:item.tier})).toBeUndefined();
    expect(resolveArtifactSalvageAction(patron,world,salvage(item.id!,site.id))).not.toBeNull();
  });

  it('fails closed for bound, soul, relic, duplicate, and occupied-furnace states without consuming a stone or root',()=>{
    const {world,site,maker,patron,heir,item,wear}=fixture();
    wear();
    const roots=patron.herbs.earth_root;
    item.boundTo=patron.id;
    expect(resolveArtifactSalvageAction(patron,world,salvage(item.id!,site.id))).toBeNull();
    delete item.boundTo;
    item.soul={name:'旧器器灵',experience:0};
    expect(resolveArtifactSalvageAction(patron,world,salvage(item.id!,site.id))).toBeNull();
    delete item.soul;
    item.relicFragmentIds=['fragment-a','fragment-b'];
    expect(resolveArtifactSalvageAction(patron,world,salvage(item.id!,site.id))).toBeNull();
    delete item.relicFragmentIds;
    heir.artifacts.push(structuredClone(item));
    expect(resolveArtifactSalvageAction(patron,world,salvage(item.id!,site.id))).toBeNull();
    heir.artifacts=[];
    const duplicateLoan={id:'exhibit-1',artifactId:item.id!,setId:'star-balance' as const,ownerId:patron.id,
      hostSectId:world.sects[0].id,hostLeaderId:world.sects[0].leaderId!,siteId:site.id,
      offeredTick:world.tick,offerExpiresTick:world.tick+3,status:'offered' as const};
    world.relicExhibits.entries.push(duplicateLoan);
    expect(resolveArtifactSalvageAction(patron,world,salvage(item.id!,site.id))).toBeNull();
    world.relicExhibits.entries.pop();
    site.furnaceGrade=0;
    expect(resolveArtifactSalvageAction(patron,world,salvage(item.id!,site.id))).toBeNull();
    site.furnaceGrade=1;
    expect(claimFurnaceUse(world,maker,site.id,'repair')).toBe(true);
    expect(resolveArtifactSalvageAction(patron,world,salvage(item.id!,site.id))).toBeNull();
    expect(world.artifactSalvages.receipts).toEqual([]);
    expect(patron.herbs.earth_root).toBe(roots);
    expect(patron.artifacts).toEqual([item]);
  });

  it('respects actual probate custody and permits only the beneficiary of the exact distributed worn article',()=>{
    const {world,site,patron,heir,item,wear}=fixture();
    wear();
    world.relationships=world.relationships.filter(row=>!((row.fromId===patron.id&&row.toId===heir.id) ||
      (row.fromId===heir.id&&row.toId===patron.id)));
    world.relationships.push({fromId:patron.id,toId:heir.id,type:'师徒',affinity:75,note:'多年共同修行'});
    expect(resolveEstateAction(world,patron,action('NAME_HEIR',{targetCultivatorId:heir.id}))).not.toBeNull();
    patron.alive=false;patron.hp=0;
    expect(captureEstate(world,patron)).not.toBeNull();
    const estate=world.estates.entries[0];
    expect(estate.holdings.artifacts).toEqual([item]);
    expect(resolveArtifactSalvageAction(heir,world,salvage(item.id!,site.id))).toBeNull();
    expect(resolveEstateAction(world,heir,action('CLAIM_ESTATE',{targetEstateId:estate.id}))).not.toBeNull();
    world.tick=estate.closesTick;
    expect(advanceEstates(world).some(event=>event.title==='遗产裁定归属')).toBe(true);
    expect(estate.holdings.artifacts).toEqual([]);
    expect(heir.artifacts).toEqual([item]);
    expect(estate.distributed.artifactIds).toEqual([item.id]);
    expect(resolveArtifactSalvageAction(heir,world,salvage(item.id!,site.id))).not.toBeNull();
    expect(world.artifactSalvages.receipts[0]).toMatchObject({artifactId:item.id,ownerId:heir.id,origin:item.workshopOrigin});
  });
});
