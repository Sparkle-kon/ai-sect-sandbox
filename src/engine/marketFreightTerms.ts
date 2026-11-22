import type {MarketFreightQuote} from '../types/marketFreight';
import type {CultivationRealm,MarketGood} from '../types/world';

const LOAD:Record<MarketGood,number>={jade_leaf:1,earth_root:3,star_bloom:2,shadow_moss:2,
  foundation:2,golden:3,barrier:4,heart_poison:4};
const RANK:Record<CultivationRealm,number>={'练气':0,'筑基':1,'金丹':2,'元婴':3,'化神':4,'炼虚':5,'合体':6,'大乘':7,'渡劫':8};
export const MARKET_FREIGHT_MAX_LOAD=24;
export const MARKET_FREIGHT_DISPATCH_TICKS=3;
export function marketFreightQuote(good:MarketGood,quantity:number):MarketFreightQuote|undefined {
  const load=LOAD[good]*quantity;
  if(!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(load)||load>MARKET_FREIGHT_MAX_LOAD)return undefined;
  const band=load<=4?'light':load<=10?'medium':'heavy';
  const factor=band==='light'?0:band==='medium'?1:2;
  return {good,quantity,load,band,fee:8+2*load+2*factor,rations:2+factor};
}
export function marketFreightCapacity(realm:CultivationRealm,stage:number):number{
  if(!Number.isInteger(stage)||stage<1||stage>9||!Object.hasOwn(RANK,realm))return 0;
  return Math.min(MARKET_FREIGHT_MAX_LOAD,6+2*RANK[realm]+Math.floor(stage/3));
}
