import type { HeavenlyAlchemyAttempt } from '../types/heavenlyAlchemy';
import type { WorldEvent, WorldState } from '../types/world';
import { FURNACE_USE_RETENTION_TICKS } from './furnaceReservationEngine';
import {
  HEAVENLY_ALCHEMY_MAX_ATTEMPTS, HEAVENLY_ALCHEMY_QUALITY, HEAVENLY_ALCHEMY_RECIPES,
  HEAVENLY_WARD_TICKS, heavenlyAlchemyEventId, heavenlyBrewId, heavenlyPillQuality,
} from './heavenlyAlchemyTerms';

type Fail=(path:string)=>never;
const path='cultivators.heavenlyAlchemy';
const sourceId=/^evt-([1-9]\d*)-(.+)-heavenly-(brew|take)$/u;
const wardWaveId=/^evt-([1-9]\d*)-(.+)-tribulation-(?:wave-1|failure)$/u;
const wardPhrase=/，(?:渡劫神丹护持抵去本重部分雷力|已耗渡劫神丹护持)[。，]/u;
const hotLimit=120;

/** A typed stock is not interchangeable with the ordinary pill inventory. Check
 * each batch against the rule formula, real site and available independent
 * furnace/ledger/event proofs. Old spent doses cannot require eternal hot prose. */
