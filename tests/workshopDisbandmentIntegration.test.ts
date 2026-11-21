import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectResourceFlowMonth } from '../src/engine/resourceFlowEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorkshopInstitutionClosures, workshopTerms } from '../src/engine/workshopEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const choice=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload =>
  ({chosenAction,innerMonologue:'按现实地点、旧章与实物凭据办结。',...fields});
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const turn=(world:WorldState,moves:Record<string,LLMDecisionPayload>={},reverse=false)=>{
  const input=structuredClone(world);
  if(reverse) input.cultivators.reverse();
  return advanceWorldTick(input,Object.fromEntries(input.cultivators.map(({id})=>[id,moves[id]??choice('REST')])),()=>.99);
};
const job=(move:'accept'|'work',targetWorkshopId:string)=>choice('WORKSHOP',{workshopMove:move,targetWorkshopId});
const offer=(targetCultivatorId:string)=>choice('WORKSHOP',{workshopMove:'offer',targetCultivatorId,
  workshopTier:'法器',workshopQuantity:2,workshopQualityFloor:'standard'});
const locate=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
const orderAt=(world:WorldState,id:string)=>world.workshops.orders.find(row=>row.id===id)!;

function fixture(short=false){
  const world=createInitialWorld(51);
  world.tick=24;
  world.month=5;
  const sect=world.sects[0];
  const origin=locate(world,sect.headquartersId);
  const destination=locate(world,'loc-vein-north');
  const owner=person(world,sect.leaderId!);
  const [maker,patron,elder]=world.cultivators.filter(row=>row.sectId===sect.id&&row.id!==owner.id)
    .sort((a,b)=>a.id<b.id?-1:1);
  const source=terrainTileAt(world,origin.x,origin.y)!;
  const target=short ? source : world.terrain.tiles.find(row=>row.row===source.row&&row.col===source.col+1)!;
  destination.x=short ? origin.x+1 : (target.col+.5)*1000/world.terrain.columns;
  destination.y=short ? origin.y : (target.row+.5)*600/world.terrain.rows;
  delete destination.ownerSectId;
  if(!short) delete target.ownerSectId;
  for(const row of world.cultivators)row.locationId='loc-market';
  for(const row of [owner,maker,patron,elder]){
    row.locationId=origin.id;
    row.hp=row.maxHp;
    row.spiritStones=300;
    row.herbs.earth_root=12;
    row.artifacts=[];
    row.qiProgress=20;
    row.tribulation=undefined;
    row.techniqueMastery=70;
  }
  maker.sectRank=patron.sectRank=elder.sectRank='长老';
  owner.exploredTileIds.push(target.id);
  sect.facilities.alchemy_hall=1;
  sect.facilities.defense_array=2;
  sect.arrayMaxHp=400;
  sect.arrayHp=0;
  sect.spiritStones=500;
  origin.furnaceGrade=1;
  origin.herbs.earth_root=Math.max(3,origin.herbs.earth_root);
  destination.furnaceGrade=0;
  return {world,sectId:sect.id,old:origin.id,next:destination.id,owner:owner.id,
    maker:maker.id,patron:patron.id,elder:elder.id};
}
const propose=(targetLocationId:string)=>choice('RELOCATE',{relocationMove:'propose',targetLocationId});
const vote=(targetRelocationId:string)=>choice('RELOCATE',{relocationMove:'approve',targetRelocationId});

