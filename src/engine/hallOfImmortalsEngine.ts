import {verifiedImmortalAscension} from './ascensionProof';
import {artifactPowerMultiplier,equippedArtifact} from './artifactEngine';
import {DESTINY_TRAIT_CATALOG} from './destinyTraitCatalog';
import {destinyTraitEarnedEventId} from './destinyTraitEngine';
import {dramaticBondReadVenue,matchesDramaticBondFact} from './dramaticBondTerms';
import {elementalRelation} from './elementalEngine';
import {eraHistoryCompatibleArchiveAnchor,eraHistoryMatchesLiveEvent} from './eraHistoryIndex';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {isChronicleStoryFact} from './chronicleLead';
import {masteryMultiplier} from './techniqueEngine';
import type {ChronicleAnchor,Cultivator,EraHistoryReceipt,LocationNode,SpiritBeast,WorldEvent,WorldState} from '../types/world';

export interface HallOfImmortalsScope{
  currentVisibleSiteIds:ReadonlySet<string>;
  currentVisibleActorIds:ReadonlySet<string>;
  viewerId?:string|null;
  throughTick?:number;
}
export interface HallRankEntry{
  actorId:string;
  name:string;
  title:string;
  realm:Cultivator['realm'];
  score:number;
}
export type BiographySceneKind='origin'|'bond'|'encounter'|'duel'|'destiny'|'ending';
export interface BiographyScene{
  kind:BiographySceneKind;
  tick:number;
  year:number;
  month:number;
  title:string;
  text:string;
}
interface HallLife {
  actorId:string;
  name:string;
  title:string;
  realm:Cultivator['realm'];
  scenes:BiographyScene[];
}
export interface HallMemorial extends HallLife {deathTick:number}
export interface HallAscended extends HallLife {ascensionTick:number}
export interface HallOfImmortalsView {
  rankings:{power:HallRankEntry[];karma:HallRankEntry[];alchemy:HallRankEntry[]};
  memorials:HallMemorial[];
  /** A return-capable UpperPassage journey is not ascension. Only irreversible qualified evidence can fill this. */
  ascended:HallAscended[];
}

const RANK_SIZE=12;
const STORY_TURNS=6;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const fromText=(text:string,max=64)=>Array.from(text.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>]/gu,' ').replace(/\s+/gu,' ').trim()).slice(0,max).join('');
const actorLabel=(actor:Cultivator)=>({actorId:actor.id,name:fromText(actor.name),title:fromText(actor.title),realm:actor.realm});
const livingLower=(actor:Cultivator|undefined):actor is Cultivator=>Boolean(actor?.alive&&actor.hp>0&&actor.positionPlane===undefined);
const publicSite=(site:LocationNode|undefined):site is LocationNode=>Boolean(site&&site.type!=='abyss'&&
  site.type!=='secret_realm'&&!isScopedExpeditionGate(site));
function byUniqueId<T extends {id:string}>(rows:readonly T[]){
  const out=new Map<string,T|undefined>();
  for(const row of rows)out.set(row.id,out.has(row.id)?undefined:row);
  return out;
}
function nativePetRoster(world:WorldState){
  const out=new Map<string,SpiritBeast>();
  for(const pet of world.spiritBeasts)if(pet.alive&&pet.hp>0&&pet.tamedBy&&!out.has(pet.tamedBy))out.set(pet.tamedBy,pet);
  return out;
}
function neutralCombatScore(actor:Cultivator,pet:SpiritBeast|undefined){
  const gear=equippedArtifact(actor)?.spiritRoot;
  const resonance=gear===undefined?'neutral':elementalRelation(gear,actor.technique.spiritRoot);
  const gearFactor=resonance==='matching'?1.1:resonance==='nurturing'?1.05:resonance==='overcoming'?.95:1;
  const petStamina=pet&&pet.locationId===actor.locationId&&pet.maxHp>0?Math.max(0,Math.min(1,pet.hp/pet.maxHp)):0;
  const petFactor=pet&&petStamina>0?1+(.035+Math.min(.095,pet.power/5_000)+pet.cultivation*.00035)*petStamina:1;
  return Math.round(actor.combatPower*gearFactor*artifactPowerMultiplier(actor)*masteryMultiplier(actor)*petFactor);
}
const rank=(entries:HallRankEntry[],entry:HallRankEntry,ascending=false)=>{
  const place=entries.findIndex(row=>(ascending?entry.score-row.score:row.score-entry.score)<0||
    entry.score===row.score&&cmp(entry.actorId,row.actorId)<0);
  if(place>=0)entries.splice(place,0,entry);
  else if(entries.length<RANK_SIZE)entries.push(entry);
  if(entries.length>RANK_SIZE)entries.pop();
};
type Death=Extract<EraHistoryReceipt,{kind:'death'}>;
type Fact=WorldEvent|ChronicleAnchor;
function archiveIdentity(row:ChronicleAnchor){
  return JSON.stringify([row.id,row.tick,row.year,row.month,row.category,row.locationId,row.actorIds,row.title,row.description]);
}
const datesMatch=(a:Fact,b:Fact)=>a.id===b.id&&a.tick===b.tick&&a.year===b.year&&a.month===b.month&&
  a.category===b.category&&a.locationId===b.locationId&&a.actorIds.length===b.actorIds.length&&a.actorIds.every((id,i)=>id===b.actorIds[i]);
