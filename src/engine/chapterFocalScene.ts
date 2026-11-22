import type {ChronicleAnchor} from '../types/world';

interface FocalEvidence {readonly score:number;readonly thread:string}
const stableId=/^[a-z0-9][a-z\d_:-]{0,239}$/iu;

/** Rank retained native facts for pacing, never infer unrecorded winners or adopt prose as authority. */
function focalEvidence(anchor:ChronicleAnchor):FocalEvidence|undefined{
  const {id,tick,year,month,category,actorIds,locationId,description,title}=anchor;
  if(!Number.isSafeInteger(tick)||tick<1||!Number.isSafeInteger(year)||year<1||
    !Number.isSafeInteger(month)||month<1||month>12||!locationId||!stableId.test(locationId)||
    ('witnessScope' in anchor&&anchor.witnessScope!==undefined)||
    actorIds.length===0||actorIds.length>12||new Set(actorIds).size!==actorIds.length||
    actorIds.some(actor=>!stableId.test(actor)))return undefined;
  const [owner,rival]=actorIds;
  const nativePrefix=`evt-${tick}-`,solo=`${nativePrefix}${owner}-`;
  if(actorIds.length===2&&(!('duelWinnerId' in anchor)||anchor.duelWinnerId===undefined||
    actorIds.some(actor=>actor===anchor.duelWinnerId))){
    const thread=`fight:${JSON.stringify([owner,rival].sort())}`;
    // This order identifies the attacker, not the winner. A defending winner reaches the same thread.
    if(id===`${solo}kill`&&category==='death')return {score:100,thread};
    if(id===`${solo}duel`&&category==='combat')return {score:72,thread};
  }
  if(actorIds.length===1){
    if(id===`${solo}tribulation-passed`&&category==='breakthrough'&&title==='天劫圆满'&&
      /渡过劫雷与心魔，踏入【(?:金丹|元婴|化神)】境！$/u.test(description))
      return {score:85,thread:`tribulation:${owner}`};
    if(id===`${solo}tribulation-failure`&&
      (category==='death'&&title==='渡劫陨落'&&description.endsWith('身死道消。')||
       category==='heavenly'&&title==='渡劫失败'&&description.endsWith('修为受挫但仍存性命。')))
      return {score:category==='death'?97:83,thread:`tribulation:${owner}`};
    // Do not confuse reversible Upper Passage or a warning with the irreversible native end.
    if(id===`${solo}ascension-succeeded`&&category==='heavenly'&&title==='九天仙门启'&&
      description==='三重真雷皆已亲历并生还；此身越过仙门，未曾陨落，也不再返回下界。')
      return {score:98,thread:`ascension:${owner}`};
    const fatalWave=id.startsWith(`${solo}ascension-failed-`)?id.slice(`${solo}ascension-failed-`.length):'';
    if(/^[1-3]$/u.test(fatalWave)&&category==='death'&&title==='飞升雷下陨落'&&
      description===`第${fatalWave}重真雷已至，原身未能承住，未入仙门。`)
      return {score:96,thread:`ascension:${owner}`};
  }
  if(actorIds.length<2||!id.startsWith(nativePrefix))return undefined;
  const key=id.slice(nativePrefix.length);
  const siege=key.match(/^(?:dip-)?(siege-([1-9]\d*)-[a-z][a-z0-9-]{1,220}?)(-front-theatre)?$/iu);
  if(!siege||!Number.isSafeInteger(Number(siege[2]))||Number(siege[2])>=tick)return undefined;
  const thread=siege[1];
  if(siege[3]&&key===`${thread}-front-theatre`&&category==='combat'&&description.startsWith('鼓声忽断。')&&
    description.includes('越出阵前，各受一击，'))return {score:76,thread};
  if(key!==`dip-${thread}`||category!=='diplomacy')return undefined;
  // The monthly siege event ID is also used for assembly/arrival, and a displaced HQ gives a
  // no-fight retreat. Only exact battle receipts below belong to the armed contest.
  if(title==='攻山告捷'&&/攻破.+防线，夺得\d+灵石战赔后撤离。$/u.test(description))return {score:94,thread};
  if(title==='攻山退兵'&&/未能攻破.+防线，联军撤退。$/u.test(description))return {score:90,thread};
  if(title==='护山阵接战'&&/^护山阵受损[1-9]\d*，尚余\d+阵力。$/u.test(description))return {score:75,thread};
  return undefined;
}

export const chapterFocalScore=(anchor:ChronicleAnchor):number=>focalEvidence(anchor)?.score??0;
/** Separates independent subjects while collapsing an actual fight/siege setup into its stronger ending. */
export const chapterFocalThreadKey=(anchor:ChronicleAnchor):string|undefined=>focalEvidence(anchor)?.thread;