describe('real old charter closure and existing workshop custody',()=>{
  it.each([false,true])('returns exactly the unworked balance upon actual arrival (reversed = %s)',reverse=>{
    const {world,sectId,old,next,owner,maker,patron,elder}=fixture();
    const offered=turn(world,{[patron]:offer(maker)},reverse);
    const order=offered.workshops.orders[0];
    expect(order).toMatchObject({siteId:old,institution:{sectId,establishedTick:0},status:'offered',escrowStones:0});
    const funded=turn(offered,{[maker]:job('accept',order.id)},reverse);
    const escrow=orderAt(funded,order.id);
    const terms=workshopTerms('法器',2);
    expect(escrow).toMatchObject({status:'active',escrowStones:terms.totalStones,escrowHerbs:4});
    const opened=turn(funded,{[owner]:propose(next),[maker]:job('work',order.id)},reverse);
    const plan=opened.relocations.plans[0];
    expect(plan).toMatchObject({status:'voting',originId:old,destinationId:next});
    expect(opened.workshopDisbandments.closures).toEqual([]);
    const consent=turn(opened,{[patron]:vote(plan.id),[elder]:vote(plan.id),[maker]:job('work',order.id)},reverse);
    const partial=orderAt(consent,order.id);
    expect(partial.work).toHaveLength(2);
    expect(partial.work[1]).toMatchObject({feePaid:terms.feePerPiece,artifactId:expect.any(String)});
    const product=partial.work[1].artifactId!;
    expect(person(consent,patron).artifacts.filter(row=>row.id===product)).toHaveLength(1);
    const departed=turn(consent,{},reverse);
    expect(departed.relocations.plans[0].status).toBe('in_transit');
    expect(departed.workshopDisbandments.closures).toEqual([]);
    let arrived=departed;
    for(let count=0;count<4&&arrived.relocations.plans[0].status==='in_transit';count++){
      arrived=turn(arrived,{[maker]:job('work',order.id)},reverse);
    }
    expect(arrived.relocations.plans[0]).toMatchObject({status:'settled',settledTick:arrived.tick});
    expect(arrived.tick).toBeLessThan(escrow.deadlineTick!);
    expect(arrived.workshopDisbandments.closures).toEqual([{
      id:`workshop-disband-${plan.id}`,planId:plan.id,abandonedSiteId:`abandoned-${plan.id}`,sectId,originId:old,
      destinationId:next,tick:arrived.tick,voidedOfferIds:[],returns:[{orderId:order.id,patronId:patron,makerId:maker,
        acceptedTick:escrow.acceptedTick,tier:'法器',quantity:2,workCount:2,consumedStones:terms.fuelPerPiece,
        consumedHerbs:2,paidWages:terms.feePerPiece,refundedStones:partial.escrowStones,refundedHerbs:2}],
    }]);
    expect(orderAt(arrived,order.id)).toMatchObject({siteId:old,status:'cancelled',closeReason:'institution_closed',
      disbandmentId:`workshop-disband-${plan.id}`,settledTick:arrived.tick,work:partial.work,
      refundedStones:partial.escrowStones,refundedHerbs:2,escrowStones:0,escrowHerbs:0});
    expect(person(arrived,patron).artifacts.filter(row=>row.id===product)).toHaveLength(1);
    expect(person(arrived,maker).locationId).toBe(next);
    expect(person(arrived,patron).locationId).toBe(next);
    expect(locate(arrived,old).ownerSectId).toBeUndefined();
    expect(locate(arrived,old).furnaceGrade).toBe(1);
    expect(arrived.sects.find(row=>row.id===sectId)?.facilities.alchemy_hall).toBe(0);
    const refund=projectResourceFlowMonth(arrived,arrived.tick,{kind:'observer'})?.rows.filter(
      row=>row.refId===order.id&&row.reason==='workshop_refund');
    expect(refund?.map(({good,amount})=>[good,amount])).toEqual([['stone',partial.escrowStones],['earth_root',2]]);
    if(!reverse) {
      const wire=encodeWorldSave(arrived);
      expect(decodeWorldSave(wire).workshopDisbandments).toEqual(arrived.workshopDisbandments);
      const forged=JSON.parse(wire) as {world:WorldState};
      forged.world.workshopDisbandments.closures[0].returns[0].refundedStones++;
      expect(()=>decodeWorldSave(JSON.stringify(forged))).toThrow('workshopDisbandments.closure.return');
    }
    const frozen=structuredClone(arrived.workshopDisbandments);
    expect(advanceWorkshopInstitutionClosures(arrived)).toEqual([]);
    expect(turn(arrived).workshopDisbandments).toEqual(frozen);
  });

  it('leaves paid work independent when a real route is aborted without relinquishing the old title',()=>{
    const {world,sectId,old,next,owner,maker,patron,elder}=fixture();
    const offered=turn(world,{[patron]:offer(maker)});
    const order=offered.workshops.orders[0];
    const funded=turn(offered,{[maker]:job('accept',order.id)});
    const opened=turn(funded,{[owner]:propose(next)});
    const route=opened.relocations.plans[0];
    const voted=turn(opened,{[patron]:vote(route.id),[elder]:vote(route.id)});
    const departed=turn(voted);
    expect(departed.relocations.plans[0].status).toBe('in_transit');
    locate(departed,next).ownerSectId=departed.sects[1].id;
    const aborted=turn(departed,{[maker]:job('work',order.id)});
    expect(aborted.relocations.plans[0].status).toBe('aborted');
    expect(aborted.relocations.abandonedSites).toEqual([]);
    expect(aborted.workshopDisbandments.closures).toEqual([]);
    expect(locate(aborted,old).ownerSectId).toBe(sectId);
    expect(orderAt(aborted,order.id)).toMatchObject({status:'active',refundedStones:0,refundedHerbs:0,
      work:[{stage:'blank',tick:aborted.tick}]});
  });

  it('voids an actual unpaid offer but not a private workshop with a genuinely nonmember maker',()=>{
    const {world,sectId,old,next,owner,maker,patron,elder}=fixture(true);
    const opened=turn(world,{[owner]:propose(next)});
    const plan=opened.relocations.plans[0];
    const queued=turn(opened,{[patron]:offer(maker),[elder]:vote(plan.id)});
    expect(applyCultivatorBrainDecision(queued,person(queued,maker),vote(plan.id),()=>.99)).not.toBeNull();
    const order=queued.workshops.orders[0];
    expect(order).toMatchObject({status:'offered',institution:{sectId,establishedTick:0},escrowStones:0});
    const privateMaker=person(queued,maker);
    const privatePatron=person(queued,owner);
    privateMaker.sectId='';
    expect(applyCultivatorBrainDecision(queued,privatePatron,offer(maker),()=>.99)).not.toBeNull();
    const privateOrder=queued.workshops.orders.at(-1)!;
    expect(privateOrder.siteId).toBe(old);
    expect(privateOrder.institution).toBeUndefined();
    privateMaker.sectId=sectId;
    const departed=turn(queued);
    expect(departed.relocations.plans[0].status).toBe('in_transit');
    const arrived=turn(departed);
    expect(arrived.relocations.plans[0].status).toBe('settled');
    expect(arrived.workshopDisbandments.closures[0]).toMatchObject({returns:[],voidedOfferIds:[order.id]});
    expect(orderAt(arrived,order.id)).toMatchObject({status:'cancelled',closeReason:'institution_closed',refundedStones:0,refundedHerbs:0});
    expect(orderAt(arrived,privateOrder.id)).toMatchObject({status:'offered',siteId:old});
    expect(orderAt(arrived,privateOrder.id).disbandmentId).toBeUndefined();
  });
});
