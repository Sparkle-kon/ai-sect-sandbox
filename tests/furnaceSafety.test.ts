import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  availableFurnaceSafetyActions,damageFurnacesFromBeastTide,isFurnaceSafetyClosed,projectFurnaceSafety,
  resolveFurnaceSafetyAction,
} from '../src/engine/furnaceSafetyEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { advanceSpiritBeasts } from '../src/engine/spiritBeastEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator,FurnaceSafetyCase,FurnaceSafetyMove,LLMDecisionPayload } from '../src/types/world';

function atFacility(world= createInitialWorld(1717)) {
  const sect=world.sects[0],site=world.locations.find(site=>site.id===sect.headquartersId)!;
  const owner=world.cultivators.find(actor=>actor.id===sect.leaderId)!;
  const [lower,alternate]=world.cultivators.filter(actor=>actor.id!==owner.id);
  Object.assign(owner,{locationId:site.id,age:70,spiritStones:100.5});
  owner.herbs.earth_root=8;
  Object.assign(lower,{locationId:site.id,age:26,sectId:sect.id,sectRank:'内门弟子'});
  return {world,sect,site,owner,lower,alternate};
}

function byBrush(severity:1|2|3=2) {
  let {world,site}=atFacility();
  world.tick=20;
  const point={x:site.x,y:site.y};
  for(let i=0;i<severity;i++) world=applyMapBrush(world,'beast_tide',[point]);
  const part=atFacility(world);
  const hazard=world.mapHazards.find(item=>item.kind==='beast_tide')!;
  const hit=()=>damageFurnacesFromBeastTide(world,hazard);
  const act=(actor:Cultivator,furnaceSafetyMove:FurnaceSafetyMove,row:FurnaceSafetyCase,other:Partial<LLMDecisionPayload>={})=>
    resolveFurnaceSafetyAction(world,actor,{chosenAction:'FURNACE_SAFETY',innerMonologue:'实修实检',
      furnaceSafetyMove,targetFurnaceSafetyId:row.id,...other});
  const book=()=>world.resourceFlow.months.flatMap(month=>month.entries);
  return {...part,hazard,hit,act,book};
}

