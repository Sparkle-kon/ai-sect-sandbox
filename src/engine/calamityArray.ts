import type { Cultivator, LLMDecisionPayload, LocationNode, MapHazard, Sect, WorldEvent, WorldState } from '../types/world';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { routeWarningHazardValid } from './routeWarningProof';
import { isSectActive } from './sectActivity';
import { terrainTileAt } from './terrainEngine';

export const CALAMITY_ARRAY_QI = 12;
type Stance = 'joint' | 'local';
export interface CalamityArrayOption {
  action: 'CALAMITY_ARRAY';
  calamityArrayStance: Stance;
  targetCalamityHazardId: string;
  targetLocationId: string;
}
export interface CalamityArrayFlow {
  actorId: string;
  sectId: string;
  siteId: string;
  hazardId: string;
  stance: Stance;
  tick: number;
  paidQi: number;
}
export interface CalamityArrayProtection {
  damage: Map<string, number>;
  events: WorldEvent[];
}

const title = { joint: '同到阵眼，愿合两阵', local: '自守本门，未许合阵' } as const;
const paidTitle = { joint: '青黄两阵实合', local: '各守本门阵息' } as const;
const intentText = '这只是本人的决定，未扣灵气，也未计任何一人获救。';
const isStance = (value: unknown): value is Stance => value === 'joint' || value === 'local';
const intentId = (hazardId: string, actorId: string, tick: number) => `evt-calamity-array-intent-${hazardId}-${actorId}-${tick}`;
const paidId = (hazardId: string, actorId: string, tick: number) => `evt-calamity-array-paid-${hazardId}-${actorId}-${tick}`;
const dateOf = (row: {year:number;month:number}) => row.year * 12 + row.month;
const bounded = (value:number, min:number, max:number) => Number.isSafeInteger(value) && value >= min && value <= max;
const activeBody = (actor:Cultivator) =>
  actor.alive && actor.hp > 0 && actor.positionPlane === undefined && Number.isFinite(actor.qiProgress);

function only<T>(rows: readonly T[], matches: (row:T)=>boolean):T|undefined {
  let result:T|undefined;
  for(const row of rows) {
    if (!matches(row)) continue;
    if (result) return undefined;
    result = row;
  }
  return result;
}
const look = (world:WorldState,id:string) => only(world.cultivators,row=>row.id===id);
const known = (world:WorldState,actor:Cultivator) => look(world,actor.id)===actor;
const exactDate = (world:WorldState,event:WorldEvent,tick:number) =>
  event.tick===tick&&bounded(event.year,0,world.year)&&bounded(event.month,1,12)&&dateOf(world)-dateOf(event)===world.tick-tick;
const liveHazard = (world:WorldState,hazard:MapHazard,tick:number) =>
  hazard.kind==='cursed_miasma'&&hazard.intensity>=2&&hazard.createdTick<tick&&
  only(world.mapHazards,item=>item.id===hazard.id)===hazard&&routeWarningHazardValid(world,hazard,tick);
