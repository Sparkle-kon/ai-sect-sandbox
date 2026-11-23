import {
  STORYTELLER_MOVES, STORYTELLER_PULSE_LIMIT, STORYTELLER_STYLES, STORYTELLER_STORYLET_MOVES,
  STORYTELLER_STORYLET_TONES, storytellerOfferId,
  type StorytellerDirectorState, type StorytellerMove, type StorytellerOption,
  type StorytellerPulseReason, type StorytellerPulseView, type StorytellerWorldBeat,
  type StorytellerStoryletId, type StorytellerStyle, type StorytellerTone, type StorytellerView,
} from '../types/storytellerDirector';
import type { Cultivator, LLMDecisionPayload, LocationNode, MapTile, WorldEvent, WorldState } from '../types/world';
import { activeAvatar } from './avatarEngine';
import type { HighlightKind } from './director/highlight';
import { activeBellWatchForActor } from './bellWatchPresence';
import { isChronicleStoryFact } from './chronicleLead';
import { isGrandSiegeFighterPresent } from './grandSiegePresence';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from './terrainEngine';
import { createStoryletRegistry, type StoryletDefinition } from './storyletEngine';

export { STORYTELLER_STYLES } from '../types/storytellerDirector';

interface Drama {
  readonly actor:Cultivator;
  readonly site:LocationNode;
  readonly tired:number;
  readonly localDanger:number;
  readonly conflict:number;
  readonly tension:number;
  readonly gap:number;
  readonly companion?:Cultivator;
  readonly destination?:LocationNode;
}
interface Scene { readonly title:string; readonly body:string; readonly tone:StorytellerTone }
type DirectorSchema={
  Id:StorytellerStoryletId;Context:Drama;Actor:string;Role:'lead';
  Scene:Scene;Choice:StorytellerMove;ChoiceMeta:string;
  Condition:{kind:'pressure';minimum:number}|{kind:'danger';minimum:number}|{kind:'companion'}|{kind:'destination'}|{kind:'strain';minimum:number};
  Binder:{kind:'lead'};
  Effect:{kind:'native';move:StorytellerMove};
  EffectContext:{legal:readonly StorytellerMove[]};Result:StorytellerMove|undefined;
};
const labels:Record<StorytellerMove,string>={rest:'在这里歇一歇',cultivate:'收心吐纳',talk:'过去说两句话',travel:'沿熟路去看看'};

function authored(id:StorytellerStoryletId,title:string,body:string,
  conditions:DirectorSchema['Condition'][]=[]):StoryletDefinition<DirectorSchema>{
  return {id,conditions,roles:[{id:'lead',binder:{kind:'lead'}}],scene:{title,body,tone:STORYTELLER_STORYLET_TONES[id]},
    choices:STORYTELLER_STORYLET_MOVES[id].map(move=>({id:move,meta:labels[move],effect:{kind:'native',move}}))};
}

const director=createStoryletRegistry<DirectorSchema>([
  authored('rain-eaves','檐下留一刻','新月才起，四下还静。那些未急着回答的事，可以先交给一盏薄茶。'),
  authored('lamplight-rest','灯下调息','这一程走得并不轻松。趁窗边还留着清静，先听一听自己的呼吸。',[
    {kind:'strain',minimum:20},
  ]),
  authored('shared-tea','茶盏旁有位同路人','这一处有人也未离开。若你愿意，可以走近说几句话，看看彼此是否还有下文。',[
    {kind:'companion'},
  ]),
  authored('mountain-road','去看看旧山路','熟路就在眼前。留在这儿还能练一炉功，顺着它走，也许能听见另一处的消息。',[
    {kind:'destination'},
  ]),
  authored('storm-watch','山外风声紧','局势已经不如先前安静。山风落到檐角，接下来这一步，仍由你自己拿主意。',[
    {kind:'pressure',minimum:33},
  ]),
  authored('retreat-from-danger','先保住这一口气','眼前确有险意。熟路在脚下；要离开，得自己走过去。留在这里，也还有几分力气可以收拢。',[
    {kind:'danger',minimum:12},{kind:'destination'},
  ]),
],{
  conditions:{
    pressure:({minimum},{tension,localDanger,conflict})=>tension+localDanger+conflict>=minimum,
    danger:({minimum},{localDanger})=>localDanger>=minimum,
    companion:(_condition,{companion})=>!!companion,
    destination:(_condition,{destination})=>!!destination,
    strain:({minimum},{tired})=>tired>=minimum,
  },
  roles:{lead:(_binder,{actor})=>[actor.id]},
  effects:{native:({move},{legal})=>legal.includes(move)?move:undefined},
});

