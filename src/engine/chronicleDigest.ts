import type { CausalChronicleKind, CausalChronicleRelation, ChronicleAnchor, ChronicleReading, Cultivator, WorldEvent, WorldState } from '../types/world';
import { publicChronicleChapters } from './coldHistoryEngine';
import { isChronicleStoryFact, publicChronicleSceneEvents } from './chronicleLead';
import { writeChronicleScene } from './chronicleScene';
import { collectDigestEvidence } from './chronicleDigestEvidence';
import { buildCausalChronicleChain } from './chronicleCausalityEngine';
import { visibleChronicleErrata } from './chronicleErrataEngine';
import { courierCheckpoint } from './sealedCourierEngine';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import { expeditionRescueCheckpoint } from './expeditionRescueCheckpoint';

export type ChronicleDigestTopic = 'chapters' | 'villages' | 'market';
export type ChronicleDigestWindow = 'near' | 'long' | 'retained';
export interface ChronicleDigestEntry {
  id: string; topic: ChronicleDigestTopic; group: string; tick: number; title: string; paragraph: string;
  proof: {
    label: string; sourceId: string; original?: string;
    fields?: readonly {label:string;value:string}[];
    earlier?: readonly {id:string;tick:number;label:string;relation:string}[];
    interpretations?: readonly {id:string;tick:number;label:string;reading:string}[];
  };
}

const topicNames: Record<WorldEvent['category'],string> = {
  breakthrough:'破境与机缘',combat:'争锋与斗法',death:'道消与告别',
  diplomacy:'相逢与交涉',intrigue:'暗线与纷争',heavenly:'山河异动',
};
const windows:Record<ChronicleDigestWindow,number|undefined> = {near:12,long:48,retained:undefined};
const excerpt = (s:string,n:number) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,n);
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const audienceKey=(ids:readonly string[])=>JSON.stringify([...new Set(ids)].slice(0,12));
const sameSource=(a:ChronicleAnchor,b:ChronicleAnchor|WorldEvent)=>a.tick===b.tick && a.locationId===b.locationId &&
  a.category===b.category && a.title===excerpt(b.title,80) && a.description===excerpt(b.description,220) &&
  audienceKey(a.actorIds)===audienceKey(b.actorIds);

const causeKind:Record<CausalChronicleKind,string> = {siege_launched:'围攻实录',truce_signed:'停战实录',
  sect_vacancy:'职位空缺实录',sect_election:'宗门选举实录',market_buy_order:'实际买单',market_sell_order:'实际卖单',
  market_shipment:'启程实录',market_settlement:'交割实录'};
const relationKind:Record<CausalChronicleRelation,string> = {withdrew_siege:'撤回这场围攻',filled_vacancy:'填补这个空缺',
  matched_buy_order:'撮合这张买单',matched_sell_order:'撮合这张卖单',settled_shipment:'结算这趟商队'};

function chapterEvidence(world:WorldState,viewer:Cultivator,fromTick:number,throughTick:number):ChronicleDigestEntry[] {
  const currentIds=new Set(world.events.map(({id})=>id));
  const live=new Map(publicChronicleSceneEvents(world).map(fact=>[fact.id,fact]));
  const byId=new Map<string,{source:ChronicleAnchor;chapterNumber:number}>();
  const conflicted=new Set<string>();
  const activeCause = new Set(world.chronicleCausality.nodes.map(({eventId})=>eventId));
  const board = courierCheckpoint(world,viewer) || boundaryReliefCheckpoint(world,viewer) || expeditionRescueCheckpoint(world,viewer) ?
    [] : visibleChronicleErrata(world,viewer);
  const visibleDockets = new Map(board.map((docket)=>[docket.source.sourceEventId,docket]));
  const names = new Map(world.cultivators.map(({id,name})=>[id,name]));
  const reading = (claim:ChronicleReading) => {
    if(claim.kind==='relief') return claim.delivery==='full_supplies'?'认为物资已实拨':'认为物资未实拨';
    const name=names.get(claim.winnerId);
    return name?`认为${name}获胜`:'未能核实当事人身份';
  };
  for(const chapter of publicChronicleChapters(world)){
    if(chapter.endTick<fromTick || chapter.startTick>throughTick || chapter.endTick>world.tick) continue;
    for(const source of chapter.anchors) {
      if(source.tick<fromTick || source.tick<chapter.startTick || source.tick>chapter.endTick ||
        !isChronicleStoryFact(source,throughTick)) continue;
      const current=live.get(source.id);
      if(currentIds.has(source.id)&&(!current||!sameSource(source,current))) {
        conflicted.add(source.id);
        continue;
      }
      const prior=byId.get(source.id);
      if(prior && !sameSource(prior.source,source)) conflicted.add(source.id);
      if(!prior) byId.set(source.id,{source,chapterNumber:chapter.chapterNumber});
    }
  }
  return [...byId.entries()].flatMap(([id,{source,chapterNumber}])=>{
    if(conflicted.has(id))return [];
    const scene=writeChronicleScene(source);
    const chain=activeCause.has(id)?buildCausalChronicleChain(world,id,viewer.id):undefined;
    const docket=visibleDockets.get(id);
    const interpretations=docket?.retellings.filter(row=>row.tick<=throughTick).map(row=>(
      {id:row.id,tick:row.tick,label:'未核实的独立传本',reading:reading(row.reading)})) ?? [];
    if(docket?.correction && docket.correction.tick<=throughTick) interpretations.push({
      id:docket.correction.id,tick:docket.correction.tick,label:'另附已核定的勘误',reading:reading(docket.correction.reading),
    });
    const earlier=chain?.previous.filter(({node})=>node.entry.tick<=throughTick).map(({relation,node})=>(
      {id:node.entry.eventId,tick:node.entry.tick,label:causeKind[node.entry.kind],relation:relationKind[relation]}));
    return [{id,topic:'chapters',group:topicNames[source.category],tick:source.tick,...scene,
      proof:{label:'本章所附公开实录',sourceId:id,original:source.description,
        fields:[{label:'来源章目',value:`第${chapterNumber}章`},{label:'原始标题',value:source.title},
          {label:'原始日期',value:`仙历${source.year}年${source.month}月`}],
        ...(earlier?.length?{earlier}:{}),...(interpretations.length?{interpretations}:{})}}];
  });
}

/** Only the explicitly opened active snapshot is queried; no save writes, generation, scheduling, or network. */
export function projectChronicleDigest(world:WorldState,viewerId:string|undefined,topic:ChronicleDigestTopic,
  window:ChronicleDigestWindow='near',throughTick=world.tick):ChronicleDigestEntry[] {
  if((topic!=='chapters' && topic!=='villages' && topic!=='market') || !Object.hasOwn(windows,window) ||
    !Number.isSafeInteger(throughTick) || throughTick<0 || throughTick>world.tick) return [];
  const viewer=world.cultivators.find(({id})=>id===viewerId);
  if(!viewer) return [];
  const width=windows[window];
  const fromTick=width===undefined?0:Math.max(0,throughTick-width+1);
  // Earlier readouts must use an actual prior snapshot, never today's observer projected into the past.
  if(throughTick!==world.tick) return [];
  return (topic==='chapters'?chapterEvidence(world,viewer,fromTick,throughTick):
    collectDigestEvidence(world,viewer,topic,fromTick,throughTick)).sort((a,b)=>b.tick-a.tick||cmp(a.id,b.id));
}
