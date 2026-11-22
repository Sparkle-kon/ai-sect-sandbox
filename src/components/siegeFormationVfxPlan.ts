import type {GrandSiegeHeroResult,GrandSiegeRound} from '../types/grandSiege';
import type {Cultivator,LocationNode,MapPoint,SectSiege,WorldEvent,WorldState} from '../types/world';
import {projectDaoDuelIntents} from '../engine/daoPathEngine';
import {DAO_INTENT_QI,DAO_PATHS} from '../engine/daoPathTerms';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {roundEventId} from '../engine/grandSiegeProof';
import {GRAND_SIEGE_HERO_COSTS} from '../engine/grandSiegeTheatreEngine';
import {isOrdinaryActionEvidence} from '../engine/ordinaryActionEvidence';
import {isSectActive} from '../engine/sectActivity';

export interface SiegeFormationFrame{
  readonly sourceId:string;
  readonly center:MapPoint;
  readonly breaths:readonly MapPoint[];
  readonly hits:readonly {readonly from:MapPoint;readonly to:MapPoint;readonly kind:'vanguard'|'signature'}[];
  readonly guard?:MapPoint;
}
type ActorPoint=MapPoint&{actor:Cultivator};
type Hit=SiegeFormationFrame['hits'][number];
const MAX_FRAMES=8,MAX_BREATHS=6,MAX_SIGNATURES=2,MAX_LOCAL_MARKER_DISTANCE=100;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const positive=(value:number)=>Number.isFinite(value)&&value>0;
function unique<T extends {id:string}>(rows:readonly T[]){
  const out=new Map<string,T|undefined>();
  for(const row of rows)out.set(row.id,out.has(row.id)?undefined:row);
  return out;
}
const point=({x,y}:MapPoint):MapPoint=>({x,y});
const finite=({x,y}:MapPoint)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1000&&y>=0&&y<=600;
const samePair=(a:MapPoint,b:MapPoint)=>a.x===b.x&&a.y===b.y;

function validGuard(hero:GrandSiegeHeroResult|undefined,round:GrandSiegeRound,defenderId:string){
  if(!hero||!Object.hasOwn(GRAND_SIEGE_HERO_COSTS,hero.move)||!['player','utility','model'].includes(hero.origin))return undefined;
  const costs=GRAND_SIEGE_HERO_COSTS[hero.move];
  const rank=hero.move==='elder-rescue'?'太上长老':'掌门';
  if(hero.rank!==rank||hero.paidQi!==costs.qi||hero.paidHp!==costs.hp||!positive(hero.wallSaved)||
    hero.wallSaved>costs.wall||hero.wallSaved>round.wallBefore||
    !round.defenders.some(row=>row.actorId===hero.actorId&&row.sectId===defenderId&&row.rank===rank))return undefined;
  return hero;
}
function rawFrontMatches(event:WorldEvent|undefined,round:GrandSiegeRound):boolean{
  if(!event)return false;
  const ids=new Set<string>();
  if(round.clash){ids.add(round.clash.attackerId);ids.add(round.clash.defenderId);}
  if(round.hero)ids.add(round.hero.actorId);
  return event.title===(round.hero?'重阵将倾，有人死守':'叩关之际，两锋出阵')&&
    event.category===(round.clash?'combat':'diplomacy')&&ids.size===event.actorIds.length&&
    [...ids].every((id,i)=>event.actorIds[i]===id);
}
function eyeSource(world:WorldState,siege:SectSiege,round:GrandSiegeRound,event:WorldEvent,after:number,max:number):boolean{
  const theatre=siege.theatre;
  if(!theatre||!Number.isSafeInteger(theatre.arrivedTick)||theatre.arrivedTick===undefined||
    theatre.arrivedTick<=siege.startedTick||theatre.arrivedTick>=world.tick||siege.lastResolvedTick!==world.tick||
    round.round!==siege.rounds||round.round<1||round.round!==theatre.rounds.length||round.tick!==world.tick||
    event.id!==roundEventId(world.tick,siege.id)||round.sourceEventId!==event.id||round.wallAfter!==after||round.wallMax!==max||
    !positive(round.wallBefore)||round.wallBefore>max||!Number.isFinite(after)||after<0||after>round.wallBefore||
    event.category!=='diplomacy'||!round.attackers.some(row=>siege.participantIds.includes(row.actorId)&&event.actorIds.includes(row.actorId)))return false;
  if(siege.status==='sieging')return !theatre.terminal&&event.title==='护山阵接战'&&
    event.description===`护山阵受损${round.wallBefore-after}，尚余${after}阵力。`;
  const close=theatre.terminal;
  return (siege.status==='victory'||siege.status==='repelled')&&close?.battlefield===true&&close.status===siege.status&&
    close.tick===world.tick&&close.sourceEventId===event.id&&event.title===(siege.status==='victory'?'攻山告捷':'攻山退兵');
}

