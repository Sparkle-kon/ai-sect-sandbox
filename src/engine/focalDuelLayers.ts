import type {ChronicleAnchor,Cultivator,WorldEvent} from '../types/world';
import type {FocalLayerContext,FocalLayer} from './focalLayerEvidence';
import {DAO_INTENT_QI,DAO_INTENT_READY_TICKS,DAO_PATHS} from './daoPathTerms';
import {FORBIDDEN_ART_CATALOG,forbiddenArtScarId,forbiddenDuelContactId} from './forbiddenArtCatalog';
import {isScopedExpeditionGate} from './expeditionOmenTerms';

type VerifiedDuel={source:WorldEvent;winner:string;loser:string;lethal:boolean;wounded:number};
const exactPair=(left:readonly string[],right:readonly string[])=>left.length===2&&right.length===2&&
  left[0]!==left[1]&&right[0]!==right[1]&&left.every(id=>right.includes(id));
const uniqueById=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  const found=rows.filter(row=>row.id===id);
  return found.length===1?found[0]:undefined;
};
function verifiedDuel(context:FocalLayerContext,anchor:ChronicleAnchor):VerifiedDuel|undefined{
  const {world,throughTick}=context;
  if(!Number.isSafeInteger(anchor.tick)||anchor.tick<1||anchor.tick>throughTick||!anchor.locationId||
    anchor.actorIds.length!==2||anchor.actorIds[0]===anchor.actorIds[1])return undefined;
  const site=uniqueById(world.locations,anchor.locationId);
  if(!site||isScopedExpeditionGate(site))return undefined;
  const source=context.publicOriginal(anchor.id);
  if(!source||source.id!==anchor.id||source.witnessScope!==undefined||source.tick!==anchor.tick||
    source.year!==anchor.year||source.month!==anchor.month||source.locationId!==anchor.locationId||
    source.category!==anchor.category||source.actorIds.length!==2||
    !source.actorIds.every((id,i)=>id===anchor.actorIds[i]&&!!uniqueById(world.cultivators,id)))return undefined;
  const [challenger,challenged]=source.actorIds,winner=source.duelWinnerId;
  const lethal=source.category==='death';
  if((!lethal&&source.category!=='combat')||source.id!==`evt-${source.tick}-${challenger}-${lethal?'kill':'duel'}`||
    (winner!==challenger&&winner!==challenged))return undefined;
  const loser=winner===challenger?challenged:challenger;
  const damage=source.damage??[],hits=new Set<string>();
  for(const row of damage){
    if(!source.actorIds.includes(row.cultivatorId)||hits.has(row.cultivatorId)||
      !Number.isFinite(row.amount)||row.amount<=0)return undefined;
    hits.add(row.cultivatorId);
  }
  return {source,winner,loser,lethal,wounded:hits.size};
}
function confirmedNames(world: FocalLayerContext['world'],duel:VerifiedDuel){
  const supported=(actor:Cultivator|undefined)=>{
    const value=actor?.name.trim();
    return value&&Array.from(value).length<=48&&!/[\p{Cc}\p{Cf}\p{Cs}<>“”‘’「」『』]/u.test(value)&&
      duel.source.description.includes(value)&&duel.source.title.includes(value)?value:undefined;
  };
  const victor=supported(uniqueById(world.cultivators,duel.winner));
  const fallen=supported(uniqueById(world.cultivators,duel.loser));
  if(!victor||!fallen||victor.includes(fallen)||fallen.includes(victor))return undefined;
  return {victor,fallen};
}
function paidArts(world:FocalLayerContext['world'],duel:VerifiedDuel):string[]{
  const event=duel.source,names=new Set<string>(),intents=event.daoIntents??[];
  for(const paid of intents){
    if(!event.actorIds.includes(paid.actorId)||intents.filter(other=>other.actorId===paid.actorId).length!==1||
      !Object.hasOwn(DAO_PATHS,paid.pathId)||![1,2,3].includes(paid.rank)||paid.qiPaid!==DAO_INTENT_QI||
      paid.eventId!==event.id||paid.tick!==event.tick||paid.siteId!==event.locationId||
      !Number.isSafeInteger(paid.readyTick)||paid.readyTick>=paid.tick||paid.readyTick<paid.tick-DAO_INTENT_READY_TICKS||
      !uniqueById(world.locations,paid.readySiteId)||(paid.pathId==='sword'&&!paid.artifactId))continue;
    const actor=uniqueById(world.cultivators,paid.actorId),records=actor?.daoPath?.activations.filter(row=>row.eventId===event.id);
    const original=records?.length===1?records[0]:undefined;
    if(original&&original.actorId===paid.actorId&&original.tick===paid.tick&&original.siteId===paid.siteId&&
      original.pathId===paid.pathId&&original.rank===paid.rank&&original.qiPaid===paid.qiPaid&&
      original.readyTick===paid.readyTick&&original.readySiteId===paid.readySiteId&&original.artifactId===paid.artifactId)
      names.add(DAO_PATHS[paid.pathId].intent);
  }
  const scar=event.forbiddenArt;
  if(scar&&Object.hasOwn(FORBIDDEN_ART_CATALOG,scar.artId)&&scar.tick===event.tick&&scar.siteId===event.locationId&&
    Number.isSafeInteger(scar.openedTick)&&scar.openedTick>=1&&scar.openedTick<=scar.tick&&scar.artifactId&&
    exactPair([scar.ownerId,scar.opponentId],event.actorIds)&&
    scar.contactId===forbiddenDuelContactId(scar.openedTick,event.actorIds[0],event.actorIds[1])&&
    scar.id===forbiddenArtScarId(scar.contactId,scar.artId)&&
    (scar.result==='survived'||scar.result==='reversal'&&scar.ownerId===duel.winner||
      scar.result==='fallen'&&duel.lethal&&scar.ownerId===duel.loser)){
    const recipe=FORBIDDEN_ART_CATALOG[scar.artId];
    const actor=uniqueById(world.cultivators,scar.ownerId);
    const originals=actor?.forbiddenScars?.filter(row=>row.id===scar.id);
    const retained=originals?.length===1?originals[0]:undefined;
    if(retained&&scar.paid.lifespan===recipe.life&&scar.paid.durability===recipe.durability&&
      Number.isFinite(scar.paid.hp)&&(recipe.bloodFraction>0?scar.paid.hp>0:scar.paid.hp===0)&&
      retained.artId===scar.artId&&retained.contactId===scar.contactId&&retained.ownerId===scar.ownerId&&
      retained.opponentId===scar.opponentId&&retained.artifactId===scar.artifactId&&retained.siteId===scar.siteId&&
      retained.openedTick===scar.openedTick&&retained.tick===scar.tick&&retained.result===scar.result&&
      retained.origin===scar.origin&&retained.paid.hp===scar.paid.hp&&retained.paid.lifespan===scar.paid.lifespan&&
      retained.paid.durability===scar.paid.durability)names.add(recipe.name);
  }
  return [...names].slice(0,3);
}

