import type {BanquetSeatOption} from '../types/banquetSeat';
import type {LLMDecisionPayload} from '../types/world';

const voice:Record<BanquetSeatOption['banquetSeatMove'],string>={
  attend:'今夜我亲往赴席，不代另一张椅子答应。',
  decline:'邀约我听见了，今晚只辞自己的席。',
  late:'原先的席已经收了。我若到场，只算后来到了。',
};
export const banquetSeatCommand=(option:BanquetSeatOption)=>({
  chosenAction:'BANQUET_SEAT',banquetSeatMove:option.banquetSeatMove,targetBanquetSeatId:option.targetBanquetSeatId,
} as const);
export function exactBanquetSeatDecision(raw:unknown,menu:readonly BanquetSeatOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const fields=raw as Record<string,unknown>;
  const choice=menu.find(option=>{
    const command=banquetSeatCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(fields,key)&&fields[key]===value)&&
      Object.keys(fields).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof fields[key]==='string');
  });
  return choice?{...banquetSeatCommand(choice),innerMonologue:voice[choice.banquetSeatMove]}:undefined;
}