function arrayEye(world:WorldState,siteId:string) {
  const site=only(world.locations,row=>row.id===siteId);
  if(!site||!site.ownerSectId||site.type==='secret_realm'||isScopedExpeditionGate(site))return undefined;
  const owner=only(world.sects,sect=>sect.id===site.ownerSectId);
  if(!isSectActive(owner)||owner.headquartersId!==site.id||
    !bounded(owner.facilities.defense_array,1,3)||owner.arrayMaxHp!==owner.facilities.defense_array*200||
    !bounded(owner.arrayHp,1,owner.arrayMaxHp))return undefined;
  const tile=terrainTileAt(world,site.x,site.y);
  return tile ? { site,owner,tile } : undefined;
}
function leaderHere(world:WorldState,actor:Cultivator,siteId:string,tick:number):Sect|undefined {
  if(!activeBody(actor)||actor.sectRank!=='掌门'||!known(world,actor)||
      !doctrineFoundingPhysicallyAt(world,actor,siteId,tick))return undefined;
  const sect=only(world.sects,row=>row.id===actor.sectId);
  return isSectActive(sect)&&sect.leaderId===actor.id?sect:undefined;
}
function leadersAt(world:WorldState,site:LocationNode,owner:Sect,tick:number) {
  const leaders=world.sects.flatMap(sect=>{
    const actor=sect.leaderId&&look(world,sect.leaderId);
    return actor&&leaderHere(world,actor,site.id,tick)===sect?[{actor,sect}]:[];
  });
  if(leaders.length!==2||leaders[0].sect.id===leaders[1].sect.id||!leaders.some(row=>row.sect===owner))return undefined;
  return leaders;
}
function originalHit(world:WorldState,hazard:MapHazard,siteId:string,tick:number) {
  const original=only(world.events,row=>row.id===`evt-${tick}-${hazard.id}`);
  return original && exactDate(world,original,tick)&&original.locationId===siteId&&original.witnessScope===undefined&&
    (original.category==='heavenly'||original.category==='death')&&original.title==='瘴气蔓延'&&
    original.damage?.length&&original.actorIds.length===original.damage.length&&
    new Set(original.actorIds).size===original.actorIds.length&&original.damage.every((hit,i)=>
      hit.cultivatorId===original.actorIds[i]&&bounded(hit.amount,1,Number.MAX_SAFE_INTEGER)) ? original : undefined;
}

function canDecide(world:WorldState,actor:Cultivator,executionTick:number) {
  if ((executionTick!==world.tick&&executionTick!==world.tick+1)||actor.sectRank!=='掌门'||!activeBody(actor)||
      actor.qiProgress<CALAMITY_ARRAY_QI||!world.mapHazards.some(row=>row.kind==='cursed_miasma'&&
        row.intensity>=2&&row.expiresTick>executionTick+1)) return undefined;
  const eye=arrayEye(world,actor.locationId);
  if(!eye||!leadersAt(world,eye.site,eye.owner,executionTick)?.some(row=>row.actor===actor))return undefined;
  const hazard=only(world.mapHazards,row=>row.tileId===eye.tile.id&&liveHazard(world,row,executionTick+1)&&
    originalHit(world,row,eye.site.id,executionTick-1)!==undefined);
  if(!hazard||world.events.some(event=>event.id===intentId(hazard.id,actor.id,executionTick)))return undefined;
  return {hazard,eye};
}

export function availableCalamityArrayChoices(world:WorldState,actor:Cultivator,executionTick=world.tick+1):CalamityArrayOption[] {
  const current=canDecide(world,actor,executionTick);
  if(!current)return [];
  return (['joint','local'] as const).map(calamityArrayStance=>({action:'CALAMITY_ARRAY',calamityArrayStance,
    targetCalamityHazardId:current.hazard.id,targetLocationId:current.eye.site.id}));
}