/** Three possible prose layers, none stronger than the exact public native event and signed costs. */
export function writeFocalDuelLayers(context:FocalLayerContext):FocalLayer[]{
  const {focal,anchors,world,throughTick}=context;
  if(throughTick>world.tick||anchors.filter(row=>row.id===focal.id).length!==1)return [];
  const duel=verifiedDuel(context,focal);
  if(!duel)return [];
  const layers:FocalLayer[]=[];
  const preceding=anchors.filter(row=>row.tick<focal.tick&&exactPair(row.actorIds,focal.actorIds))
    .filter(row=>anchors.filter(other=>other.id===row.id).length===1)
    .flatMap(row=>{
      const candidate=verifiedDuel(context,row);
      return candidate&&!candidate.lethal?[candidate]:[];
    }).sort((a,b)=>b.source.tick-a.source.tick||(a.source.id<b.source.id?-1:1))[0];
  if(preceding){
    layers.push({role:'approach',eventIds:[preceding.source.id,focal.id],
      text:preceding.source.locationId===duel.source.locationId?'还是先前交过手的地方。这一回，两人又遇上了。':
        '上一次交手另有其地。这一回，两人再度交锋。'});
  }
  const arts=paidArts(world,duel);
  const wounds=duel.wounded===2?'两人都受了伤。':duel.wounded===1?'这一场，有一人受了伤。':'';
  if(arts.length||wounds){
    const technique=arts.length===1?`交手中，确有一式${arts[0]}。`:arts.length?`此战有${arts.join('、')}，都已使出。`:'';
    layers.push({role:'exchange',eventIds:[focal.id],text:technique+wounds});
  }
  const people=confirmedNames(world,duel);
  const loserInjured=duel.source.damage?.some(row=>row.cultivatorId===duel.loser);
  layers.push({role:'aftermath',eventIds:[focal.id],text:people?
    duel.lethal?`占上风的是${people.victor}。${people.fallen}没能活着离开。`:
      `占上风的是${people.victor}。${people.fallen}${loserInjured?'负伤':'败下阵来'}。`:
    duel.lethal?'一人生还，一人陨落。到这里，胜负已定。':'胜负已经分明。这一场，却没有人死。'});
  return layers;
}