export function validateHeavenlyAlchemyHistory(world:WorldState,fail:Fail):void{
  const recorded=world.cultivators.filter(actor=>actor.heavenlyAlchemy!==undefined);
  const sources=world.events.filter(event=>sourceId.test(event.id));
  const waveSources=world.events.filter(event=>wardWaveId.test(event.id)&&wardPhrase.test(event.description));
  if(!recorded.length&&!sources.length&&!waveSources.length)return;
  const sites=new Set(world.locations.filter(site=>site.type!=='secret_realm'&&site.type!=='abyss'&&site.expeditionOmenId===undefined).map(site=>site.id));
  const events=new Map<string,WorldEvent[]>();
  for(const event of world.events){
    const previous=events.get(event.id);
    if(previous)previous.push(event); else events.set(event.id,[event]);
  }
  const useByTurn=new Map(world.furnaceReservations.uses.map(row=>[heavenlyBrewId(row.actorId,row.tick),row]));
  const actors=new Map(world.cultivators.map(row=>[row.id,row]));
  const covered=new Set<string>();
  const coveredWaves=new Set<string>();
  const oldestHot=world.events.reduce((min,event)=>Math.min(min,event.tick),Infinity);
  function retained(actorId:string,row:HeavenlyAlchemyAttempt,tick:number,siteId:string,move:'brew'|'take'){
    const id=heavenlyAlchemyEventId(actorId,tick,move);
    const exact=events.get(id);
    if(!exact){
      if(tick>oldestHot||tick===world.tick&&world.events.length<hotLimit)return fail(path+'.source');
      return;
    }
    const event=exact[0];
    if(exact.length!==1||event.tick!==tick||event.locationId!==siteId||event.witnessScope!==undefined||
      event.actorIds.length!==1||event.actorIds[0]!==actorId||event.dialogue!==undefined||
      event.duelWinnerId!==undefined||event.damage!==undefined)return fail(path+'.source');
    const recipe=HEAVENLY_ALCHEMY_RECIPES[row.recipeId];
    const lightning=row.quality==='immortal'||row.quality==='peerless';
    const expectedTitle=move==='brew'?
      !row.quality?'高阶炼丹失手':lightning?'丹雷落定':'高阶灵丹成就':
      row.recipeId==='tribulation_divine'?'渡劫神丹入脉':'九转金丹化开';
    if(event.title!==expectedTitle||event.category!==(move==='brew'&&lightning?'heavenly':'breakthrough')||
      move==='brew'&&(row.quality?
        !event.description.endsWith(`${recipe.name}凝成${HEAVENLY_ALCHEMY_QUALITY[row.quality].name}。`):
        !event.description.endsWith(`${recipe.name}未能成丹；原材与炉资已尽。`)))return fail(path+'.source');
    covered.add(id);
  }
  for(const actor of recorded){
    const state=actor.heavenlyAlchemy!;
    if(!state.attempts.length)return fail(path+'.attempts');
    const useTicks=new Set<number>();
    const wardSpends=new Set<number>();
    const wards:HeavenlyAlchemyAttempt[]=[];
    const brewTicks=new Set(state.attempts.map(row=>row.tick));
    const pendingWards:HeavenlyAlchemyAttempt[]=[];
    let latest=0;
    for(const row of state.attempts){
      if(row.id!==heavenlyBrewId(actor.id,row.tick)||!sites.has(row.siteId)||row.fireRoot!==(actor.spiritRoot==='火')||
        row.tick<=latest||row.tick>world.tick)return fail(path+'.batch');
      latest=row.tick;
      if(heavenlyPillQuality(row)!==row.quality)return fail(path+'.quality');
      const furnace=useByTurn.get(row.id);
      if((row.tick>world.tick-FURNACE_USE_RETENTION_TICKS&&!furnace)||
        (furnace&&(furnace.siteId!==row.siteId||furnace.kind!=='brew')))return fail(path+'.furnace');
      retained(actor.id,row,row.tick,row.siteId,'brew');
      if(!row.use)continue;
      const use=row.use;
      if(!row.quality||use.tick<=row.tick||use.tick>world.tick||!sites.has(use.siteId)||
        useTicks.has(use.tick)||brewTicks.has(use.tick))return fail(path+'.use');
      useTicks.add(use.tick);
      retained(actor.id,row,use.tick,use.siteId,'take');
      const spent=use.wardSpentTick!==undefined;
      if(spent!==(use.wardTrialId!==undefined)||spent!==(use.wardWave!==undefined)||
        (spent&&row.recipeId!=='tribulation_divine'))return fail(path+'.ward');
      if(spent){
        const [at,wave]=[use.wardSpentTick!,use.wardWave!];
        const trialId=use.wardTrialId!;
        const trialPrefix=`trial-${actor.id}-`;
        const started=Number(trialId.startsWith(trialPrefix)?trialId.slice(trialPrefix.length):NaN);
        if(at<=use.tick||at>world.tick||at>use.tick+HEAVENLY_WARD_TICKS||wardSpends.has(at)||brewTicks.has(at)||
          !(Number.isSafeInteger(started)&&started>use.tick&&started<at&&trialId===trialPrefix+started)||wave!==1)return fail(path+'.ward');
        wardSpends.add(at);
        const starts=events.get(`evt-${started}-${actor.id}-tribulation-start`);
        if(starts&&(starts.length!==1||starts[0].tick!==started||starts[0].actorIds.length!==1||
          starts[0].actorIds[0]!==actor.id||starts[0].category!=='heavenly'||starts[0].witnessScope!==undefined))
          return fail(path+'.wardSource');
        const native=[
          ...(events.get(`evt-${at}-${actor.id}-tribulation-wave-${wave}`)??[]),
          ...(events.get(`evt-${at}-${actor.id}-tribulation-failure`)??[]),
        ];
        if(native.length>1||native.some(row=>row.tick!==at||row.actorIds.length!==1||row.actorIds[0]!==actor.id||
          row.witnessScope!==undefined||!row.damage?.some(hit=>hit.cultivatorId===actor.id&&hit.amount>0)||
          !wardPhrase.test(row.description))||
          !native.length&&(at>oldestHot||at===world.tick&&world.events.length<hotLimit))return fail(path+'.wardSource');
        if(native[0])coveredWaves.add(native[0].id);
        const trial=actor.tribulation;
        if(trial&&trial.id===use.wardTrialId&&(trial.startedTick>=at||wave>trial.totalWaves||
          (trial.lastActedTick??trial.startedTick)<at))return fail(path+'.ward');
      }else if(row.recipeId==='tribulation_divine'&&world.tick<=use.tick+HEAVENLY_WARD_TICKS){
        pendingWards.push(row);
      }
      if(row.recipeId==='tribulation_divine')wards.push(row);
    }
    if([...wardSpends].some(at=>useTicks.has(at)))return fail(path+'.ward');
    wards.sort((a,b)=>a.use!.tick-b.use!.tick);
    for(let i=1;i<wards.length;i++){
      const earlier=wards[i-1].use!;
      const permittedAfter=earlier.wardSpentTick??earlier.tick+HEAVENLY_WARD_TICKS;
      if(wards[i].use!.tick<=permittedAfter)return fail(path+'.ward');
    }
    const ward=state.ward,latestWard=wards.at(-1);
    if(pendingWards.length>1||pendingWards.length===1&&!ward||
      ward&&(!latestWard||latestWard.use!.wardSpentTick!==undefined||ward.brewId!==latestWard.id||
        ward.expiresTick!==latestWard.use!.tick+HEAVENLY_WARD_TICKS))return fail(path+'.ward');
  }
  // Globally reserved public event IDs cannot be re-attached to a different body
  // or promoted to a different disclosure lane. A pruned old attempt is permitted
  // only when its actor still has a native bounded stock history.
  for(const event of waveSources){
    const [,stamp,actorId]=wardWaveId.exec(event.id)!;
    const attempts=actors.get(actorId)?.heavenlyAlchemy?.attempts;
    if(events.get(event.id)?.length!==1||Number(stamp)!==event.tick||event.tick>world.tick||
      event.actorIds.length!==1||event.actorIds[0]!==actorId||event.witnessScope!==undefined||
      !coveredWaves.has(event.id)&&(attempts?.length!==HEAVENLY_ALCHEMY_MAX_ATTEMPTS||event.tick>=attempts.at(-1)!.tick))
      return fail(path+'.wardSource');
  }
  for(const event of sources){
    const [,stamp,actorId]=sourceId.exec(event.id)!;
    if(events.get(event.id)?.length!==1||Number(stamp)!==event.tick||event.tick>world.tick||
      event.actorIds.length!==1||event.actorIds[0]!==actorId||!event.locationId||!sites.has(event.locationId)||
      event.witnessScope!==undefined||!actors.get(actorId)?.heavenlyAlchemy)return fail(path+'.source');
    const attempts=actors.get(actorId)!.heavenlyAlchemy!.attempts;
    if(!covered.has(event.id)&&(attempts.length!==HEAVENLY_ALCHEMY_MAX_ATTEMPTS||event.tick>=attempts.at(-1)!.tick))return fail(path+'.source');
  }
}
