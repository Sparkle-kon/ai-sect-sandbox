import type {AscensionTerminal,AscensionTrial,AscensionWaveNumber} from '../types/ascension';
import type {ChronicleAnchor,Cultivator,LocationNode,WorldEvent,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {ASCENSION_WAVES,IMMORTAL_ASCENSION_ADDRESS,ascensionEventId,type AscensionEventToken} from './ascensionTerms';

export const unique=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  let found:T|undefined;
  for(const row of rows){if(row.id!==id)continue;if(found)return undefined;found=row;}
  return found;
};
export const awake=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&actor.alive&&actor.hp>0;
export function openSite(world:WorldState,siteId:string):LocationNode|undefined{
  const site=unique(world.locations,siteId);
  return site&&site.id!==IMMORTAL_ASCENSION_ADDRESS&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site)?site:undefined;
}
export const inPeak=(actor:Cultivator)=>actor.realm==='渡劫'&&actor.realmStage===9;
type Success=AscensionTrial&{terminal:AscensionTerminal&{status:'succeeded'}};
function exactSource(event:WorldEvent|ChronicleAnchor,trial:AscensionTrial,token:AscensionEventToken,tick:number,year:number,month:number){
  return event.id===ascensionEventId(trial.actorId,tick,token)&&event.tick===tick&&event.year===year&&event.month===month&&
    event.locationId===trial.siteId&&event.actorIds.length===1&&event.actorIds[0]===trial.actorId&&
    (!('witnessScope' in event)||event.witnessScope===undefined)&&event.category===(token.startsWith('failed-')?'death':'heavenly');
}
export function verifiedImmortalAscension(world:WorldState,actor:Cultivator):Success|undefined{
  if(!awake(actor)||actor.positionPlane!=='immortal'||actor.locationId!==IMMORTAL_ASCENSION_ADDRESS||actor.sectId!==''||!inPeak(actor)||
    unique(world.cultivators,actor.id)!==actor||world.locations.some(row=>row.id===IMMORTAL_ASCENSION_ADDRESS))return undefined;
  const rows=(world.ascension?.trials??[]).filter(row=>row.actorId===actor.id&&row.phase==='succeeded'),trial=rows[0];
  const end=trial?.terminal,last=trial?.waves.at(-1);
  if(rows.length!==1||!end||end.status!=='succeeded'||end.tick>world.tick||trial.waves.length!==ASCENSION_WAVES||
    !last||last.wave!==ASCENSION_WAVES||last.afterHp<=0||last.tick!==end.tick||last.eventId!==end.eventId||
    end.eventId!==ascensionEventId(actor.id,end.tick,'succeeded')||!openSite(world,trial.siteId))return undefined;
  const originals=world.events.filter(row=>row.id===end.eventId);
  if(originals.length>1||originals.some(row=>!exactSource(row,trial,'succeeded',end.tick,end.year,end.month)))return undefined;
  const anchors=[...world.chronicleArchive.anchors,...[...world.chronicleArchive.chapters,...world.coldHistory.chapters].flatMap(row=>row.anchors)];
  if(anchors.some(row=>row.id===end.eventId&&!exactSource(row,trial,'succeeded',end.tick,end.year,end.month)))return undefined;
  return {...trial,terminal:{...end,status:'succeeded'}};
}
export interface AscensionEventProof{
  actorId:string;siteId:string;eventId:string;tick:number;phase:'warning'|'wave'|'succeeded'|'failed'|'retreated';wave?:AscensionWaveNumber;
}
/** Exact recent visual source: no guess from the title, no preview audio. */
export function ascensionEventProof(world:WorldState,issue:WorldEvent):AscensionEventProof|undefined{
  if(issue.tick!==world.tick||!world.events.includes(issue)||world.events.filter(row=>row.id===issue.id).length!==1)return undefined;
  for(const trial of world.ascension?.trials??[]){
    if(!openSite(world,trial.siteId)||issue.actorIds[0]!==trial.actorId)continue;
    const base={actorId:trial.actorId,siteId:trial.siteId,eventId:issue.id,tick:issue.tick};
    if(exactSource(issue,trial,'warning',trial.startedTick,trial.startedYear,trial.startedMonth))return {...base,phase:'warning'};
    const wave=trial.waves.find(row=>row.eventId===issue.id),end=trial.terminal;
    if(wave){
      const token=end?.eventId===issue.id?(end.status==='succeeded'?'succeeded':`failed-${wave.wave}` as const):`wave-${wave.wave}` as const;
      const actor=unique(world.cultivators,trial.actorId);
      if(token==='succeeded'&&(!awake(actor)||actor.positionPlane!=='immortal'||actor.locationId!==IMMORTAL_ASCENSION_ADDRESS||
        wave.wave!==ASCENSION_WAVES||wave.afterHp<=0))continue;
      if(token.startsWith('failed-')&&(!actor||actor.alive||actor.hp!==0||wave.afterHp!==0))continue;
      if(exactSource(issue,trial,token,wave.tick,wave.year,wave.month)&&issue.damage?.length===1&&
        issue.damage[0].cultivatorId===trial.actorId&&issue.damage[0].amount===wave.beforeHp-wave.afterHp)
        return {...base,phase:token==='succeeded'?'succeeded':token.startsWith('failed-')?'failed':'wave',wave:wave.wave};
    }
    if(end?.status==='retreated'&&exactSource(issue,trial,'retreated',end.tick,end.year,end.month))return {...base,phase:'retreated'};
  }
  return undefined;
}
