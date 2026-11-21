import {createInitialWorld} from '../../src/data/initialWorld';
import {resolveToolLoanAction} from '../../src/engine/toolLoanEngine';
import {resolveWorkshopAction} from '../../src/engine/workshopEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,ToolLoanMove,WorldState} from '../../src/types/world';

export const toolPerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const toolJob=(world:WorldState,id:string)=>world.workshops.orders.find(row=>row.id===id)!;
export const toolPayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按托管实物与本次工序凭据办理。',...fields});
export const toolChoice=(toolLoanMove:Exclude<ToolLoanMove,'offer'>,targetToolLoanId:string)=>
  toolPayload('TOOL_LOAN',{toolLoanMove,targetToolLoanId});
export const toolWork=(targetWorkshopId:string,targetToolLoanId?:string)=>
  toolPayload('WORKSHOP',{workshopMove:'work',targetWorkshopId,...(targetToolLoanId ? {targetToolLoanId}:{})});
export const toolTurn=(world:WorldState,choices:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,choices[id]??toolPayload('REST')])),()=>.99);

export function offeredToolLoan(){
  const world=createInitialWorld(9301);
  world.tick=22;world.month=5;
  const home=world.sects.find(row=>row.id==='sect-danxia')!;
  const site=world.locations.find(row=>row.id===home.headquartersId)!;
  const [maker,lender,outsider]=world.cultivators.filter(row=>row.sectId!==home.id&&
    !world.sects.some(sect=>sect.leaderId===row.id));
  for (const actor of world.cultivators) actor.locationId='loc-market';
  for(const actor of [maker,lender,outsider]){
    actor.age=33;actor.lifespan=120;actor.locationId=site.id;actor.hp=actor.maxHp;
    actor.spiritStones=500;actor.herbs.earth_root=12;actor.techniqueMastery=72;
    actor.artifacts=[];actor.tribulation=undefined;actor.guardAssignment=undefined;
  }
  outsider.locationId='loc-market';
  maker.spiritRoot=site.spiritRoot;
  home.facilities.alchemy_hall=1;
  site.furnaceGrade=1;
  function fund(){
    world.tick++;
    if(!resolveWorkshopAction(world,lender,toolPayload('WORKSHOP',{workshopMove:'offer',targetCultivatorId:maker.id,
      workshopTier:'法器',workshopQuantity:1,workshopQualityFloor:'standard'}),()=>.99))throw Error('fixture commission offer');
    const id=world.workshops.orders.at(-1)!.id;
    world.tick++;
    if(!resolveWorkshopAction(world,maker,toolPayload('WORKSHOP',{workshopMove:'accept',targetWorkshopId:id}),()=>.99))
      throw Error('fixture true commissioning escrow');
    return id;
  }
  const sourceOrderId=fund();
  for(let i=0;i<2;i++){
    world.tick++;
    if(!resolveWorkshopAction(world,maker,toolWork(sourceOrderId),()=>.99))throw Error('fixture authentic tool manufacture');
  }
  const item=lender.artifacts[0];
  if(!item?.id||!item.workshopOrigin)throw Error('fixture genuine workshop-origin item');
  const workshopId=fund();
  world.tick++;
  if(!resolveToolLoanAction(world,lender,toolPayload('TOOL_LOAN',
    {toolLoanMove:'offer',targetArtifactId:item.id,targetWorkshopId:workshopId})))throw Error('fixture real loan offer');
  const row=world.toolLoans.loans[0];
  outsider.locationId=site.id;
  return {world,id:row.id,lenderId:lender.id,borrowerId:maker.id,outsiderId:outsider.id,siteId:site.id,
    workshopId,sourceOrderId,artifactId:item.id};
}
export function acceptedToolLoan(){
  const f=offeredToolLoan();
  f.world.tick++;
  if(!resolveToolLoanAction(f.world,toolPerson(f.world,f.borrowerId),toolChoice('accept',f.id)))throw Error('fixture true custody');
  return f;
}
export function preparedToolFinish(){
  const f=acceptedToolLoan(),maker=toolPerson(f.world,f.borrowerId);
  f.world.tick++;
  if(!resolveWorkshopAction(f.world,maker,toolWork(f.workshopId),()=>.99))throw Error('fixture valid unassisted blank');
  return f;
}
export function usedToolLoan(){
  const f=preparedToolFinish();
  const world=toolTurn(f.world,{[f.borrowerId]:toolWork(f.workshopId,f.id)});
  if(!world.toolLoans.loans[0].wear)throw Error('fixture valid tool-assisted finish');
  return {...f,world};
}
