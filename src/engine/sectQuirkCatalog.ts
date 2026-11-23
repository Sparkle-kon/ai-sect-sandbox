import {SECT_QUIRK_IDS,SECT_QUIRK_NAMES,type SectQuirkId} from '../types/sectManagement';

export const SECT_JOB_IDS=['gather','explore','cultivate','stall','kitchen','guard','deliver','recruit','challenge','matchmaking'] as const;
export type SectJobId=typeof SECT_JOB_IDS[number];
export type QuirkOrdinaryAction='REST'|'CULTIVATE'|'SOCIALIZE'|'EXPLORE'|'GATHER_HERBS';
export interface SectJobModifiers {readonly success:number;readonly mishap:number;readonly windfall:number}
export interface SectQuirkDefinition {
  readonly id:SectQuirkId;readonly name:string;readonly blurb:string;
  readonly jobModifiers:Readonly<Partial<Record<SectJobId,SectJobModifiers>>>;
  readonly comedyTags:readonly string[];
  readonly ordinaryBias:Readonly<Partial<Record<QuirkOrdinaryAction,number>>>;
}
const odds=(success:number,mishap:number,windfall:number):SectJobModifiers=>({success,mishap,windfall});
const quirk=(id:SectQuirkId,blurb:string,jobModifiers:SectQuirkDefinition['jobModifiers'],
  comedyTags:readonly string[],ordinaryBias:SectQuirkDefinition['ordinaryBias']):SectQuirkDefinition=>
  ({id,name:SECT_QUIRK_NAMES[id],blurb,jobModifiers,comedyTags,ordinaryBias});

export const SECT_QUIRK_CATALOG:Readonly<Record<SectQuirkId,SectQuirkDefinition>>={
  glutton:quirk('glutton','修为平平，十里外谁家炖肉倒是一闻便知。',
    {gather:odds(0,10,15),kitchen:odds(25,-5,10)},['food','distracted'],{GATHER_HERBS:7,REST:3}),
  lost:quirk('lost','从未准时到过约定之地，却总能到点别处。',
    {gather:odds(-20,20,20),deliver:odds(-30,25,10),explore:odds(-8,12,9)},['wrong_place','stumble_upon'],{EXPLORE:10}),
  shy:quirk('shy','剑法尚可，就是不大愿对手瞧着。',
    {stall:odds(-25,10,0),cultivate:odds(15,0,5),matchmaking:odds(-14,13,3)},['awkward','hide'],{CULTIVATE:10,SOCIALIZE:-12}),
  chatterbox:quirk('chatterbox','一张嘴能把仇家说成朋友，也能倒着来。',
    {recruit:odds(20,15,10),stall:odds(15,10,5)},['talk','gossip'],{SOCIALIZE:13,CULTIVATE:-3}),
  miser:quirk('miser','算盘打得比剑快，连桌上掉的米也记得是哪粒。',
    {stall:odds(25,5,10),deliver:odds(8,-4,5)},['money','haggle'],{GATHER_HERBS:10}),
  drama:quirk('drama','寻常送一封信，回来能讲成三折戏。',
    {challenge:odds(4,12,14),recruit:odds(8,12,6),deliver:odds(-8,10,4)},['theatre','talk'],{SOCIALIZE:10,EXPLORE:3}),
  contrarian:quirk('contrarian','众人都称有理，他便要找出那句没理的。',
    {guard:odds(5,8,2),recruit:odds(-10,12,5),challenge:odds(8,9,8)},['argument','gossip'],{SOCIALIZE:-7,EXPLORE:7}),
  lovestruck:quirk('lovestruck','回山只说遇见一位道友，问了半宿才知差事如何。',
    {matchmaking:odds(18,9,12),deliver:odds(-8,10,3)},['romance','distracted'],{SOCIALIZE:11,REST:-3}),
  jinx:quirk('jinx','他说天晴，大伙便把晾在檐下的衣裳收了。',
    {},['jinx','prophecy'],{REST:6,EXPLORE:-4}),
  neat_freak:quirk('neat_freak','瓷碗都照花纹排好，才肯想起锅下还烧着火。',
    {kitchen:odds(20,6,6),guard:odds(10,-6,5),gather:odds(4,-5,4)},['order','food'],{GATHER_HERBS:7,CULTIVATE:4}),
  chuunibyou:quirk('chuunibyou','出剑前先报招名，报完常发现对手已收了剑。',
    {challenge:odds(12,14,18),cultivate:odds(12,-3,8),guard:odds(-4,7,2)},['sword','theatre'],{CULTIVATE:12,EXPLORE:5}),
  coward_king:quirk('coward_king','遇事先退三步，因此总有下一回。',
    {guard:odds(-15,5,0),explore:odds(0,-20,-5)},['flee','survive'],{REST:12,EXPLORE:-13}),
};

export function canonicalSectQuirks(ids:readonly SectQuirkId[]|undefined):readonly SectQuirkId[]{
  if(!ids||ids.length===0||ids.length>2||new Set(ids).size!==ids.length||ids.some(id=>!SECT_QUIRK_IDS.includes(id)))return [];
  return SECT_QUIRK_IDS.filter(id=>ids.includes(id));
}
const clamp=(value:number,cap:number)=>Math.max(-cap,Math.min(cap,value));
export function combineSectJobModifiers(ids:readonly SectQuirkId[]|undefined,job:SectJobId):SectJobModifiers{
  const sum={success:0,mishap:0,windfall:0};
  for(const id of canonicalSectQuirks(ids)){
    const effect=SECT_QUIRK_CATALOG[id].jobModifiers[job];
    if(effect){sum.success+=effect.success;sum.mishap+=effect.mishap;sum.windfall+=effect.windfall;}
  }
  return odds(clamp(sum.success,40),clamp(sum.mishap,40),clamp(sum.windfall,40));
}
export function sectQuirkComedyTags(ids:readonly SectQuirkId[]|undefined):readonly string[]{
  return [...new Set(canonicalSectQuirks(ids).flatMap(id=>SECT_QUIRK_CATALOG[id].comedyTags))];
}
export function sectQuirkOrdinaryBias(ids:readonly SectQuirkId[]|undefined,action:QuirkOrdinaryAction):number{
  return clamp(canonicalSectQuirks(ids).reduce((sum,id)=>sum+(SECT_QUIRK_CATALOG[id].ordinaryBias[action]??0),0),16);
}