const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const cap=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const styleOf=(style:StorytellerStyle)=>STORYTELLER_STYLES.find(entry=>entry.id===style);
const actorAt=(world:WorldState,id:string|undefined)=>id===undefined?undefined:world.cultivators.find(actor=>actor.id===id);
type OpenLocation=LocationNode&{type:'sect_hq'|'spirit_vein'|'market';expeditionOmenId?:undefined};
const openSite=(site:LocationNode|undefined):site is OpenLocation=>
  !!site&&site.type!=='secret_realm'&&site.type!=='abyss'&&site.expeditionOmenId===undefined;
const siteAt=(world:WorldState,id:string)=>world.locations.find(site=>site.id===id);
const settled=(world:WorldState,actor:Cultivator|undefined,siteId=actor?.locationId):actor is Cultivator=>
  !!actor&&siteId!==undefined&&actor.hp>0&&
  !activeBellWatchForActor(world,actor)&&isGrandSiegeFighterPresent(world,actor,siteId);

export function canonicalStorytellerFocus(world:WorldState,state:StorytellerDirectorState){
  const canLead=(actor:Cultivator|undefined):actor is Cultivator=>settled(world,actor)&&openSite(siteAt(world,actor.locationId));
  const arc=world.protagonistSuccession.arcs.filter(row=>row.endedTick===undefined).at(-1);
  const byPreference=[actorAt(world,state.focusActorId),activeAvatar(world),actorAt(world,arc?.actorId)];
  for(const actor of byPreference)if(canLead(actor))return actor;
  // Last resort follows a living everyday person, not an invented focal actor and not the next model call.
  let fallback:Cultivator|undefined;
  for(const actor of world.cultivators)if((!fallback||compare(actor.id,fallback.id)<0)&&canLead(actor))fallback=actor;
  return fallback;
}

function danger(world:WorldState,site:LocationNode,tick:number){
  const tile=terrainTileAt(world,site.x,site.y);
  return world.mapHazards.reduce((n,hazard)=>hazard.tileId===tile?.id&&hazard.createdTick<=tick&&tick<hazard.expiresTick?
    Math.max(n,12*hazard.intensity):n,0);
}
function conflictHere(world:WorldState,siteId:string){
  return world.sieges.some(siege=>siege.destinationId===siteId&&(siege.status==='sieging'||siege.status==='marching'))?28:0;
}

function knownSafeSteps(world:WorldState,actor:Cultivator,site:LocationNode,tick:number,limit=7){
  const root=terrainTileAt(world,site.x,site.y);
  if(!root)return new Map<string,number>();
  const familiar=new Set([...actor.exploredTileIds,...currentVisibleTileIds(world,actor)]);
  const blocked=new Set(world.mapHazards.filter(hazard=>hazard.createdTick<=tick&&tick<hazard.expiresTick).map(hazard=>hazard.tileId));
  for(const location of world.locations){
    if(openSite(location))continue;
    const tile=terrainTileAt(world,location.x,location.y);
    if(tile)blocked.add(tile.id);
  }
  const {rows,columns,tiles}=world.terrain;
  const nearest=new Map<string,number>([[root.id,0]]);
  const seen: Array<{tile:MapTile;distance:number}>=[{tile:root,distance:0}];
  for(let i=0;i<seen.length;i++){
    const {tile,distance}=seen[i];
    if(distance>=limit)continue;
    for(const [col,row] of [[tile.col-1,tile.row],[tile.col,tile.row-1],[tile.col+1,tile.row],[tile.col,tile.row+1]]){
      if(col<0||row<0||col>=columns||row>=rows)continue;
      const next=tiles[row*columns+col];
      if(!next||nearest.has(next.id)||!familiar.has(next.id)||blocked.has(next.id)||next.biome==='魔渊'||next.biome==='毒沼')continue;
      nearest.set(next.id,distance+1);
      seen.push({tile:next,distance:distance+1});
    }
  }
  return nearest;
}
function destinationOptions(world:WorldState,actor:Cultivator,site:LocationNode,tick:number){
  const distances=knownSafeSteps(world,actor,site,tick);
  return knownMapLocations(world,actor).flatMap(target=>{
    if(!openSite(target)||target.id===site.id||danger(world,target,tick)>0||conflictHere(world,target.id)>0)return [];
    const cell=terrainTileAt(world,target.x,target.y);
    const steps=cell&&distances.get(cell.id);
    if(steps===undefined)return [];
    return [{target,steps}];
  }).sort((a,b)=>a.steps-b.steps||compare(a.target.id,b.target.id)).map(({target})=>target);
}
const nearby=(world:WorldState,actor:Cultivator)=>world.cultivators
  .filter(other=>other.id!==actor.id&&other.locationId===actor.locationId&&settled(world,other,actor.locationId))
  .sort((a,b)=>Number(b.sectId===actor.sectId)-Number(a.sectId===actor.sectId)||compare(a.id,b.id));
