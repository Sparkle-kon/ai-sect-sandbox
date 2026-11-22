import type {ClanInnateTrait,ClanMove,CultivationUnion} from '../types/cultivationClan';
export const CLAN_ADULT_AGE=18;
export const CLAN_CEREMONY_QI=8;
export const CLAN_REPLY_TICKS=3;
export const CLAN_BIRTH_EARNED_MONTHS=9;
export const CLAN_MATURITY_TICKS=216;
export const CLAN_INNATE_NAMES:Readonly<Record<ClanInnateTrait,string>>={
  clear_meridians:'灵脉清明',steadfast_vessel:'灵躯坚实',keen_insight:'敏悟先觉',
};
export const clanEventId=(tick:number,unionId:string,move:ClanMove|'birth'|'mature'|'lost'|'expired')=>
  `evt-${tick}-${unionId}-${move}`;
export const clanChildActorId=(childId:string)=>`cultivator-${childId}`;

import {CLAN_INNATE_TRAITS,type ClanRoots} from '../types/cultivationClan';
import type {SpiritRoot,WorldEvent} from '../types/world';
import {fictionalGenderFor} from './fictionalPersonMetadata';
function lineageHash(seed:number,id:string){
  let n=(seed>>>0)^0x6a09e667;
  for(let i=0;i<id.length;i++)n=Math.imul(n^id.charCodeAt(i),0x01000193);
  n=Math.imul(n^(n>>>16),0x85ebca6b);
  return (n^(n>>>13))>>>0;
}
const familyNames=['沈','许','林','梁','陆','谢','杜','陈','云','乔','周','岑'];
const givenNames=['清禾','寄舟','照野','临川','闻雨','青岫','怀玉','疏月','松年','清晏','映雪','知远'];
export function clanChildInborn(seed:number,id:string,parentRoots:readonly [SpiritRoot,SpiritRoot]){
  const n=lineageHash(seed,id),[a,b]=parentRoots;
  const roots:ClanRoots=a===b?[a]:n%2?[a,b]:[b,a];
  return {roots,innateTrait:CLAN_INNATE_TRAITS[Math.floor(n/2)%CLAN_INNATE_TRAITS.length],
    gender:fictionalGenderFor(seed,id),name:familyNames[Math.floor(n/11)%familyNames.length]+givenNames[Math.floor(n/257)%givenNames.length]};
}


export function clanCeremonyEventMatches(union:CultivationUnion,event:WorldEvent):boolean{
  const receipt=union.ceremony;
  if(union.status!=='bonded'||!receipt||receipt.qiPaidEach!==CLAN_CEREMONY_QI||
    event.id!==clanEventId(receipt.tick,union.id,'ceremony')||event.tick!==receipt.tick||
    event.locationId!==union.siteId||event.category!=='diplomacy'||event.witnessScope!==undefined||
    event.actorIds.length!==2||event.actorIds[0]!==receipt.actorId||!union.parents.includes(receipt.actorId)||
    event.actorIds[1]!==union.parents.find(id=>id!==receipt.actorId))return false;
  return union.ceremonyOffer?.actorId===event.actorIds[1]&&union.ceremonyOffer.tick<receipt.tick;
}