describe('physical furnace integrity and distinct real maintenance',()=>{
  it('authenticates canonical brush tide, blocks only after actual arrival, and never duplicates one damage case',()=>{
    const {world,site,sect,hazard,hit}=byBrush(2);
    const grade=site.furnaceGrade;
    expect(hit()).toEqual([]);
    expect(isFurnaceSafetyClosed(world,site.id)).toBe(false);
    ++world.tick;
    world.locations.push({...site,id:'obscured-counterfeit-open-facility',type:'secret_realm'});
    expect(damageFurnacesFromBeastTide(world,structuredClone(hazard))).toEqual([]);
    const original=hazard.id;
    hazard.id='fabricated-beast-tide';
    expect(hit()).toEqual([]);
    hazard.id=original;
    expect(hit()).toMatchObject([{category:'heavenly',actorIds:[],locationId:site.id}]);
    const row=world.furnaceSafety.cases[0];
    expect(row).toMatchObject({ownerAtDamage:sect.id,hazardId:hazard.id,hazardCreatedTick:20,damagedTick:21,
      severity:2,integrityBefore:100,integrity:60,receipts:[]});
    expect(hit()).toEqual([]);
    expect(isFurnaceSafetyClosed(world,site.id)).toBe(true);
    expect(site.furnaceGrade).toBe(grade);
  });

  it('actual natural凶兽 tide at severity 1 damages a real already installed same-tile owner site',()=>{
    const {world,site}=atFacility();
    world.tick=36;
    const tile=terrainTileAt(world,site.x,site.y)!;
    const adjacent={...site,id:'same-tile-wilderness',type:'spirit_vein' as const,furnaceGrade:0 as const};
    world.locations.push(adjacent);
    const beast=world.spiritBeasts.find(row=>row.kind==='凶兽')!;
    beast.locationId=adjacent.id;
    beast.tamedBy=undefined;
    advanceSpiritBeasts(world,()=>.99);
    const tide=world.mapHazards.find(hazard=>hazard.tileId===tile.id && hazard.id===`natural-beast-tide-36-${beast.id}`)!;
    expect(tide).toMatchObject({intensity:1,createdTick:36});
    expect(damageFurnacesFromBeastTide(world,tide)).toEqual([]);
    ++world.tick;
    expect(damageFurnacesFromBeastTide(world,tide)).toHaveLength(1);
    expect(world.furnaceSafety.cases[0]).toMatchObject({siteId:site.id,integrity:70,severity:1});
    expect(isFurnaceSafetyClosed(world,adjacent.id)).toBe(false);
  });

  it('requires exact genuine onsite authority and distinct inspect, repair and later safe reopening',()=>{
    const {world,site,sect,owner,lower,hazard,hit,act,book}=byBrush(3);
    const treasury=sect.spiritStones;
    const grade=site.furnaceGrade;
    ++world.tick; hit();
    const row=world.furnaceSafety.cases[0];
    expect(act(owner,'inspect',row)).toBeNull();
    expect([owner.spiritStones,owner.herbs.earth_root]).toEqual([100.5,8]);
    world.tick=hazard.expiresTick-1;
    expect(availableFurnaceSafetyActions(owner,world,world.tick+1)).toMatchObject([{furnaceSafetyMove:'inspect'}]);
    expect(availableFurnaceSafetyActions(owner,world,world.tick+2)).toEqual([]);
    ++world.tick;
    expect(act(lower,'inspect',row)).toBeNull();
    expect(act(structuredClone(owner),'inspect',row)).toBeNull();
    expect(act(owner,'inspect',row,{targetLocationId:site.id})).toBeNull();
    expect(act(owner,'repair',row)).toBeNull();
    expect(act(owner,'inspect',row)?.witnessScope).toBe('participants');
    expect(row).toMatchObject({integrity:50,receipts:[{kind:'inspect',actorId:owner.id,ownerSectId:sect.id,
      integrityBefore:50,integrityAfter:50}]});
    expect(act(owner,'repair',row)).toBeNull();
    ++world.tick;
    expect(act(owner,'repair',row)).not.toBeNull();
    expect(row.integrity).toBe(80);
    expect(act(owner,'reopen',row)).toBeNull();
    ++world.tick; ++world.tick;
    expect(act(owner,'repair',row)).not.toBeNull();
    expect(row.integrity).toBe(100);
    expect(act(owner,'reopen',row)).toBeNull();
    ++world.tick;
    const tile=terrainTileAt(world,site.x,site.y)!;
    world.mapHazards.push({id:'severe-local-miasma',kind:'cursed_miasma',tileId:tile.id,createdTick:world.tick-1,
      expiresTick:world.tick+1,intensity:2});
    expect(act(owner,'reopen',row)).toBeNull();
    ++world.tick;
    expect(act(owner,'reopen',row)).not.toBeNull();
    expect(act(owner,'reopen',row)).toBeNull();
    expect(isFurnaceSafetyClosed(world,site.id)).toBe(true);
    expect(isFurnaceSafetyClosed(world,site.id,world.tick+1)).toBe(false);
    expect(projectFurnaceSafety(world,lower)).toMatchObject({status:'reopening',integrity:100,ownReceipts:[]});
    const journal=book().filter(entry=>entry.mechanism==='furnace_safety');
    expect(journal.reduce((sum,entry)=>sum+(entry.good==='stone'?entry.amount:0),0)).toBe(18);
    expect(journal.reduce((sum,entry)=>sum+(entry.good==='earth_root'?entry.amount:0),0)).toBe(4);
    expect(journal.every(entry=>entry.kind==='consumption' && entry.visibility.kind==='participants')).toBe(true);
    expect(sect.spiritStones).toBe(treasury);
    expect(site.furnaceGrade).toBe(grade);
    expect([owner.spiritStones,owner.herbs.earth_root]).toEqual([82.5,4]);
    ++world.tick;
    expect(projectFurnaceSafety(world,owner)).toMatchObject({status:'open',integrity:100,ownReceipts:[
      {kind:'inspect'},{kind:'repair'},{kind:'repair'},{kind:'reopen'},
    ]});
  });

  it('never grants remote/ownerless authority or resets integrity on a subsequent legitimate hit',()=>{
    const setup=byBrush(2);
    let {world,site,owner,lower,hazard,hit,act}=setup;
    ++world.tick; hit();
    const row=world.furnaceSafety.cases[0];
    world.tick=hazard.expiresTick;
    const oldTitle=site.ownerSectId;
    site.ownerSectId=undefined;
    expect(act(owner,'inspect',row)).toBeNull();
    expect(isFurnaceSafetyClosed(world,site.id)).toBe(true);
    site.ownerSectId=oldTitle;
    owner.locationId=world.locations.find(other=>other.id!==site.id)!.id;
    expect(projectFurnaceSafety(world,owner,site.id)).toBeUndefined();
    expect(act(owner,'inspect',row)).toBeNull();
    owner.locationId=site.id;
    const plans=world.relocations.plans;
    plans.push({status:'in_transit',garrisonIds:[owner.id]} as (typeof plans)[number]);
    expect(act(owner,'inspect',row)).toBeNull();
    plans.pop();
    expect(act(owner,'inspect',row)).not.toBeNull();
    ++world.tick;
    expect(act(owner,'repair',row)).not.toBeNull();
    expect(row.integrity).toBe(90);
    ++world.tick;
    const successorSect=world.sects[1];
    const successor=world.cultivators.find(actor=>actor.id===successorSect.leaderId)!;
    site.ownerSectId=successorSect.id;
    successor.locationId=site.id;
    expect(act(owner,'reopen',row)).toBeNull();
    expect(act(successor,'reopen',row)).not.toBeNull();
    expect(row.receipts.at(-1)?.ownerSectId).toBe(successorSect.id);
    expect(projectFurnaceSafety(world,lower)?.ownReceipts).toEqual([]);
    ++world.tick;
    world=applyMapBrush(world,'beast_tide',[{x:site.x,y:site.y}]);
    const second=world.mapHazards.find(item=>item.kind==='beast_tide')!;
    ++world.tick;
    expect(damageFurnacesFromBeastTide(world,second)).toHaveLength(1);
    expect(world.furnaceSafety.cases.at(-1)).toMatchObject({integrityBefore:90,integrity:60,ownerAtDamage:successorSect.id});
  });
});
