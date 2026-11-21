import {createInitialWorld} from '../../src/data/initialWorld';
import {resolveFurnaceSafetyAction} from '../../src/engine/furnaceSafetyEngine';
import {applyMapBrush} from '../../src/engine/mapBrushEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {FurnaceSafetyMove,LLMDecisionPayload,WorldState} from '../../src/types/world';

export const assurancePerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const assuranceCase=(world:WorldState,id:string)=>world.furnaceSafety.cases.find(row=>row.id===id)!;
export const assurancePayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只记录实际炉损与付料修复。',...fields});
export const assuranceChoice=(damageAssuranceMove:'seal'|'make_good',id:string)=>assurancePayload('DAMAGE_ASSURANCE',
  damageAssuranceMove==='seal'?{damageAssuranceMove,targetFurnaceSafetyId:id}:{damageAssuranceMove,targetDamageAssuranceId:id});
export const nativeSafetyChoice=(furnaceSafetyMove:FurnaceSafetyMove,targetFurnaceSafetyId:string)=>
  assurancePayload('FURNACE_SAFETY',{furnaceSafetyMove,targetFurnaceSafetyId});
export const assuranceTurn=(world:WorldState,actions:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,actions[id]??assurancePayload('REST')])),()=>.99);

export function damagedAssuranceFacility(severity:1|2|3=2){
  let world=createInitialWorld(1717);
  world.tick=20;world.month=5;
  const sect=world.sects[0],site=world.locations.find(row=>row.id===sect.headquartersId)!;
  const elder=assurancePerson(world,sect.leaderId!);
  const outsider=world.cultivators.find(row=>row.sectId!==sect.id)!;
  for(const actor of [elder,outsider]){
    actor.locationId=site.id;actor.age=36;actor.lifespan=120;actor.hp=actor.maxHp;
    actor.spiritStones=100.5;actor.herbs.earth_root=8;actor.tribulation=undefined;actor.guardAssignment=undefined;
  }
  for(let i=0;i<severity;i++)world=applyMapBrush(world,'beast_tide',[site]);
  world=assuranceTurn(world);
  const original=world.furnaceSafety.cases.find(row=>row.siteId===site.id);
  const hazard=original&&world.mapHazards.find(row=>row.id===original.hazardId);
  if(!original||!hazard)throw Error('fixture actual canonical furnace hazard');
  return {world,caseId:original.id,actorId:elder.id,outsiderId:outsider.id,siteId:site.id,sectId:sect.id,hazardExpires:hazard.expiresTick};
}
export function inspectedDamageAssurance(severity:1|2|3=2){
  const f=damagedAssuranceFacility(severity);
  let {world}=f;
  while(world.tick<f.hazardExpires-1)world=assuranceTurn(world);
  world=assuranceTurn(world,{[f.actorId]:nativeSafetyChoice('inspect',f.caseId)});
  if(assuranceCase(world,f.caseId).receipts[0]?.kind!=='inspect')throw Error('fixture actual paid inspection');
  return {...f,world};
}
export function sealedDamageAssurance(severity:1|2|3=2){
  const f=inspectedDamageAssurance(severity);
  const world=assuranceTurn(f.world,{[f.actorId]:assuranceChoice('seal',f.caseId)});
  if(!world.damageAssurance.claims[0])throw Error('fixture actual assurance seal');
  return {...f,world,claimId:world.damageAssurance.claims[0].id};
}
export function paidDamageAssurance(severity:1|2|3=2){
  const f=sealedDamageAssurance(severity);
  const world=assuranceTurn(f.world,{[f.actorId]:assuranceChoice('make_good',f.claimId)});
  if(!world.damageAssurance.claims[0]?.contributions[0])throw Error('fixture actual assurance repair');
  return {...f,world};
}
export function applyNativeAssuranceSafety(world:WorldState,actorId:string,caseId:string,move:FurnaceSafetyMove){
  return resolveFurnaceSafetyAction(world,assurancePerson(world,actorId),nativeSafetyChoice(move,caseId));
}
