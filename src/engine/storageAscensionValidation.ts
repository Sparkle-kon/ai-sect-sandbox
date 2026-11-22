import type { AscensionTrial,AscensionWave } from '../types/ascension';
import type { ChronicleAnchor,WorldEvent,WorldState } from '../types/world';
import {
  ASCENSION_OPEN_QI,ASCENSION_QI,ASCENSION_RETRY_TICKS,ASCENSION_TRIAL_HISTORY,ASCENSION_WAVES,IMMORTAL_ASCENSION_ADDRESS,
  ascensionDamage,ascensionEventId,ascensionTrialId,type AscensionEventToken,
} from './ascensionTerms';

type Fail=(path:string)=>never;
type Date={tick:number;year:number;month:number};
type Source={trial:AscensionTrial;date:Date;token:AscensionEventToken;wave?:AscensionWave};
const path='ascension';
const privateSource=(id:string)=>eventPattern.exec(id)?.[3]==='interrupted';
const eventPattern=/^evt-([1-9]\d*)-(.+)-ascension-(warning|retreated|succeeded|interrupted|wave-[123]|failed-[123])$/u;
const calendar=(date:{year:number;month:number})=>date.year*12+date.month;
const sameDay=(a:Date,b:Date)=>a.tick===b.tick&&a.year===b.year&&a.month===b.month;
const later=(a:Date,b:Date)=>a.tick>b.tick&&calendar(a)>calendar(b);
const startDate=(row:AscensionTrial):Date=>({tick:row.startedTick,year:row.startedYear,month:row.startedMonth});

/** Permanent ascension is an irreversible native record, not a reversible
 * Upper Passage graph node, an arbitrary map coordinate, or an inferred death. */
