import {availableCivicMemorialActions} from '../src/engine/civicMemorialEngine';
import {availableSettlementActions} from '../src/engine/settlementEngine';
import type {WorldState} from '../src/types/world';
import {civicActor,civicChoice,civicMemorialFixture,civicMove,civicTurn} from './fixtures/civicMemorialFixture';

export function civicRequire(value:unknown,why:string):asserts value{if(!value)throw Error(why);}
export function civicAdditionBase(){
  // The existing seed7041 fixture discloses T20 starting controls and co-located distinct same-name volunteers.
  // From its genuine T24 paid act, all the evidence below is produced by original monthly actions.
  const initial=civicMemorialFixture();
  const {world,proposer,witness,deedId,subjectId,sameNameId,sourceEventId,other}=initial;
  const gather=civicChoice('GATHER_HERBS',{targetHerbId:'jade_leaf'});
  const retell=(chronicleReliefReading:'full_supplies'|'unfunded')=>civicChoice('CHRONICLE_ERRATA',{
    chronicleErrataMove:'retell',targetChronicleSourceId:sourceEventId,chronicleReliefReading});
  const proposed=civicTurn(world,{[proposer]:civicMove('propose',deedId),[subjectId]:gather,[sameNameId]:gather,
    [witness]:retell('full_supplies'),[other]:retell('unfunded')});
  const opened=proposed.civicMemorials.memorials.find(row=>row.deedId===deedId);
  civicRequire(opened?.status==='proposed','Native initial plaque was proposed');
  const verified=civicTurn(proposed,{[witness]:civicMove('verify',opened.id),
    'npc-1':civicChoice('CHRONICLE_ERRATA',{chronicleErrataMove:'correct',targetChronicleSourceId:sourceEventId})});
  const memorial=verified.civicMemorials.memorials.find(row=>row.id===opened.id);
  civicRequire(memorial?.status==='verified'&&memorial.verification?.tick===verified.tick,'Native initial plaque was verified');
  civicRequire(verified.chronicleErrata.corrections.some(row=>row.sourceEventId===sourceEventId&&row.editorId==='npc-1'),
    'Retained independent prior public reading and its native correction required');
  return {...initial,initial:world,proposed,world:verified,memorial};
}
export function nativeCivicNewRelief(sameNamed=false){
  const basis=civicAdditionBase();
  const id=sameNamed?basis.sameNameId:basis.subjectId;
  const selected=availableSettlementActions(civicActor(basis.world,id),basis.world).find(row=>row.action==='DELIVER_RELIEF');
  civicRequire(selected?.action==='DELIVER_RELIEF'&&selected.targetSettlementId===basis.settlementId,'Original independently funded relief is legal');
  const {action,...args}=selected;
  const world=civicTurn(basis.world,{[id]:civicChoice(action,args)});
  const deed=world.civicMemorials.deeds.find(row=>row.subjectId===id&&row.tick===world.tick);
  civicRequire(deed&&deed.stones===12&&deed.herbs===2&&deed.witnessIds.includes(basis.editor),
    'Must be independent actual locally witnessed paid relief');
  return {...basis,verified:basis.world,world,newDeed:deed};
}
export function civicAppendChoice(world:WorldState,actorId:string,memorialId:string,deedId:string){
  const choice=availableCivicMemorialActions(civicActor(world,actorId),world,world.tick+1)
    .find(row=>row.civicMemorialMove==='append_relief'&&row.targetCivicMemorialId===memorialId&&row.targetCivicDeedId===deedId);
  civicRequire(choice,'No authorized independent latest relief choice');
  const {action,...fields}=choice;
  return civicChoice(action,fields);
}
export function nativeCivicAppended(){
  const source=nativeCivicNewRelief();
  const {world,editor,memorial,newDeed}=source;
  const amended=civicTurn(world,{[editor]:civicAppendChoice(world,editor,memorial.id,newDeed.id)});
  const amendedMemorial=amended.civicMemorials.memorials.find(row=>row.id===memorial.id);
  civicRequire(amendedMemorial?.additions?.length===1,'Missing genuinely appended correction');
  return {...source,newRelief:world,world:amended,amendedMemorial};
}
