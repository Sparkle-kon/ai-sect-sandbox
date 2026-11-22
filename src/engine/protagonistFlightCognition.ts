import type {Cultivator,LLMDecisionPayload} from '../types/world';
import type {PilgrimageOption} from './pilgrimageEngine';

export function protagonistFlightCommand(option:PilgrimageOption){
  const {pilgrimageMove,targetPilgrimageId,targetRoadId}=option;
  return {chosenAction:'PILGRIMAGE' as const,pilgrimageMove,targetPilgrimageId,
    ...(targetRoadId===undefined?{}:{targetRoadId})};
}

const narration=(move:PilgrimageOption['pilgrimageMove']):string=>{
  switch(move){
    case 'advance':return '风越过山脊。只踏眼前认得的路，不把下一站当作已到。';
    case 'resume':return '收息起身，只接着营地点下已经认明的山路走。';
    case 'camp':return '先在眼前的山坳收住脚步，等同路人喘过这一口气。';
    case 'relieve':return '这株叶子，给此刻真正在身边的同行人。';
    case 'dismantle':return '收起营火，不把散去的同伴写作仍然同行。';
    default:return '援路既断，只认最后真正抵过的一站。';
  }
};

export function matchesProtagonistFlightOption(option:PilgrimageOption,decision:Partial<LLMDecisionPayload>):boolean{
  return decision.chosenAction==='PILGRIMAGE'&&option.pilgrimageMove===decision.pilgrimageMove&&
    option.targetPilgrimageId===decision.targetPilgrimageId&&option.targetRoadId===decision.targetRoadId&&
    option.targetCultivatorId===decision.targetCultivatorId&&option.targetLocationId===decision.targetLocationId&&
    option.targetPilgrimageNextStopId===decision.targetPilgrimageNextStopId;
}

export function exactProtagonistFlightDecision(input:unknown,options:readonly PilgrimageOption[]):LLMDecisionPayload|undefined{
  if(!input||typeof input!=='object'||Array.isArray(input))return undefined;
  const data=input as Partial<LLMDecisionPayload>;
  const option=options.find(row=>matchesProtagonistFlightOption(row,data));
  if(!option)return undefined;
  const command=protagonistFlightCommand(option);
  if(Object.keys(command).some(key=>!Object.hasOwn(data,key))||Object.keys(data).some(key=>
    !Object.hasOwn(command,key)&&key!=='innerMonologue'))return undefined;
  return {...command,innerMonologue:narration(option.pilgrimageMove)};
}

export function utilityProtagonistFlightDecision(actor:Cultivator,options:readonly PilgrimageOption[]):LLMDecisionPayload|undefined{
  const pick=(move:PilgrimageOption['pilgrimageMove'])=>options.find(row=>row.pilgrimageMove===move&&!row.targetRoadId);
  const inDanger=actor.hp<actor.maxHp*.35;
  const option=(inDanger?(pick('withdraw')??pick('camp')??pick('dismantle')):undefined)??
    pick('resume')??pick('advance')??pick('relieve')??pick('camp')??pick('withdraw')??pick('dismantle');
  return option?exactProtagonistFlightDecision(protagonistFlightCommand(option),options):undefined;
}