const entryDate=(row:Pick<Death,'tick'|'year'|'month'>)=>({tick:row.tick,year:row.year,month:row.month});
function stash(scans:BiographyScene[],scene:BiographyScene):void{
  scans.push(scene);
  if(scans.length<=STORY_TURNS)return;
  // Keep one verified beginning when available; otherwise the freshest actual milestones.
  const ranked=scans.map((row,index)=>({row,index})).filter(({row})=>row.kind!=='origin')
    .sort((a,b)=>a.row.tick-b.row.tick||cmp(a.row.title,b.row.title));
  if(ranked.length)scans.splice(ranked[0].index,1);else scans.shift();
}

/** Read-only. Rankings derive from the current authorized roster; biographies need independent durable public proof. */
export function projectHallOfImmortals(world:WorldState,scope:HallOfImmortalsScope):HallOfImmortalsView{
  const empty:HallOfImmortalsView={rankings:{power:[],karma:[],alchemy:[]},memorials:[],ascended:[]};
  const through=scope.throughTick??world.tick;
  if(!Number.isSafeInteger(through)||through<1||through>world.tick||!scope.currentVisibleSiteIds.size)return empty;
  const actors=byUniqueId(world.cultivators),sites=byUniqueId(world.locations);
  if(scope.viewerId&&!livingLower(actors.get(scope.viewerId)))return empty;
  const knownSite=(id:string|undefined):id is string=>Boolean(id&&scope.currentVisibleSiteIds.has(id)&&publicSite(sites.get(id)));

  if(through===world.tick){
    const pets=nativePetRoster(world);
    for(const id of scope.currentVisibleActorIds){
      const actor=actors.get(id);
      if(!livingLower(actor)||!knownSite(actor.locationId))continue;
      const label=actorLabel(actor);
      if(!label.name)continue;
      const effective=neutralCombatScore(actor,pets.get(actor.id));
      if(Number.isFinite(effective)&&effective>=0)rank(empty.rankings.power,{...label,score:effective});
      if(Number.isFinite(actor.karma)&&actor.karma<0)rank(empty.rankings.karma,{...label,score:actor.karma},true);
      let brews=0;
      const counted=new Set<string>();
      for(const row of actor.publicAlchemy??[]){
        if(counted.has(row.siteId)||!knownSite(row.siteId)||row.firstTick>row.lastTick||row.lastTick>through||
          !Number.isSafeInteger(row.successes)||row.successes<1)continue;
        counted.add(row.siteId);
        brews+=row.successes;
      }
      if(Number.isSafeInteger(brews)&&brews>0)rank(empty.rankings.alchemy,{...label,score:brews});
    }
  }

  const hot=byUniqueId(world.events);
  const archived=new Map<string,ChronicleAnchor|undefined>();
  const archive=(anchor:ChronicleAnchor)=>{
    if(!isChronicleStoryFact(anchor,through))return;
    const old=archived.get(anchor.id);
    if(!archived.has(anchor.id))archived.set(anchor.id,anchor);
    else if(!old||archiveIdentity(old)!==archiveIdentity(anchor))archived.set(anchor.id,undefined);
  };
  world.chronicleArchive.anchors.forEach(archive);
  for(const chapter of [...world.chronicleArchive.chapters,...world.coldHistory.chapters]){
    if(chapter.startTick>chapter.endTick||chapter.endTick>through)continue;
    for(const anchor of chapter.anchors)if(anchor.tick>=chapter.startTick&&anchor.tick<=chapter.endTick)archive(anchor);
  }
  const deathCounts=new Map<string,number>(),eventCounts=new Map<string,number>();
  for(const row of world.eraHistory.receipts){
    if(row.kind!=='death'||row.tick>through)continue;
    deathCounts.set(row.actorId,(deathCounts.get(row.actorId)??0)+1);
    eventCounts.set(row.eventId,(eventCounts.get(row.eventId)??0)+1);
  }
  const selected=new Map<string,{row:Pick<Death,'tick'|'year'|'month'|'locationId'>;actor:Cultivator;scenes:BiographyScene[];ending:'death'|'ascension'}>();
  for(const row of world.eraHistory.receipts){
    if(row.kind!=='death'||row.tick>through||!knownSite(row.locationId)||deathCounts.get(row.actorId)!==1||
      eventCounts.get(row.eventId)!==1||!row.eventId.startsWith(`evt-${row.tick}-`))continue;
    const actor=actors.get(row.actorId),original=hot.get(row.eventId),anchor=archived.get(row.eventId);
    if(!actor||actor.alive||actor.hp!==0||
      hot.has(row.eventId)&&(!original||!eraHistoryMatchesLiveEvent(row,original))||
      archived.has(row.eventId)&&(!anchor||!eraHistoryCompatibleArchiveAnchor(row,anchor)))continue;
    selected.set(row.actorId,{row,actor,scenes:[],ending:'death'});
  }
  for(const actor of actors.values()){
    if(!actor||actor.positionPlane!=='immortal'||selected.has(actor.id))continue;
    const trial=verifiedImmortalAscension(world,actor),terminal=trial?.terminal;
    if(!trial||trial.phase!=='succeeded'||terminal?.status!=='succeeded'||terminal.tick>through||!knownSite(trial.siteId))continue;
    const matches=(proof:Fact|undefined)=>!!proof&&proof.id===terminal.eventId&&proof.tick===terminal.tick&&
      proof.year===terminal.year&&proof.month===terminal.month&&proof.locationId===trial.siteId&&proof.category==='heavenly'&&
      isChronicleStoryFact(proof,through)&&proof.actorIds.length===1&&proof.actorIds[0]===actor.id;
    if(hot.has(terminal.eventId)&&!matches(hot.get(terminal.eventId))||
      archived.has(terminal.eventId)&&!matches(archived.get(terminal.eventId)))continue;
    selected.set(actor.id,{row:{...entryDate(terminal),locationId:trial.siteId},actor,scenes:[],ending:'ascension'});
  }
  if(!selected.size)return empty;
  const add=(actorId:string,scene:BiographyScene)=>{
    const current=selected.get(actorId);
    if(current&&scene.tick<=current.row.tick)stash(current.scenes,scene);
  };
  const source=(id:string):Fact|undefined=>{
    const live=hot.get(id),anchor=archived.get(id);
    if(hot.has(id)&&(!live||!isChronicleStoryFact(live,through))||
      archived.has(id)&&(!anchor||live&&!datesMatch(live,anchor)))return undefined;
    return live??anchor;
  };
  // The native -explore receipt is minted only after actual arrival and credited fortune.
  // A rumor, hidden site, failed exploration, or private unusual encounter is not a substitute.
  const explorationIds=new Set([...hot.keys(),...archived.keys()].filter(id=>id.endsWith('-explore')));
  for(const id of explorationIds){
    const proof=source(id),actorId=proof?.actorIds[0];
    if(!proof||!actorId||!selected.has(actorId)||proof.actorIds.length!==1||proof.category!=='breakthrough'||
      id!==`evt-${proof.tick}-${actorId}-explore`||!knownSite(proof.locationId))continue;
    const place=sites.get(proof.locationId);
    if(place)add(actorId,{...entryDate(proof),kind:'encounter',title:'行路逢机缘',text:`行至${fromText(place.name)}，偶得灵石；此事已载入原卷。`});
  }

  const villages=byUniqueId(world.settlements.villages);
  for(const row of world.settlements.records){
    if(row.kind!=='recruitment'||!row.cultivatorId||!selected.has(row.cultivatorId)||
      !row.actorId||!row.volunteerId||row.cultivatorId!==`recruit-${row.volunteerId}`||row.people!==1)continue;
    const village=villages.get(row.settlementId);
    if(!village||!knownSite(village.locationId)||row.id!==`settlement-${row.tick}-recruitment-${village.id}-${row.volunteerId}`)continue;
    const proof=source(`evt-${row.id}`);
    if(!proof||proof.category!=='diplomacy'||proof.tick!==row.tick||proof.locationId!==village.locationId||
      proof.actorIds.length!==2||proof.actorIds[0]!==row.actorId||proof.actorIds[1]!==row.cultivatorId)continue;
    add(row.cultivatorId,{...entryDate(proof),kind:'origin',title:'出凡入道',
      text:`自愿从${fromText(village.name)}入门，修行由此起步。`});
  }

  const bondFacts=world.dramaticBonds?.facts??[];
  const bondIds=new Map<string,number>();
  for(const fact of bondFacts)bondIds.set(fact.sourceEventId,(bondIds.get(fact.sourceEventId)??0)+1);
  for(const fact of bondFacts){
    if(fact.tick>through||!knownSite(fact.siteId)||!dramaticBondReadVenue(world,fact)||bondIds.get(fact.sourceEventId)!==1||
      !fact.actorIds.some(id=>selected.has(id)))continue;
    const proof=hot.get(fact.sourceEventId),anchor=archived.get(fact.sourceEventId);
    if(hot.has(fact.sourceEventId)&&(!proof||!matchesDramaticBondFact(fact,proof))||
      archived.has(fact.sourceEventId)&&(!anchor||anchor.tick!==fact.tick||anchor.year!==fact.year||anchor.month!==fact.month||
        anchor.locationId!==fact.siteId||anchor.category!==(fact.kind==='lethal_duel'?'death':fact.kind==='duel'?'combat':'diplomacy')||
        anchor.actorIds.length!==2||anchor.actorIds[0]!==fact.actorIds[0]||anchor.actorIds[1]!==fact.actorIds[1]))continue;
    for(const actorId of fact.actorIds){
      if(!selected.has(actorId))continue;
      const other=actors.get(fact.actorIds.find(id=>id!==actorId)??'');
      if(!other)continue;
      const name=fromText(other.name),date=entryDate(fact);
      if(fact.kind==='practice')add(actorId,{...date,kind:'bond',title:'并肩同修',text:`与${name}同坐吐纳，各守一周天。`});
      if(fact.kind==='encounter')add(actorId,{...date,kind:'encounter',title:'坐而论道',text:`与${name}当面论道，各陈所见。`});
      if(fact.kind==='duel'||fact.kind==='lethal_duel'){
        if(!fact.winnerId||!fact.actorIds.includes(fact.winnerId)||
          fact.kind==='lethal_duel'&&fact.fallenId!==fact.actorIds.find(id=>id!==fact.winnerId))continue;
        const won=fact.winnerId===actorId;
        add(actorId,{...date,kind:'duel',title:fact.kind==='lethal_duel'?'生死斗法':'阵前交锋',
          text:fact.kind==='lethal_duel'?(won?`与${name}决战，此人胜出；${name}陨落当场。`:
            `与${name}决战，胜的是${name}。此人陨落当场。`):`与${name}交锋，${won?'此人占得上风':`胜的是${name}`}。`});
      }
    }
  }
  for(const {row,actor,scenes,ending:kind} of selected.values()){
    for(const stamp of actor.destinyTraits?.earned??[]){
      const detail=DESTINY_TRAIT_CATALOG[stamp.traitId];
      const proof=source(destinyTraitEarnedEventId(stamp.id));
      if(!detail||stamp.actorId!==actor.id||stamp.chosenTick<stamp.openedTick||!stamp.options.includes(stamp.traitId)||
        !proof||!knownSite(proof.locationId)||proof.tick!==stamp.chosenTick||proof.category!=='breakthrough'||
        proof.actorIds.length!==1||proof.actorIds[0]!==actor.id)continue;
      add(actor.id,{...entryDate(proof),kind:'destiny',title:'一念命格',
        text:`踏入${stamp.realm}后，觉醒命格「${detail.name}」。`});
    }
    const place=fromText(sites.get(row.locationId!)!.name);
    const ending:BiographyScene={...entryDate(row),kind:'ending',
      title:kind==='ascension'?'仙门接引':'英魂留录',
      text:kind==='ascension'?`其于${place}度完飞升之劫，随仙门而去。此后不再身行下界。`:`其陨落一事有原籍存录，见于${place}。`};
    scenes.sort((a,b)=>a.tick-b.tick||cmp(a.title,b.title));
    if(kind==='ascension')empty.ascended.push({...actorLabel(actor),ascensionTick:row.tick,scenes:[...scenes,ending]});
    else empty.memorials.push({...actorLabel(actor),deathTick:row.tick,scenes:[...scenes,ending]});
  }
  // Native history is appended chronologically; reverse only the independent completed profiles.
  empty.memorials.reverse();
  empty.ascended.sort((a,b)=>b.ascensionTick-a.ascensionTick||cmp(a.actorId,b.actorId));
  return empty;
}