function situation(world:WorldState,actor:Cultivator,site:LocationNode,state:StorytellerDirectorState):Drama{
  return {actor,site,tired:cap(100*(1-actor.hp/Math.max(1,actor.maxHp))),localDanger:danger(world,site,world.tick),
    conflict:conflictHere(world,site.id),tension:state.tension,gap:world.tick-state.lastOfferTick,
    companion:nearby(world,actor)[0],destination:destinationOptions(world,actor,site,world.tick+1)[0]};
}
const impulse:Record<WorldEvent['category'],number>={combat:10,death:13,heavenly:7,intrigue:5,breakthrough:-5,diplomacy:-3};
function advanceTension(world:WorldState,state:StorytellerDirectorState,events:readonly WorldEvent[]):StorytellerWorldBeat{
  const redacted=new Set(events.filter(event=>event.tick===world.tick&&!isChronicleStoryFact(event,world.tick))
    .map(event=>event.id));
  const seen=new Set<string>();
  let rise=0,fall=0,clashes=0,peril=0,celebration=0;
  for(const event of events){
    if(event.tick!==world.tick||redacted.has(event.id)||seen.has(event.id))continue;
    seen.add(event.id);
    const weight=impulse[event.category];
    if(weight>=0)rise+=weight;
    else fall+=weight;
    if(event.category==='combat')clashes++;
    if(event.category==='heavenly'||event.category==='death')peril++;
    if(event.category==='breakthrough')celebration++;
  }
  const war=Math.min(12,world.sieges.filter(row=>row.status==='sieging'||row.status==='marching').length*4);
  state.tension=cap(state.tension*.76+5+Math.min(rise,32)+Math.max(fall,-17)+war);
  if(clashes&&clashes>=peril&&clashes>=celebration||war>0&&!peril&&!celebration)return 'conflict';
  if(peril&&peril>=celebration)return 'peril';
  return celebration?'celebration':'quiet';
}
const toneWeight:Record<StorytellerStyle,Record<StorytellerTone,number>>={
  still_water:{quiet:35,journey:14,crisis:0},
  wandering_jianghu:{quiet:9,journey:28,crisis:13},
  great_calamity:{quiet:0,journey:14,crisis:32},
};
function stableJitter(seed:number,tick:number,actorId:string,id:StorytellerStoryletId){
  let key=(seed^Math.imul(tick,0x9e3779b1))|0;
  for(const char of JSON.stringify([actorId,id]))key=Math.imul(key^(char.codePointAt(0)??0),0x01000193);
  return (key>>>0)%11;
}
function score(world:WorldState,state:StorytellerDirectorState,drama:Drama,definition:StoryletDefinition<DirectorSchema>){
  const {tired,tension,localDanger,conflict,gap,companion,destination,actor}=drama;
  const tone=definition.scene.tone;
  const phase=(tone==='crisis'?(tension+localDanger+conflict)*.61:
    tone==='quiet'?tired*.44-tension*.18:
    (companion?8:0)+(destination?10:0)+gap*2-tired*.14);
  const type=definition.id==='retreat-from-danger'&&localDanger>0?14:
    definition.id==='lamplight-rest'&&tired>=38?14:0;
  const recent=state.offer?.storyletId??state.lastOutcome?.storyletId;
  const currentLife=tone==='quiet'&&(actor.currentAction==='DUEL'||actor.currentAction==='EXPLORE')?7:
    tone==='journey'&&(actor.currentAction==='REST'||actor.currentAction==='CULTIVATE')?6:0;
  return 20+gap*2+toneWeight[state.style][tone]+phase+type+currentLife+
    stableJitter(world.terrain.seed,world.tick,actor.id,definition.id)-(recent===definition.id?18:0);
}

