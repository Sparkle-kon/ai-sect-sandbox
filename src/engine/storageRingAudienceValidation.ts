import type { RingAudienceSession } from '../types/ringAudience';
import type { WorldEvent, WorldState } from '../types/world';
import {
  calculateRingAudienceTurn, RING_AUDIENCE_COST, RING_AUDIENCE_MAX_SESSIONS, RING_AUDIENCE_TABOO_TECHNIQUE,
  ringAudienceInitialStance, ringAudienceInitialWavering, ringAudienceMessage, ringAudienceTone,
} from './ringAudienceTerms';
import { SHARE_SAVE_REDACTED_TEXT } from './shareSaveRedactionText';

type Fail=(path:string)=>never;
const path='playerAvatar.audience';
const privateId=/^evt-(\d+)-(.+)-audience-(left|learned)$/u;
const privateEvent=(id:string)=>privateId.test(id);
const NATIVE_HOT_EVENT_LIMIT=120;
const closed=(row:RingAudienceSession)=>row.status!=='open'&&row.status!=='sealed';
const executedEffect={leave_sect:'left',learn_taboo:'learned',challenge_master:'confronted'} as const;
const normalizedText=(text:string)=>text===SHARE_SAVE_REDACTED_TEXT||ringAudienceMessage(text)===text;
const serialOf=(id:string)=>Number(/^ring-audience-([1-9]\d*)$/.exec(id)?.[1]);