/** Receipts only: no array eye, body, charge or stroke is inferred from readiness, scenery or player selection. */
export function projectSiegeFormationVfx(world:WorldState,sites:ReadonlyMap<string,LocationNode>,
  isCurrentLocation:(id:string)=>boolean,actors:readonly ActorPoint[]):SiegeFormationFrame[]{
  if(!world.sieges.some(siege=>siege.theatre?.rounds.at(-1)?.tick===world.tick))return [];
  const registered=unique(world.locations),sects=unique(world.sects),people=unique(world.cultivators);
  const campaigns=unique(world.sieges),raw=unique(world.events),visible=new Map<string,ActorPoint|undefined>();
  const here=(siteId:string,id:string)=>{
    const row=raw.get(id);
    return row?.tick===world.tick&&row.year===world.year&&row.month===world.month&&row.locationId===siteId&&
      row.witnessScope===undefined?row:undefined;
  };
  for(const p of actors){
    const a=p.actor;
    if(people.get(a.id)!==a||!a.alive||a.hp<=0||a.positionPlane!==undefined||!finite(p)||!isCurrentLocation(a.locationId))continue;
    visible.set(a.id,visible.has(a.id)?undefined:p);
  }
  const frames:SiegeFormationFrame[]=[];
  const claimedSites=new Map<string,SectSiege|undefined>();
  for(const siege of campaigns.values())if(siege?.theatre?.rounds.at(-1)?.tick===world.tick)
    claimedSites.set(siege.destinationId,claimedSites.has(siege.destinationId)?undefined:siege);
  for(const [siteId,site] of [...sites].sort(([a],[b])=>cmp(a,b))){
    if(frames.length===MAX_FRAMES)break;
    const siege=claimedSites.get(siteId);
    if(!siege||registered.get(siteId)!==site||!finite(site)||isScopedExpeditionGate(site)||!isCurrentLocation(siteId))continue;
    const round=siege?.theatre?.rounds.at(-1);
    if(!siege||!round||campaigns.get(siege.id)!==siege||siege.attackerSectId===siege.defenderSectId)continue;
    const front=sects.get(siege.attackerSectId),defender=sects.get(siege.defenderSectId);
    if(!isSectActive(front)||!isSectActive(defender)||front.alignment===defender.alignment||
      front.alignment==='中立'||defender.alignment==='中立'||defender.headquartersId!==siteId||
      site.ownerSectId!==undefined&&site.ownerSectId!==defender.id||!positive(defender.facilities.defense_array))continue;
    const source=here(siteId,round.sourceEventId);
    if(!source||!eyeSource(world,siege,round,source,defender.arrayHp,defender.arrayMaxHp))continue;
    const frontReceipt=here(siteId,`evt-${world.tick}-${siege.id}-front-theatre`);
    const hasFrontReceipt=rawFrontMatches(frontReceipt,round);
    const hero=hasFrontReceipt?validGuard(round.hero,round,defender.id):undefined;
    if(round.wallBefore===round.wallAfter&&!hero)continue;
    const roster=unique([...round.attackers,...round.defenders].map(row=>({id:row.actorId,sectId:row.sectId})));
    const participant=(id:string)=>{
      const current=visible.get(id);
      const stamp=roster.get(id);
      return stamp&&current?.actor.locationId===siteId&&current.actor.sectId===stamp.sectId&&
        Math.hypot(current.x-site.x,current.y-site.y)<=MAX_LOCAL_MARKER_DISTANCE?current:undefined;
    };
    const breaths:MapPoint[]=[];
    for(const id of [...roster.keys()].sort(cmp)){
      const actor=participant(id);
      const evidence=actor?.actor.ordinaryActionEvidence;
      if(actor&&evidence?.tick===world.tick&&isOrdinaryActionEvidence(evidence,world.tick)&&
        (evidence.action==='REST'||evidence.action==='CULTIVATE')&&evidence.action===actor.actor.currentAction)breaths.push(point(actor));
      if(breaths.length>=MAX_BREATHS)break;
    }
    const hits:Hit[]=[];
    const clash=round.clash;
    if(clash&&hasFrontReceipt&&clash.attackerId!==clash.defenderId&&
      round.attackers.some(row=>row.actorId===clash.attackerId)&&round.defenders.some(row=>row.actorId===clash.defenderId)&&
      (clash.winnerId===clash.attackerId||clash.winnerId===clash.defenderId)){
      const a=participant(clash.attackerId),d=participant(clash.defenderId);
      const actualDamage=(id:string,amount:number)=>positive(amount)&&amount<=12&&
        (!frontReceipt?.damage||frontReceipt.damage.filter(entry=>entry.cultivatorId===id).length===1&&
          frontReceipt.damage.some(entry=>entry.cultivatorId===id&&entry.amount===amount));
      if(a&&d&&!samePair(a,d)){
        if(actualDamage(a.actor.id,clash.attackerDamage))hits.push({from:point(d),to:point(a),kind:'vanguard'});
        if(actualDamage(d.actor.id,clash.defenderDamage))hits.push({from:point(a),to:point(d),kind:'vanguard'});
      }
    }
    let signatures=0;
    if(world.events.some(event=>event.tick===world.tick&&event.locationId===siteId&&event.daoIntents?.length)){
      const opposing=(a:string,b:string)=>round.attackers.some(row=>row.actorId===a)&&round.defenders.some(row=>row.actorId===b)||
        round.attackers.some(row=>row.actorId===b)&&round.defenders.some(row=>row.actorId===a);
      for(const event of world.events){
        if(signatures>=MAX_SIGNATURES)break;
        if(event!==here(siteId,event.id)||event.actorIds.length!==2||!event.duelWinnerId||
          !event.actorIds.includes(event.duelWinnerId)||!event.daoIntents?.length||
          !opposing(event.actorIds[0],event.actorIds[1])||
          !(event.category==='combat'&&event.id===`evt-${world.tick}-${event.actorIds[0]}-duel`||
            event.category==='death'&&event.id===`evt-${world.tick}-${event.actorIds[0]}-kill`))continue;
        for(const paid of projectDaoDuelIntents(world,event)){
          if(signatures>=MAX_SIGNATURES)break;
          const rival=event.actorIds.find(id=>id!==paid.actorId);
          const from=participant(paid.actorId),to=rival===undefined?undefined:participant(rival);
          const damage=rival===undefined?undefined:event.damage?.filter(row=>row.cultivatorId===rival);
          if(!from||!to||samePair(from,to)||!Object.hasOwn(DAO_PATHS,paid.pathId)||paid.qiPaid!==DAO_INTENT_QI||
            ![1,2,3].includes(paid.rank)||event.daoIntents.filter(row=>row.actorId===paid.actorId).length!==1||
            damage?.length!==1||!positive(damage[0].amount))continue;
          hits.push({from:point(from),to:point(to),kind:'signature'});signatures++;
        }
      }
    }
    const guard=hero?participant(hero.actorId):undefined;
    frames.push({sourceId:source.id,center:point(site),breaths,hits,...(guard?{guard:point(guard)}:{})});
  }
  return frames;
}