export function validateAscensionHistory(world:WorldState,fail:Fail):void{
  const state=world.ascension;
  const planeActors=world.cultivators.filter(row=>row.positionPlane==='immortal'||row.locationId===IMMORTAL_ASCENSION_ADDRESS);
  const hot=world.events.filter(row=>eventPattern.test(row.id));
  const archives=[...world.chronicleArchive.anchors,...world.chronicleArchive.chapters.flatMap(row=>row.anchors),
    ...world.coldHistory.chapters.flatMap(row=>row.anchors)];
  if(archives.some(row=>privateSource(row.id))||
    world.chronicleCausality.nodes.some(row=>privateSource(row.eventId))||
    world.chronicleErrata.sources.some(row=>privateSource(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>privateSource(row.source.sourceEventId))||
    world.witnesses.facts.some(row=>privateSource(row.eventId))||
    world.witnessedPersonalStory.scenes.some(row=>privateSource(row.eventId))||
    world.protagonistSuccession.arcs.some(row=>row.opening.some(evidence=>privateSource(evidence.eventId))||
      row.support.some(evidence=>privateSource(evidence.eventId))||!!row.death&&privateSource(row.death.eventId))||
    world.cultivators.some(actor=>actor.rumors.some(row=>!!row.originEventId&&privateSource(row.originEventId)||
      row.id.startsWith('rumor-')&&privateSource(row.id.slice('rumor-'.length)))))return fail(path+'.privateSource');
  if(world.locations.some(row=>row.id===IMMORTAL_ASCENSION_ADDRESS)||
    world.events.some(row=>row.locationId===IMMORTAL_ASCENSION_ADDRESS)||
    archives.some(row=>row.locationId===IMMORTAL_ASCENSION_ADDRESS)||
    world.mapPresentation.effects.some(row=>row.locationId===IMMORTAL_ASCENSION_ADDRESS)||
    world.mapPresentation.trails.some(row=>row.fromLocationId===IMMORTAL_ASCENSION_ADDRESS||row.toLocationId===IMMORTAL_ASCENSION_ADDRESS))
    return fail(path+'.address');
  if(!state){
    if(planeActors.length||hot.length||archives.some(row=>eventPattern.test(row.id)))return fail(path+'.authority');
    return;
  }
  if(!state.trials.length)return fail(path+'.trials');
  const actors=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const venues=new Map(world.locations.map(site=>[site.id,site]));
  const sects=new Set(world.sects.map(sect=>sect.id));
  const successes=new Set<string>();
  const previous=new Map<string,AscensionTrial>();
  const count=new Map<string,number>();
  const used=new Set<string>();
  const expected=new Map<string,Source>();
  const note=(trial:AscensionTrial,date:Date,token:AscensionEventToken,wave?:AscensionWave)=>{
    const id=ascensionEventId(trial.actorId,date.tick,token);
    if(expected.has(id))return fail(path+'.source');
    expected.set(id,{trial,date,token,wave});
  };
  const validDate=(date:Date)=>date.tick>0&&date.tick<=world.tick&&calendar(date)<=calendar(world)&&
    (date.tick!==world.tick||sameDay(date,world));
  let lastStart=0;
  for(const trial of state.trials){
    const actor=actors.get(trial.actorId),site=venues.get(trial.siteId),opened=startDate(trial);
    const n=(count.get(trial.actorId)??0)+1,prior=previous.get(trial.actorId);
    if(!actor||!site||site.type==='abyss'||site.type==='secret_realm'||site.expeditionOmenId!==undefined||
      trial.sectIdBefore!==''&&!sects.has(trial.sectIdBefore)||trial.id!==ascensionTrialId(trial.actorId,trial.startedTick)||
      used.has(trial.id)||!validDate(opened)||trial.startedTick<lastStart||trial.openingQiPaid!==ASCENSION_OPEN_QI||
      n>ASCENSION_TRIAL_HISTORY||prior&&(!prior.terminal||prior.phase==='succeeded'||
        !later(opened,prior.terminal)||trial.startedTick<prior.terminal.tick+ASCENSION_RETRY_TICKS))
      return fail(path+'.trial');
    lastStart=opened.tick;
    used.add(trial.id);count.set(trial.actorId,n);previous.set(trial.actorId,trial);
    note(trial,opened,'warning');
    let recent=opened,lastWave:AscensionWave|undefined;
    for(const [i,wave] of trial.waves.entries()){
      const end=wave.afterHp===0?`failed-${wave.wave}` as const:
        wave.wave===ASCENSION_WAVES?'succeeded':`wave-${wave.wave}` as const;
      if(wave.wave!==i+1||!validDate(wave)||!later(wave,recent)||wave.beforeHp<=0||wave.beforeHp>wave.maxHp||
        wave.afterHp!==Math.max(0,wave.beforeHp-ascensionDamage(wave.maxHp,wave.wave,wave.stance))||
        wave.qiPaid!==ASCENSION_QI[wave.stance]||wave.qiBefore<wave.qiPaid||
        wave.eventId!==ascensionEventId(trial.actorId,wave.tick,end)||
        i>0&&lastWave?.afterHp===0)return fail(path+'.wave');
      note(trial,wave,end,wave);
      recent=wave;lastWave=wave;
    }
    const terminal=trial.terminal,active=trial.phase==='warning'||trial.phase==='lightning';
    if(active!==(terminal===undefined))return fail(path+'.terminal');
    if(!terminal){
      if(trial.waves.length>=ASCENSION_WAVES||lastWave?.afterHp===0||
        (trial.phase==='warning')!==(trial.waves.length===0)||
        !actor.alive||actor.hp<=0||actor.positionPlane!==undefined||actor.locationId!==trial.siteId||
        actor.realm!=='渡劫'||actor.realmStage!==9)return fail(path+'.active');
      continue;
    }
    if(!validDate(terminal)||terminal.status!==trial.phase||
      terminal.reason!=='interrupted'&&(actor.realm!=='渡劫'||actor.realmStage!==9))return fail(path+'.terminal');
    if(terminal.status==='succeeded'){
      if(terminal.reason!==undefined||!lastWave||lastWave.wave!==ASCENSION_WAVES||lastWave.afterHp<=0||
        !sameDay(terminal,lastWave)||terminal.eventId!==lastWave.eventId||successes.has(actor.id)||
        actor.positionPlane!=='immortal'||actor.locationId!==IMMORTAL_ASCENSION_ADDRESS||actor.sectId!==''||
        !actor.alive||actor.hp!==lastWave.afterHp||actor.maxHp!==lastWave.maxHp||actor.qiProgress!==lastWave.qiBefore-lastWave.qiPaid||
        actor.realm!=='渡劫'||actor.realmStage!==9||
        world.playerAvatar.possessedId===actor.id||world.playerAvatar.pendingOrder?.actorId===actor.id)
        return fail(path+'.success');
      successes.add(actor.id);
    }else if(terminal.status==='failed'&&terminal.reason==='lightning'){
      if(!lastWave||lastWave.afterHp!==0||!sameDay(terminal,lastWave)||terminal.eventId!==lastWave.eventId||
        actor.alive||actor.hp!==0)return fail(path+'.failure');
    }else{
      const token=terminal.status==='retreated'?'retreated':'interrupted';
      if((terminal.status==='retreated'?terminal.reason!==undefined:terminal.reason!=='interrupted')||
        trial.waves.length>=ASCENSION_WAVES||lastWave?.afterHp===0||
        !(later(terminal,recent)||token==='interrupted'&&sameDay(terminal,recent))||
        terminal.eventId!==ascensionEventId(actor.id,terminal.tick,token))return fail(path+'.terminal');
      note(trial,terminal,token);
    }
  }
  for(const actor of planeActors)if(!successes.has(actor.id))return fail(path+'.authority');
  const limit=(id:string,tick:number)=>count.get(id)===ASCENSION_TRIAL_HISTORY&&
    tick<state.trials.find(trial=>trial.actorId===id)!.startedTick;
  const sourceMatches=(event:WorldEvent|ChronicleAnchor,source:Source)=>sameDay(event,source.date)&&
    event.locationId===source.trial.siteId&&event.actorIds.length===1&&event.actorIds[0]===source.trial.actorId&&
    (!('witnessScope' in event)||event.witnessScope===(source.token==='interrupted'?'participants':undefined))&&
    event.category===(source.token.startsWith('failed-')?'death':'heavenly');
  const hotMatches=(event:WorldEvent,source:Source)=>sourceMatches(event,source)&&
    event.witnessScope===(source.token==='interrupted'?'participants':undefined)&&
    event.dialogue===undefined&&event.duelWinnerId===undefined&&event.forbiddenArt===undefined&&event.daoIntents===undefined&&
    (source.wave?event.damage?.length===1&&event.damage[0].cultivatorId===source.trial.actorId&&
      event.damage[0].amount===source.wave.beforeHp-source.wave.afterHp:event.damage===undefined);
  const seen=new Set<string>();
  const oldestHot=world.events.reduce((min,event)=>Math.min(min,event.tick),Infinity);
  for(const event of hot){
    const [,tick,id]=eventPattern.exec(event.id)!;
    const source=expected.get(event.id);
    if(seen.has(event.id)||Number(tick)!==event.tick||!validDate(event)||
      (source?!hotMatches(event,source):!limit(id,event.tick)||!actors.has(id)||
        event.witnessScope!==(privateSource(event.id)?'participants':undefined)))return fail(path+'.source');
    seen.add(event.id);
  }
  for(const [id,source] of expected)
    if(!seen.has(id)&&(source.date.tick>oldestHot||source.date.tick===world.tick&&world.events.length<120))return fail(path+'.source');
  const archive=(event:ChronicleAnchor)=>{
    if(event.locationId===IMMORTAL_ASCENSION_ADDRESS)return fail(path+'.address');
    const match=eventPattern.exec(event.id);
    if(!match)return;
    const source=expected.get(event.id);
    if(source?!sourceMatches(event,source):!limit(match[2],event.tick))return fail(path+'.source');
  };
  archives.forEach(archive);
}