export function validateRingAudienceHistory(world:WorldState,fail:Fail):void{
  const hasPrivate=(rows:readonly {id:string}[])=>rows.some(row=>privateEvent(row.id));
  if(hasPrivate(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(row=>hasPrivate(row.anchors))||
    world.coldHistory.chapters.some(row=>hasPrivate(row.anchors))||
    world.chronicleCausality.nodes.some(row=>privateEvent(row.eventId))||
    world.chronicleErrata.sources.some(row=>privateEvent(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>privateEvent(row.source.sourceEventId))||
    world.witnessedPersonalStory.scenes.some(row=>privateEvent(row.eventId))||
    world.dramaticBonds?.facts.some(row=>privateEvent(row.sourceEventId))||
    world.protagonistSuccession.arcs.some(row=>row.opening.some(evidence=>privateEvent(evidence.eventId))||
      row.support.some(evidence=>privateEvent(evidence.eventId))||!!row.death&&privateEvent(row.death.eventId))||
    world.cultivators.some(actor=>actor.rumors.some(rumor=>
      !!rumor.originEventId&&privateEvent(rumor.originEventId)||
      rumor.id.startsWith('rumor-')&&privateEvent(rumor.id.slice('rumor-'.length)))))
    return fail(path+'.publicArchive');
  const state=world.playerAvatar.audience;
  const originals=new Map<string,WorldEvent[]>();
  const privateSources=new Map<string,WorldEvent>();
  const actors=new Map(world.cultivators.map(row=>[row.id,row]));
  const sites=new Set(world.locations.map(row=>row.id));
  for(const event of world.events){
    const match=privateId.exec(event.id);
    if(match){
      const [,stamp,target,effect]=match;
      if(privateSources.has(event.id)||event.witnessScope!=='participants'||
        event.category!==(effect==='left'?'diplomacy':'breakthrough')||Number(stamp)!==event.tick||event.tick>world.tick||
        event.actorIds.length!==1||target!==event.actorIds[0]||!actors.has(target)||!event.locationId||!sites.has(event.locationId)||
        event.dialogue!==undefined||event.duelWinnerId!==undefined||event.damage!==undefined) return fail(path+'.event');
      privateSources.set(event.id,event);
    }
    if(state){
      const same=originals.get(event.id);
      if(same)same.push(event);
      else originals.set(event.id,[event]);
    }
  }
  if(!state){if(privateSources.size)return fail(path+'.event');return;}
  const factions=new Set(world.sects.map(row=>row.id));
  const covered=new Set<string>();
  if(!state.sessions.length)return fail(path+'.sessions');
  let prior:RingAudienceSession|undefined;
  let previousSerial=0;
  for(const row of state.sessions){
    const serial=serialOf(row.id),isClosed=closed(row),target=actors.get(row.targetId);
    const originalSect=row.openingSectId===''?row.aim==='learn_taboo':factions.has(row.openingSectId);
    if(!Number.isSafeInteger(serial)||serial>=state.nextId||
      (prior!==undefined&&(serial!==previousSerial+1||prior.closedTick===undefined||prior.closedTick>row.openedTick))||
      !target||!originalSect||row.openedTick<1||row.openedTick>world.tick||
      (row.aim==='challenge_master')!==(row.leaderId!==undefined)||
      (row.leaderId!==undefined&&(!actors.has(row.leaderId)||row.leaderId===row.targetId)))
      return fail(path+'.session');
    const initial=ringAudienceInitialWavering(row.personalityAtOpening,row.aim);
    if(row.initialWavering!==initial)return fail(path+'.stance');
    let before=initial,lastStance:RingAudienceSession['stance']=ringAudienceInitialStance;
    for(const [index,turn] of row.turns.entries()){
      if(turn.index!==index+1||turn.tick!==row.openedTick||turn.before!==before||
        turn.cost!==RING_AUDIENCE_COST[row.role]||!normalizedText(turn.message)||!normalizedText(turn.reply)||
        (turn.message!==SHARE_SAVE_REDACTED_TEXT&&ringAudienceTone(turn.message)!==turn.tone)||
        lastStance==='accepts'||lastStance==='rebels')return fail(path+'.turn');
      const result=calculateRingAudienceTurn(row.aim,row.role,row.personalityAtOpening,before,turn.index,turn.tone);
      if(turn.after!==result.after||turn.stance!==result.stance)return fail(path+'.stance');
      before=turn.after; lastStance=turn.stance;
    }
    if(row.wavering!==before||row.stance!==lastStance||(row.closedTick!==undefined)!==isClosed||
      (row.closedTick!==undefined&&(row.closedTick<row.openedTick||row.closedTick>world.tick))||
      (row.sealedTick!==undefined&&(row.sealedTick!==row.openedTick||lastStance!=='accepts'))||
      (row.status==='declined')!==(lastStance==='rebels')||
      ((row.status==='sealed'||row.status==='executed')&&row.sealedTick===undefined)||
      ((row.status==='open'||row.status==='declined'||row.status==='closed')&&row.sealedTick!==undefined)||
      ((row.status==='closed'||row.status==='declined')&&row.closedTick!==row.openedTick)||
      (row.status==='expired'&&(row.closedTick??0)<=row.openedTick)||
      (row.status==='executed')!==(row.execution!==undefined))return fail(path+'.status');
    const execution=row.execution;
    if(execution){
      const base=`evt-${execution.tick}-${row.targetId}`;
      const isConfrontation=execution.effect==='confronted';
      if(execution.tick!==row.openedTick+1||execution.tick!==row.closedTick||execution.effect!==executedEffect[row.aim]||
        covered.has(execution.eventId)||(isConfrontation?![`${base}-duel`,`${base}-kill`].includes(execution.eventId):
          execution.eventId!==`${base}-audience-${execution.effect}`))return fail(path+'.execution');
      if(!isConfrontation&&execution.tick===world.tick&&(execution.effect==='left'?target.sectId!=='':
        target.technique.id!==RING_AUDIENCE_TABOO_TECHNIQUE))return fail(path+'.execution');
      const authoritative=originals.get(execution.eventId);
      // An actual just-committed source must still be present except if the
      // native 120-entry hot feed was already full of that same frame.
      if(!authoritative&&execution.tick===world.tick&&
        (world.events.length<NATIVE_HOT_EVENT_LIMIT||world.events.some(event=>event.tick<execution.tick)))
        return fail(path+'.execution');
      if(authoritative){
        const source=authoritative[0];
        if(authoritative.length!==1||source.tick!==execution.tick||source.actorIds[0]!==row.targetId||!source.locationId||
          !sites.has(source.locationId)||(isConfrontation?
            source.category!==(source.id.endsWith('-kill')?'death':'combat')||source.actorIds.length!==2||
            source.actorIds[1]!==row.leaderId||source.duelWinnerId===undefined||!source.actorIds.includes(source.duelWinnerId)
            :!privateSources.has(source.id)))return fail(path+'.event');
      }
      covered.add(execution.eventId);
    }
    prior=row;
    previousSerial=serial;
  }
  if(previousSerial!==state.nextId-1)return fail(path+'.session');
  for(const event of privateSources.values()){
    if(covered.has(event.id))continue;
    // Many unopened/closed conversations can rotate the bounded session tail
    // before an independently valid native outcome rotates out of the hot feed.
    if(state.sessions.length!==RING_AUDIENCE_MAX_SESSIONS||serialOf(state.sessions[0].id)<=1||
      event.tick>state.sessions[0].openedTick)return fail(path+'.event');
  }
}
