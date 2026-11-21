import {expect} from 'vitest';
import {createInitialWorld} from '../../src/data/initialWorld';
import {resolvePavilionLoanAction} from '../../src/engine/pavilionLoanEngine';
import {resolveScriptureAction} from '../../src/engine/scriptureEngine';
import {authorTechnique,gainMastery,studyTechnique} from '../../src/engine/techniqueEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,PavilionLoanMove,WorldState} from '../../src/types/world';

export const pavilionChoice=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'实核原卷、坐值与借本。'});
export const pavilionMove=(pavilionLoanMove:PavilionLoanMove,id?:string)=>pavilionChoice('PAVILION_LOAN',{
  pavilionLoanMove,...(pavilionLoanMove==='shelve'||pavilionLoanMove==='checkout'?{targetScriptureEditionId:id}:
    pavilionLoanMove==='read'||pavilionLoanMove==='return'?{targetPavilionLoanId:id}:{})});
const rest=pavilionChoice('REST');
export const pavilionActor=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
export const pavilionTurn=(world:WorldState,options:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,options[id]??rest])),()=>.99);
export const pavilionAct=(world:WorldState,id:string,action:LLMDecisionPayload)=>resolvePavilionLoanAction(world,pavilionActor(world,id),action);

export function pavilionNativeEdition(){
  const world=createInitialWorld(9301);
  world.tick=22;world.month=5;
  const sect=world.sects.find(row=>row.id==='sect-danxia')!;
  const clerk=pavilionActor(world,sect.leaderId!);
  const [annotator,corrector,rival]=world.cultivators.filter(row=>row.sectId===sect.id&&row.id!==clerk.id);
  const site=world.locations.find(row=>row.id===sect.headquartersId)!;
  for(const actor of [clerk,annotator,corrector,rival]){
    actor.locationId=site.id;actor.hp=actor.maxHp;actor.spiritStones=300;actor.tribulation=undefined;
  }
  sect.facilities.scripture_pavilion=1;
  clerk.realm='元婴';clerk.techniqueMastery=84;
  expect(authorTechnique(clerk,world)).not.toBeNull();
  const originalId=clerk.technique.id!;
  for(const actor of [annotator,corrector,rival])expect(studyTechnique(actor,world,originalId)).not.toBeNull();
  gainMastery(annotator,15);
  gainMastery(corrector,49);
  expect(resolveScriptureAction(world,annotator,pavilionChoice('SCRIPTURE',{editionMove:'annotate',targetScriptureOriginalId:originalId}))).not.toBeNull();
  const parent=world.scriptures.editions.at(-1)!;
  expect(parent.kind).toBe('misread');
  const stones=corrector.spiritStones;
  expect(resolveScriptureAction(world,corrector,pavilionChoice('SCRIPTURE',{editionMove:'compare',targetScriptureEditionId:parent.id}))).not.toBeNull();
  expect(corrector.spiritStones).toBe(stones-25);
  const edition=world.scriptures.editions.at(-1)!;
  expect(edition).toMatchObject({kind:'corrected',originalId,parentEditionId:parent.id,
    evidence:{kind:'pavilion',locationId:site.id,sectId:sect.id}});
  return {world,sectId:sect.id,siteId:site.id,clerk:clerk.id,author:corrector.id,borrower:annotator.id,rival:rival.id,
    originalId,editionId:edition.id};
}
export function pavilionLoanCheckedOutFixture(){
  const f=pavilionNativeEdition();
  const {world,clerk,author,borrower,editionId}=f;
  expect(pavilionAct(world,clerk,pavilionMove('staff'))).not.toBeNull();
  const shelved=pavilionTurn(world,{[author]:pavilionMove('shelve',editionId)});
  expect(shelved.pavilionLoans.copies[0]).toMatchObject({editionId,shelvedTick:shelved.tick});
  const checked=pavilionTurn(shelved,{[clerk]:pavilionMove('staff'),[borrower]:pavilionMove('checkout',editionId)});
  const loan=checked.pavilionLoans.loans[0];
  expect(loan).toMatchObject({editionId,borrowerId:borrower,checkoutTick:checked.tick,dueTick:checked.tick+4});
  return {...f,world:checked,loanId:loan.id};
}