export function configureStoryteller(world:WorldState,style:StorytellerStyle,focusActorId?:string):boolean{
  if(!styleOf(style)||focusActorId!==undefined&&!actorAt(world,focusActorId))return false;
  const current=world.storyteller;
  if(!current){
    world.storyteller={style,configuredTick:world.tick,lastOfferTick:world.tick,tension:20,
      ...(focusActorId!==undefined?{focusActorId}:{})};
    return true;
  }
  if(current.focusActorId!==focusActorId&&focusActorId!==undefined&&current.offer?.actorId!==focusActorId)delete current.offer;
  if(focusActorId===undefined)delete current.focusActorId;else current.focusActorId=focusActorId;
  current.style=style;
  return true;
}

type ChosenPulse = {offeredTone:StorytellerTone;reason:StorytellerPulseReason};

function repeatedExtreme(state:StorytellerDirectorState,tick:number):StorytellerTone|undefined{
  const prior=state.pulse?.at(-1),earlier=state.pulse?.at(-2);
  if(prior?.tick!==tick-1||earlier?.tick!==tick-2||earlier.offeredTone!==prior.offeredTone)return undefined;
  const tone=prior.offeredTone;
  return tone==='quiet'||tone==='crisis'?tone:undefined;
}
function choiceReason(context:Drama,tone:StorytellerTone,id:StorytellerStoryletId,changed:boolean):StorytellerPulseReason{
  if(changed)return 'change_of_pace';
  if(tone==='crisis')return context.localDanger||context.conflict?'local_peril':'world_pressure';
  if(tone==='quiet')return context.tired>=20?'health':context.tension>=35?'breather':'cadence';
  if(id==='shared-tea')return 'companion';
  return context.destination?'open_road':'cadence';
}
function scheduleStorylet(world:WorldState,state:StorytellerDirectorState,cadence:number):ChosenPulse|undefined{
  const current=state.offer;
  const liveActor=actorAt(world,current?.actorId);
  const usable=current&&liveActor&&availableStorytellerActions(liveActor,world,world.tick+1).length>0;
  const due=world.tick-state.lastOfferTick>=cadence;
  if(!due&&(!current||usable))return undefined;
  if(current&&!usable&&!due)delete state.offer;
  const actor=canonicalStorytellerFocus(world,state);
  const site=actor&&siteAt(world,actor.locationId);
  if(!actor||!openSite(site)){
    if(current&&!usable)delete state.offer;
    return undefined;
  }
  const context=situation(world,actor,site,state);
  const ranked=director.definitions.filter(row=>director.admit(row.id,context))
    .map(row=>({row,weight:score(world,state,context,row)}))
    .sort((a,b)=>b.weight-a.weight||compare(a.row.id,b.row.id));
  const lead=ranked[0]?.row;
  if(!lead)return undefined;
  const repeated=repeatedExtreme(state,world.tick);
  const alternate=repeated===lead.scene.tone?ranked.find(({row})=>row.scene.tone!==repeated)?.row:undefined;
  const selected=alternate??lead;
  const {companion,destination}=context;
  const moves=selected.choices.map(choice=>choice.id).filter(move=>move!=='talk'&&move!=='travel'||
    move==='talk'&&companion!==undefined||move==='travel'&&destination!==undefined);
  state.offer={id:storytellerOfferId(world.tick,actor.id,selected.id),storyletId:selected.id,
    actorId:actor.id,siteId:site.id,openedTick:world.tick,expiresTick:world.tick+cadence,optionMoves:moves,
    ...(moves.includes('talk')&&companion?{targetActorId:companion.id}:{}),
    ...(moves.includes('travel')&&destination?{targetSiteId:destination.id}:{})};
  state.lastOfferTick=world.tick;
  const offeredTone=selected.scene.tone;
  return {offeredTone,reason:choiceReason(context,offeredTone,selected.id,alternate!==undefined)};
}