const declared = new WeakMap<WorldState,Set<string>>();
export function recordCalamityArrayChoice(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null {
  if(decision.chosenAction!=='CALAMITY_ARRAY'||!isStance(decision.calamityArrayStance)||
    Object.keys(decision).some(key=>!['chosenAction','innerMonologue','calamityArrayStance','targetCalamityHazardId','targetLocationId'].includes(key)))
    return null;
  const allowed=availableCalamityArrayChoices(world,actor,world.tick).find(row=>
    row.calamityArrayStance===decision.calamityArrayStance&&row.targetCalamityHazardId===decision.targetCalamityHazardId&&
    row.targetLocationId===decision.targetLocationId);
  if(!allowed)return null;
  const id=intentId(allowed.targetCalamityHazardId,actor.id,world.tick);
  const already=declared.get(world)??new Set<string>();
  if(already.has(id))return null;
  already.add(id); declared.set(world,already);
  return {id,tick:world.tick,year:world.year,month:world.month,title:title[allowed.calamityArrayStance],
    description:intentText,category:'diplomacy',actorIds:[actor.id],locationId:allowed.targetLocationId,witnessScope:'participants'};
}

function exactIntent(world:WorldState,hazard:MapHazard,actor:Cultivator,siteId:string,tick:number):Stance|undefined {
  const row=only(world.events,event=>event.id===intentId(hazard.id,actor.id,tick));
  if(!row||!exactDate(world,row,tick)||row.locationId!==siteId||row.category!=='diplomacy'||
      row.actorIds.length!==1||row.actorIds[0]!==actor.id||row.witnessScope!=='participants'||row.description!==intentText)return undefined;
  return row.title===title.joint?'joint':row.title===title.local?'local':undefined;
}

export function isPrivateCalamityArrayEvent(event:WorldEvent):boolean{
  return event.id.startsWith('evt-calamity-array-intent-')&&event.witnessScope==='participants';
}

const spent = new WeakMap<WorldState,Set<string>>();
export function resolveCalamityArrayProtection(
  world:WorldState,hazard:MapHazard,people:readonly Cultivator[],damageFor:(actor:Cultivator)=>number,
):CalamityArrayProtection {
  const result:CalamityArrayProtection={damage:new Map(),events:[]};
  if(!liveHazard(world,hazard,world.tick)||!world.events.some(event=>event.id.startsWith(`evt-calamity-array-intent-${hazard.id}-`)&&event.tick===world.tick-1))
    return result;
  const already=spent.get(world)??new Set<string>();
  if(already.has(hazard.id))return result;
  const eyes=world.locations.flatMap(site=>{
    const eye=arrayEye(world,site.id);
    return eye?.tile.id===hazard.tileId&&originalHit(world,hazard,site.id,world.tick-1)?[eye]:[];
  });
  if(eyes.length!==1)return result;
  const {site,owner}=eyes[0];
  const leaders=leadersAt(world,site,owner,world.tick);
  if(!leaders||leaders.some(({actor})=>!people.includes(actor)))return result;
  const signed=leaders.map(({actor,sect})=>({actor,sect,stance:exactIntent(world,hazard,actor,site.id,world.tick-1)}));
  const combined=signed.every(({actor,stance})=>stance==='joint'&&actor.qiProgress>=CALAMITY_ARRAY_QI);
  const usable=signed.filter(({actor,stance})=>(combined||stance==='local')&&actor.qiProgress>=CALAMITY_ARRAY_QI);
  if(!usable.length)return result;
  const bodies=people.filter(actor=>activeBody(actor)&&known(world,actor)&&
    doctrineFoundingPhysicallyAt(world,actor,site.id,world.tick));
  const saved=new Map<string,number>();
  for(const actor of bodies){
    const own=usable.find(row=>row.sect.id===actor.sectId);
    if(!combined&&!own)continue;
    const before=damageFor(actor);
    if(!bounded(before,1,Number.MAX_SAFE_INTEGER))continue;
    const reduction=Math.floor(before*(combined?70:35)/100);
    if(reduction<=0)continue;
    const after=before-reduction;
    result.damage.set(actor.id,after);
    if(before>=actor.hp&&after<actor.hp){
      const key=combined?'joint':own?.actor.id;
      if(key)saved.set(key,(saved.get(key)??0)+1);
    }
  }
  if(!result.damage.size)return result;
  // A channel without any qualifying local target contributes neither a cost nor a visible line.
  const paying=usable.filter(({sect})=>combined||bodies.some(actor=>actor.sectId===sect.id&&result.damage.has(actor.id)));
  already.add(hazard.id); spent.set(world,already);
  for(const row of paying){
    const stance=combined?'joint':'local';
    row.actor.qiProgress-=CALAMITY_ARRAY_QI;
    const count=saved.get(combined?'joint':row.actor.id)??0;
    result.events.push({id:paidId(hazard.id,row.actor.id,world.tick),tick:world.tick,year:world.year,month:world.month,
      title:paidTitle[stance],description:`实际施术者付${CALAMITY_ARRAY_QI}点灵气；本次${stance==='joint'?'合阵':'本门阵息'}挡下${count}人原会致命的一击。`,
      category:'heavenly',actorIds:[row.actor.id],locationId:site.id});
  }
  if(signed.every(row=>row.stance!==undefined)&&signed[0].stance!==signed[1].stance&&paying.length){
    result.events.push({id:`evt-calamity-array-split-${hazard.id}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,
      title:'退瘴之后，各持一议',description:'一宗愿合，一宗只肯守本门；此轮未成合阵，只按实付的本门阵息结算。',
      category:'diplomacy',actorIds:signed.map(row=>row.actor.id),locationId:site.id});
  }
  return result;
}

export function projectCalamityArrayFlows(world:WorldState,siteId?:string):CalamityArrayFlow[]{
  if(!world.events.some(row=>row.tick===world.tick&&row.id.startsWith('evt-calamity-array-paid-')))return [];
  const output:CalamityArrayFlow[]=[];
  for(const hazard of world.mapHazards){
    if(!liveHazard(world,hazard,world.tick))continue;
    for(const row of world.events){
      if(row.tick!==world.tick||!row.locationId||siteId!==undefined&&siteId!==row.locationId||
         row.actorIds.length!==1||row.id!==paidId(hazard.id,row.actorIds[0],world.tick)||
         only(world.events,event=>event.id===row.id)!==row||!exactDate(world,row,world.tick)||
         row.witnessScope!==undefined||row.category!=='heavenly')continue;
      const eye=arrayEye(world,row.locationId),actor=look(world,row.actorIds[0]);
      const sect=actor&&leaderHere(world,actor,row.locationId,world.tick);
      const stance=row.title===paidTitle.joint?'joint':row.title===paidTitle.local?'local':undefined;
      if(!eye||eye.tile.id!==hazard.tileId||!actor||!sect||!stance||!originalHit(world,hazard,eye.site.id,world.tick)||
         exactIntent(world,hazard,actor,eye.site.id,world.tick-1)!==stance ||
         !row.description.startsWith(`实际施术者付${CALAMITY_ARRAY_QI}点灵气；本次${stance==='joint'?'合阵':'本门阵息'}挡下`))continue;
      output.push({actorId:actor.id,sectId:sect.id,siteId:eye.site.id,hazardId:hazard.id,stance,tick:world.tick,
        paidQi:CALAMITY_ARRAY_QI});
    }
  }
  // A lone receipt is not a successful coalition, including sender forgery or stale branch combinations.
  return output.filter(row=>row.stance==='local'||output.filter(peer=>peer.stance==='joint'&&peer.hazardId===row.hazardId&&
    peer.siteId===row.siteId&&peer.sectId!==row.sectId).length===1);
}

/** The guided reader can show its own signed choice, then only settled native proof at its eye. */
export function calamityArrayStoryReceipt(world: WorldState, actorId: string, option: CalamityArrayOption,
  phase: 'intent' | 'settlement'): {title:string;description:string}|undefined {
  const actor = look(world, actorId);
  const hazard = only(world.mapHazards, row => row.id === option.targetCalamityHazardId);
  if (!actor || !hazard) return undefined;
  const tick = phase === 'intent' ? world.tick : world.tick - 1;
  if (exactIntent(world, hazard, actor, option.targetLocationId, tick) !== option.calamityArrayStance) return undefined;
  if (phase === 'intent') return { title: title[option.calamityArrayStance], description: intentText };
  if (!leaderHere(world, actor, option.targetLocationId, world.tick) ||
      !originalHit(world, hazard, option.targetLocationId, world.tick)) return undefined;
  const paid = projectCalamityArrayFlows(world, option.targetLocationId).find(flow =>
    flow.actorId === actorId && flow.hazardId === hazard.id && flow.stance === option.calamityArrayStance);
  if (!paid) return { title: '阵息未从此手起', description: '这一轮没有记下你实付的阵息；先前的意愿未结成你的阵流。' };
  const row = only(world.events, event => event.id === paidId(hazard.id, actorId, world.tick));
  return row ? { title: row.title,
    description: `这道阵息确实挡在了本轮瘴气前，你实耗${paid.paidQi}点灵气。` } : undefined;
}
