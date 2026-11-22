import type {Cultivator,WorldState} from '../types/world';
import {activeAvatar} from './avatarEngine';
import {availableExpeditionRescueActions,type ExpeditionRescueOption} from './expeditionRescueEngine';
import {activeHeartDemonAftermath} from './heartDemonAftermathEngine';

const stableId=(a:string,b:string)=>a<b?-1:a>b?1:0;
const hpRatio=(body:Cultivator)=>body.hp/Math.max(1,body.maxHp);
const concreteBody=(world:WorldState,id:string)=>{
  const matches=world.cultivators.filter(row=>row.id===id);
  const body=matches.length===1?matches[0]:undefined;
  return body?.alive&&body.hp>0&&body.positionPlane===undefined?body:undefined;
};

/** No memory identities or unsupported conclusions ever leave the native choice path. */
export function verifiedHeartDemonChoiceEffect(world:WorldState,actor:Cultivator,executionTick=world.tick) {
  if(!actor.heartDemonAftermath||concreteBody(world,actor.id)!==actor||
    executionTick!==world.tick&&executionTick!==world.tick+1)return undefined;
  return activeHeartDemonAftermath(world,actor,executionTick);
}

export function voluntaryHeartDemonChoiceEffect(world:WorldState,actor:Cultivator,executionTick=world.tick){
  const effect=verifiedHeartDemonChoiceEffect(world,actor,executionTick);
  return effect&&activeAvatar(world)!==actor?effect:undefined;
}

function affinity(world:WorldState,actor:Cultivator,peer:Cultivator):number|undefined {
  const rows=world.relationships.filter(row=>row.fromId===actor.id&&row.toId===peer.id||
    row.toId===actor.id&&row.fromId===peer.id);
  return rows.length===1&&rows[0].type!=='血仇'&&Number.isFinite(rows[0].affinity)?rows[0].affinity:undefined;
}
const sharedSect=(a:Cultivator,b:Cultivator)=>Boolean(a.sectId&&a.sectId===b.sectId);

/** Input is freshly enumerated native permissions. Only a new discretionary acceptance can be narrowed. */
export function autonomousExpeditionRescueOptions(actor:Cultivator,world:WorldState,executionTick=world.tick):ExpeditionRescueOption[]{
  const menu=availableExpeditionRescueActions(actor,world,executionTick);
  const row=verifiedHeartDemonChoiceEffect(world,actor,executionTick);
  if(!row||!menu.some(option=>option.rescueMove==='accept'))return menu;
  const retained=menu.filter(option=>option.rescueMove!=='accept');
  if(activeAvatar(world)===actor)return retained;
  const health=hpRatio(actor);
  const failed=row.outcome==='failed';
  const allowed=menu.flatMap(option=>{
    if(option.rescueMove!=='accept')return [];
    const signals=world.expeditionRescues.requests.filter(signal=>signal.id===option.targetExpeditionRescueId);
    const peer=signals.length===1?concreteBody(world,signals[0].explorerId):undefined;
    if(!peer||peer.locationId!==actor.locationId)return [];
    const trust=affinity(world,actor,peer)??0;
    const injury=hpRatio(peer);
    if(row.choice==='sever'&&(health<(failed?.90:.82)||trust<45))return [];
    if(row.choice==='wrath'&&(health<(failed?.92:.84)||injury<.47))return [];
    if(row.choice==='face'&&health<(failed?.73:.65))return [];
    return [{option,peer,trust,injury}];
  });
  allowed.sort((a,b)=>{
    const byInjury=row.choice==='face'?a.injury-b.injury:row.choice==='wrath'?b.injury-a.injury:0;
    return byInjury||b.trust-a.trust||stableId(a.peer.id,b.peer.id)||
      stableId(a.option.targetExpeditionRescueId,b.option.targetExpeditionRescueId);
  });
  return allowed[0]?[...retained,allowed[0].option]:retained;
}

/** Exact voluntary refusal to sign a new witnessed rescue, not a generic heal or release. */
export function canPauseAftermathRescue(actor:Cultivator,world:WorldState,executionTick=world.tick):boolean{
  if(!voluntaryHeartDemonChoiceEffect(world,actor,executionTick))return false;
  const menu=autonomousExpeditionRescueOptions(actor,world,executionTick);
  return menu.length>0&&menu.every(option=>option.rescueMove==='accept');
}

/** Legal social target IDs only. This chooses a partner, never whether to socialize or how a bond develops. */
export function preferredHeartDemonSocialTarget(world:WorldState,actor:Cultivator,legalIds:readonly string[],executionTick=world.tick):string|undefined{
  const row=voluntaryHeartDemonChoiceEffect(world,actor,executionTick);
  if(!row)return undefined;
  const peers=[...new Set(legalIds)].flatMap(id=>{
    const body=concreteBody(world,id);
    if(!body||body===actor||body.locationId!==actor.locationId)return [];
    const regard=affinity(world,actor,body);
    const trust=regard??0, sameSect=sharedSect(actor,body);
    // A strained but non-hostile genuine tie may be approached; a stranger is not a repair target.
    const repair=regard!==undefined&&trust>=-18&&trust<=32;
    return [{body,trust,sameSect,repair}];
  });
  peers.sort((a,b)=> (row.choice==='sever'
    ? b.trust-a.trust||Number(b.sameSect)-Number(a.sameSect)
    : row.choice==='wrath'
      ? Number(b.repair)-Number(a.repair)||Number(b.sameSect)-Number(a.sameSect)||hpRatio(b.body)-hpRatio(a.body)
      : Number(a.sameSect)-Number(b.sameSect)||b.trust-a.trust)||
    stableId(a.body.id,b.body.id));
  return peers[0]?.body.id;
}
