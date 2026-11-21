import {createInitialWorld} from '../../src/data/initialWorld';
import {createHouseholdState,initializeHouseholds} from '../../src/engine/householdEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export const FROM='village-loc-market',TO='village-loc-market-east';
export const A='npc-1',B='npc-3';
export const plot=(w:WorldState,id:string)=>w.settlements.villages.find(r=>r.id===id)!;
export const person=(w:WorldState,id:string)=>w.cultivators.find(r=>r.id===id)!;
export const town=(w:WorldState,id:string)=>w.villageEvolution.villages.find(r=>r.settlementId===id)!;
export const place=(w:WorldState,id:string)=>w.locations.find(r=>r.id===plot(w,id).locationId)!;
const payload=(chosenAction:LLMDecisionPayload['chosenAction'],args:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'确切核对实际迁居、实井与真实道路。',...args});
export const turn=(w:WorldState,action:Record<string,LLMDecisionPayload>={},mode:'utility'|'deferred'='utility')=>
  advanceWorldTick(w,Object.fromEntries(w.cultivators.map(actor=>[actor.id,action[actor.id]??payload('REST')])),()=>.99,mode);
export function wait(w:WorldState,p:(w:WorldState)=>boolean,limit=25){
  const start=w.tick;
  while(!p(w)&&w.tick-start<limit)w=turn(w);
  if(!p(w))throw Error('等待真实村镇凭据超出样本上限。');
  return w;
}

/** Only authored starting pressure/headcount/route positions and original reserves.
 * Local donors, freight, well and later demographic transactions use actual native authority. */
export function nativeCorridorFixture(ruin=false){
  let w=createInitialWorld(725,'classic');
  const from=plot(w,FROM),to=plot(w,TO);
  const fromSite=place(w,FROM),toSite=place(w,TO);
  // Deterministic two named starting sites reachable over a real short route,
  // analogous to existing native supply test fixtures. No route is pre-written.
  Object.assign(fromSite,{x:220,y:220});
  Object.assign(toSite,{x:380,y:220});
  for(const v of w.settlements.villages){v.stress=5;}
  if(ruin){
    from.population=1;
    from.volunteers=[];
  }else{
    from.juvenileCohorts=[{bornTick:1,count:3}];
  }
  to.population=88;to.capacity=102;
  w.households=createHouseholdState();initializeHouseholds(w);
  for(const [id,locationId] of [[A,fromSite.id],[B,toSite.id]]){
    const actor=person(w,id);
    actor.locationId=locationId;actor.hp=actor.maxHp;actor.spiritStones=160;
    actor.herbs.earth_root=12;actor.exploredTileIds=w.terrain.tiles.map(tile=>tile.id);
  }
  const donate=(granaryMove:'donate_roots'|'donate_stones',targetSettlementId:string)=>
    payload('VILLAGE_GRANARY',{granaryMove,targetSettlementId});
  for(let i=0;i<2;i++)w=turn(w,{[A]:donate('donate_roots',FROM),[B]:donate('donate_stones',TO)});
  w=turn(w,{[A]:payload('VILLAGE_SUPPLY',{villageSupplyMove:'offer',targetSettlementId:TO}),
    [B]:payload('VILLAGE_WORKS',{villageWorkKind:'well',targetSettlementId:TO})});
  const well=w.villageWorks.projects[0];
  if(well?.status!=='building'||well.kind!=='well'||well.settlementId!==TO)throw Error('原生付费开井未登记。');
  const agreement=w.villageSupply.agreements[0];
  if(agreement?.status!=='offered')throw Error('村仓确切互助未立约。');
  w=turn(w,{[B]:payload('VILLAGE_SUPPLY',{villageSupplyMove:'accept',targetVillageSupplyId:agreement.id})});
  w=wait(w,input=>input.villageSupply.agreements[0]?.status==='completed'&&input.villageWorks.projects[0]?.status==='completed',14);
  const actual=w.villageSupply.agreements[0];
  if(!actual.legs?.every(leg=>leg.phase==='delivered')||!actual.path||actual.path.length<4)
    throw Error('两地村仓的真实配送或沿路凭据未完成。');
  return {w,agreementId:actual.id};
}