/** Sample an actual completed month and choose one invitation without drawing from the world's RNG. */
export function advanceStorytellerDirector(world:WorldState,recentEvents:readonly WorldEvent[]=world.events,
  native?:HighlightKind):void{
  const state=world.storyteller;
  if(!state||world.tick<=state.configuredTick||world.tick<=(state.lastAdvancedTick??-1))return;
  const style=styleOf(state.style);
  if(!style)return;
  state.lastAdvancedTick=world.tick;
  const worldBeat=advanceTension(world,state,recentEvents);
  if(state.offer && state.offer.expiresTick<world.tick)delete state.offer;
  // The old quiet scene remains a normal playable fallback; it is never entered in the high-point ledger.
  const quiet=scheduleStorylet(world,state,style.cadence);
  const chosen=native ? {offeredTone:native==='heart_demon'||native==='forbidden_art'?'crisis' as const:'journey' as const,
    reason:'cadence' as const} : quiet;
  state.pulse=[...(state.pulse??[]).slice(-(STORYTELLER_PULSE_LIMIT-1)),
    {tick:world.tick,tension:state.tension,worldBeat,...chosen}];
}

const pulseBeatLabels:Record<StorytellerWorldBeat,string>={
  conflict:'人间有交锋，风声渐紧。',
  peril:'这一月有风浪，行路要多看一步。',
  celebration:'这一月有新进展，山门也添了几分生气。',
  quiet:'这一月风声尚缓。',
};
const pulseReasonLabels:Record<StorytellerPulseReason,string>={
  health:'前一程耗了力气，这一回先留些工夫调养。',
  local_peril:'近处有风浪，可停一停，再选脚下的路。',
  open_road:'有一段认得的路，正可趁此月走一程。',
  companion:'身边有人可谈，先从说几句话起。',
  world_pressure:'近来的动静未歇，眼下这一步值得自己拿主意。',
  breather:'接连几件事催得紧，这一回给故事留点空处。',
  change_of_pace:'前两月同是一种声调，这一回换个走法。',
  cadence:'山中岁月虽寻常，这一刻也有可亲手决定的事。',
};

export function projectStorytellerPulse(world:WorldState):StorytellerPulseView|undefined{
  const samples=world.storyteller?.pulse;
  if(!samples?.length)return undefined;
  const absolute=world.year*12+world.month-1;
  const points=samples.slice(-STORYTELLER_PULSE_LIMIT).flatMap(({tick,tension,worldBeat,offeredTone,reason})=>{
    if(!Number.isSafeInteger(tick)||tick<0||tick>world.tick||!Number.isSafeInteger(tension)||tension<0||tension>100||
      !Object.hasOwn(pulseBeatLabels,worldBeat))return [];
    const monthAt=absolute-(world.tick-tick);
    return [{tick,tension,worldBeat,year:Math.floor(monthAt/12),month:((monthAt%12+12)%12)+1,
      beatLabel:pulseBeatLabels[worldBeat],...(offeredTone&&reason&&Object.hasOwn(pulseReasonLabels,reason)?{offeredTone,reason,reasonLabel:pulseReasonLabels[reason]}:{})}];
  });
  const current=points.at(-1);
  return current?{title:'天势',points,current:{...current}}:undefined;
}

function currentOffer(actor:Cultivator,world:WorldState,tick:number){
  const offer=world.storyteller?.offer;
  if(!offer||tick!==world.tick&&tick!==world.tick+1||offer.openedTick>=tick||offer.expiresTick<tick||
    offer.actorId!==actor.id||actorAt(world,actor.id)!==actor||!settled(world,actor,offer.siteId))return undefined;
  const site=siteAt(world,offer.siteId);
  return openSite(site)?{offer,site}:undefined;
}
export function availableStorytellerActions(actor:Cultivator,world:WorldState,executionTick=world.tick):StorytellerOption[]{
  const current=currentOffer(actor,world,executionTick);
  if(!current)return [];
  const {offer,site}=current;
  const talk=offer.targetActorId!==actor.id&&settled(world,actorAt(world,offer.targetActorId),site.id);
  const travel=offer.targetSiteId!==undefined&&destinationOptions(world,actor,site,executionTick)
    .some(target=>target.id===offer.targetSiteId);
  return STORYTELLER_MOVES.filter(move=>offer.optionMoves.includes(move)&&(move!=='talk'||talk)&&(move!=='travel'||travel))
    .map(storytellerMove=>({chosenAction:'STORYTELLER_CHOICE',storytellerOfferId:offer.id,storytellerMove}));
}

