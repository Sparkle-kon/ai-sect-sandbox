import type {AscensionStance,AscensionWaveNumber} from '../types/ascension';
export const IMMORTAL_ASCENSION_ADDRESS='immortal-plane';
export const ASCENSION_OPEN_QI=15;
export const ASCENSION_RETRY_TICKS=6;
export const ASCENSION_TRIAL_HISTORY=8;
export const ASCENSION_WAVES=3;
export const ASCENSION_QI:Readonly<Record<AscensionStance,4|8>>={guard:8,advance:4};
const fractions:Readonly<Record<AscensionStance,readonly [number,number,number]>>={
  guard:[.19,.24,.32],advance:[.24,.32,.39],
};
export const ascensionDamage=(maxHp:number,wave:AscensionWaveNumber,stance:AscensionStance):number=>
  Math.max(1,Math.round(maxHp*fractions[stance][wave-1]));
export const ascensionTrialId=(actorId:string,tick:number)=>`ascension-${actorId}-${tick}`;
export type AscensionEventToken='warning'|'retreated'|'succeeded'|'interrupted'|`wave-${AscensionWaveNumber}`|`failed-${AscensionWaveNumber}`;
export const ascensionEventId=(actorId:string,tick:number,token:AscensionEventToken)=>`evt-${tick}-${actorId}-ascension-${token}`;