export interface StorytellerPlan {readonly option:StorytellerOption;readonly native:LLMDecisionPayload}
const plans=new WeakMap<StorytellerPlan,{world:WorldState;actor:Cultivator;tick:number}>();
const allowed=new Set(['chosenAction','storytellerOfferId','storytellerMove','innerMonologue']);
const lines:Record<StorytellerMove,string>={
  rest:'先在这里养一养精神。',cultivate:'让我静下心来吐纳一回。',
  talk:'且过去说两句，听听对方怎么想。',travel:'就沿这条熟路走过去。',
};

export function planStorytellerChoice(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):StorytellerPlan|undefined{
  if(decision.chosenAction!=='STORYTELLER_CHOICE'||Object.keys(decision).some(key=>!allowed.has(key)))return undefined;
  const options=availableStorytellerActions(actor,world);
  const option=options.find(row=>row.storytellerOfferId===decision.storytellerOfferId&&row.storytellerMove===decision.storytellerMove);
  const offer=world.storyteller?.offer;
  if(!option||!offer)return undefined;
  const legal=options.map(row=>row.storytellerMove);
  const move=option.storytellerMove;
  // The scene was scored when the invitation opened. Only the selected move needs current facts.
  if(director.previewEffect(offer.storyletId,move,{legal})!==move)return undefined;
  const innerMonologue=lines[move];
  let native:LLMDecisionPayload;
  if(move==='rest')native={chosenAction:'REST',innerMonologue};
  else if(move==='cultivate')native={chosenAction:'CULTIVATE',innerMonologue};
  else if(move==='talk'&&offer.targetActorId)native={chosenAction:'SOCIALIZE',targetCultivatorId:offer.targetActorId,innerMonologue};
  else if(move==='travel'&&offer.targetSiteId)native={chosenAction:'EXPLORE',targetLocationId:offer.targetSiteId,innerMonologue};
  else return undefined;
  const plan={option:Object.freeze(option),native:Object.freeze(native)};
  plans.set(plan,{world,actor,tick:world.tick});
  return Object.freeze(plan);
}

/** Commit only after the ordinary dispatcher has really handled this exact native intent. */
export function completeStorytellerChoice(world:WorldState,actor:Cultivator,plan:StorytellerPlan,applied:boolean):boolean{
  const authorization=plans.get(plan);
  plans.delete(plan);
  const state=world.storyteller,offer=state?.offer;
  if(!applied||!authorization||authorization.world!==world||authorization.actor!==actor||authorization.tick!==world.tick||
    !state||!offer||offer.id!==plan.option.storytellerOfferId||offer.actorId!==actor.id)return false;
  state.lastOutcome={offerId:offer.id,actorId:actor.id,storyletId:offer.storyletId,move:plan.option.storytellerMove,tick:world.tick};
  delete state.offer;
  return true;
}

export function projectStoryteller(world:WorldState,viewer?:Cultivator):StorytellerView|undefined{
  const state=world.storyteller,offer=state?.offer;
  const actor=offer&&actorAt(world,offer.actorId),place=offer&&siteAt(world,offer.siteId);
  const scene=offer&&director.definition(offer.storyletId)?.scene;
  if(!state||!offer||!actor||!place||!scene||viewer!==undefined&&viewer!==actor)return undefined;
  const options=availableStorytellerActions(actor,world,world.tick+1).map(decision=>{
    const move=decision.storytellerMove;
    const person=move==='talk'?actorAt(world,offer.targetActorId):undefined;
    const target=move==='travel'&&offer.targetSiteId?siteAt(world,offer.targetSiteId):undefined;
    return {label:person?`和${person.name}说几句`:target?`沿熟路去${target.name}`:labels[move],decision};
  });
  if(!options.length)return undefined;
  const moves=options.map(choice=>choice.decision.storytellerMove);
  const body=offer.storyletId==='shared-tea'&&!moves.includes('talk')?
    '想说的话一时没遇上能听的人。这盏茶还温着，由你决定是歇息还是收心吐纳。':
    (offer.storyletId==='mountain-road'||offer.storyletId==='retreat-from-danger')&&!moves.includes('travel')?
    '旧时认得的路，眼下不合适走。先留一回，看风色会不会改。':scene.body;
  return {style:state.style,tension:state.tension,actorId:actor.id,actorName:actor.name,siteId:place.id,siteName:place.name,
    storyletId:offer.storyletId,tone:scene.tone,title:scene.title,body,options,openedTick:offer.openedTick,expiresTick:offer.expiresTick};
}
