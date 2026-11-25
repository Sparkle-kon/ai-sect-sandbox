import {adjustSectAffinity,sectRelation} from './diplomacyEngine';
import {directorKnownReachableSites,directorSiteIsSafe} from './director/nudgeIntegrations';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {marketClosureReason} from './marketEngine';
import {findMapPath} from './mapMotionEngine';
import {availableSettlementActions,resolveSettlementAction} from './settlementEngine';
import {adjustRelationship} from './relationships';
import {flowActor,flowSect,recordResourceFlow} from './resourceFlowEngine';
import {isSectActive} from './sectActivity';
import {isRetiredFromService} from './serviceRetirementEngine';
import {noteTerrainVisit,terrainTileAt} from './terrainEngine';
import {weatherTravelFriction} from './weatherEngine';
import type {Cultivator,LocationNode,MapTile,WorldEvent,WorldState} from '../types/world';
import type {SectErrandJob,SectErrandPlan,SectErrandOutcome,SectJobObservation,SectJobReportEffect} from '../types/sectJobs';

export const SECT_ERRAND_JOBS=['explore','stall','deliver','recruit','challenge','matchmaking'] as const;
export function isSectErrandJob(value:string):value is SectErrandJob{return SECT_ERRAND_JOBS.some(job=>job===value);}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const MAX_TREASURY=1_000_000_000;
const passable=(tile:MapTile)=>tile.biome!=='魔渊'&&tile.biome!=='毒沼';
const safeSite=(world:WorldState,site:LocationNode)=>site.type!=='secret_realm'&&
  !!terrainTileAt(world,site.x,site.y)&&directorSiteIsSafe(world,site);
const format:Readonly<Record<SectErrandJob,string>>={
  explore:'下山历练',stall:'摆摊',deliver:'送货',recruit:'访徒',challenge:'赴擂',matchmaking:'联谊',
};
export const sectErrandEventId=(tick:number,actorId:string,job:SectErrandJob)=>`evt-${tick}-${actorId}-sect-errand-${job}`;

export function planSectErrand(world:WorldState,actor:Cultivator,job:SectErrandJob,actionTick:number):SectErrandPlan|undefined{
  const managed=world.sectManagement;
  const start=world.locations.find(site=>site.id===actor.locationId);
  const home=world.locations.find(site=>site.id===managed?.homeSiteId&&site.ownerSectId===managed.sectId);
  if(!managed||!start||!home||!safeSite(world,start)||!safeSite(world,home))return;
  const hereAndKnown=[start,...directorKnownReachableSites(world,actor)];
  const openMarket=(site:LocationNode)=>site.type==='market'&&!marketClosureReason(actionTick===world.tick?world:{...world,tick:actionTick},site.id);
  const village=(site:LocationNode)=>world.settlements.villages.some(row=>row.locationId===site.id&&row.population>0);
  const allowed=(site:LocationNode)=>safeSite(world,site)&&(job==='explore'?site!==start:
    job==='recruit'?village(site):job==='challenge'?site.type==='sect_hq'&&site.ownerSectId!==actor.sectId&&
      isSectActive(world.sects.find(sect=>sect.id===site.ownerSectId)):openMarket(site));
  for(const destination of hereAndKnown.filter(allowed)){
    const outbound=findMapPath(world,start,destination,passable),back=findMapPath(world,destination,home,passable);
    if(!outbound.length||!back.length)continue;
    return {kind:'errand',phase:'performed',job,siteId:destination.id,fromId:start.id,homeId:home.id,
      path:[...outbound,...back.slice(1)],turnAt:outbound.length-1,decision:{chosenAction:'REST',innerMonologue:`往${destination.name}${format[job]}，今月回山。`}};
  }
}

type Work={line:string;outcome:SectErrandOutcome;peerId?:string;winnerId?:string;effects?:SectJobReportEffect[];otherEvent?:WorldEvent};
export function settleSectErrand(world:WorldState,actor:Cultivator,plan:SectErrandPlan,rng:()=>number):{
  event:WorldEvent;otherEvent?:WorldEvent;observation:Omit<SectJobObservation,'discipleId'|'jobId'>;
}|undefined{
  const m=world.sectManagement,sect=world.sects.find(row=>row.id===m?.sectId);
  const from=world.locations.find(row=>row.id===plan.fromId),site=world.locations.find(row=>row.id===plan.siteId);
  const home=world.locations.find(row=>row.id===plan.homeId);
  if(!m||!isSectActive(sect)||actor.sectId!==sect.id||!from||!site||!home||
    !actor.alive||actor.hp<=0||actor.locationId!==from.id)return;
  const eventId=sectErrandEventId(world.tick,actor.id,plan.job);
  const peers=world.cultivators.filter(other=>other.id!==actor.id&&other.sectId!==sect.id&&other.id!==world.playerAvatar.possessedId&&
    isGrandSiegeFighterPresent(world,other,site.id)&&!isRetiredFromService(other)).sort((a,b)=>compare(a.id,b.id));
  const tiles=new Set(plan.path.map(point=>terrainTileAt(world,point.x,point.y)?.id));
  const hazards=world.mapHazards.filter(hazard=>tiles.has(hazard.tileId)&&hazard.expiresTick>world.tick&&hazard.createdTick<=world.tick);
  const beast=world.spiritBeasts.find(row=>row.alive&&row.hp>0&&!row.tamedBy&&row.kind!=='瑞兽'&&row.locationId===site.id);
  const risk=Math.min(.85,hazards.reduce((sum,entry)=>sum+entry.intensity*.11,0)+
    Number(!!beast)*.20+Math.max(0,weatherTravelFriction(world,from,site)-.35)*.28);
  const travelRoll=rng();
  const injury=(amount:number):SectJobReportEffect|undefined=>{
    const actual=Math.max(0,Math.min(60,amount,Math.floor(actor.hp-1)));
    if(!actual)return;
    actor.hp-=actual;
    return {kind:'hp',amount:-actual,stage:'native'};
  };
  const credit=(amount:number,balance=sect):number=>{
    if(balance.spiritStones+amount>MAX_TREASURY||amount<=0)return 0;
    balance.spiritStones+=amount;
    recordResourceFlow(world,{kind:'production',good:'stone',amount,to:flowSect(balance.id),mechanism:'sect_economy',
      refId:eventId,reason:'sect_errand_wages',visibility:{kind:'participants',actorIds:[actor.id,m.leaderId]}});
    return amount;
  };
  let result:Work;
  actor.locationId=site.id;
  noteTerrainVisit(world,actor);
  if(travelRoll<risk){
    const serious=travelRoll<risk*.28,damage=injury(Math.max(1,Math.floor(actor.maxHp*(serious?.12:.05))));
    result={outcome:serious?'road_disaster':'road_mishap',
      line:`${actor.name}在往${site.name}的路上撞见${hazards.length?'路灾':beast?'拦路灵兽':'横风'}，带着${damage?'擦伤':'尘土'}回了山门。`,
      ...(damage?{effects:[damage]}:{})};
  }else switch(plan.job){
    case 'explore':
      result={outcome:'completed',line:`${actor.name}绕${site.name}行走一遭，熟悉了这一带的路。`};
      break;
    case 'stall': {
      const herbs=(['jade_leaf','earth_root','star_bloom','shadow_moss'] as const);
      const stock=herbs.find(id=>actor.herbs[id]>0);
      const price=stock==='star_bloom'?11:stock==='shadow_moss'?9:6;
      const buyer=stock&&peers.find(peer=>peer.spiritStones>=price&&peer.herbs[stock]<10_000);
      if(stock&&buyer&&sect.spiritStones+price<=MAX_TREASURY){
        buyer.spiritStones-=price;sect.spiritStones+=price;actor.herbs[stock]--;buyer.herbs[stock]++;
        const vis={kind:'participants' as const,actorIds:[actor.id,buyer.id,m.leaderId]};
        recordResourceFlow(world,{kind:'transfer',good:'stone',amount:price,from:flowActor(buyer.id),to:flowSect(sect.id),
          mechanism:'sect_economy',refId:eventId,reason:'sect_errand_sale',visibility:vis});
        recordResourceFlow(world,{kind:'transfer',good:stock,amount:1,from:flowActor(actor.id),to:flowActor(buyer.id),
          mechanism:'sect_economy',refId:eventId,reason:'sect_errand_sale',visibility:vis});
        result={outcome:'completed',line:`${actor.name}在${site.name}卖给${buyer.name}一株灵药，公库进了${price}枚灵石。`,peerId:buyer.id};
      }else{
        const fee=credit(4);
        result={outcome:'completed',line:`${actor.name}在${site.name}替街坊守了一段摊${fee?`，得${fee}枚灵石`:''}。`};
      }
      break;
    }
    case 'deliver': {
      const receiver=peers[0];
      if(!receiver){result={outcome:'refused',line:`${actor.name}把山门来信带到${site.name}，未遇接信人，又捎了回来。`};break;}
      const fee=credit(5);
      result={outcome:'completed',line:`${actor.name}在${site.name}把山门来信当面交给${receiver.name}${fee?`，公库收${fee}枚跑腿钱`:''}。`,peerId:receiver.id};
      break;
    }
    case 'recruit': {
      const village=world.settlements.villages.find(row=>row.locationId===site.id&&row.population>0);
      const option=availableSettlementActions(actor,world).find(entry=>entry.action==='RECRUIT_SETTLER'&&entry.targetSettlementId===village?.id);
      const enrollment=option&&resolveSettlementAction(world,actor,{chosenAction:'RECRUIT_SETTLER',
        targetSettlementId:option.targetSettlementId,targetVolunteerId:option.targetVolunteerId,innerMonologue:'问过本人的心意，再写入名册。'});
      if(enrollment){
        const peer=world.cultivators.find(row=>enrollment.actorIds[1]===row.id);
        result={outcome:'completed',line:`${actor.name}在${site.name}迎${peer?.name??'一位新同门'}入门。`,otherEvent:enrollment};
      }else{
        const possible=village?.volunteers.some(row=>!row.enlistedCultivatorId&&row.willingness>=25);
        result={outcome:possible?'completed':'refused',
          line:`${actor.name}在${site.name}贴出招徒告示，${possible?'向来问的乡人讲了山门规矩':'当日无人来问'}。`};
      }
      break;
    }
    case 'matchmaking': {
      const peer=peers[0];
      if(peer){
        adjustRelationship(world,actor.id,peer.id,4,'挚友','同饮过一盏坊市茶。');
        result={outcome:'completed',line:`${actor.name}在${site.name}和${peer.name}喝了一盏茶。`,peerId:peer.id};
      }else result={outcome:'refused',line:`${actor.name}在${site.name}等到茶凉，这一席没遇上道友。`};
      break;
    }
    case 'challenge': {
      const host=peers.find(peer=>peer.sectId===site.ownerSectId&&peer.age>=18&&peer.hp>=peer.maxHp*.6);
      const relation=host&&sectRelation(world,sect.id,host.sectId);
      const accepts=host&&relation?.pact!=='war'&&rng()<(host.personality==='狂傲'?.9:host.personality==='苟道'?.45:.72);
      if(!host||!accepts){result={outcome:'refused',
        line:`${actor.name}在${site.name}递了战帖，${host?`${host.name}收帖但未应招`:'山门无人应招'}。`,...(host?{peerId:host.id}:{})};break;}
      const actorPower=actor.combatPower*actor.hp/actor.maxHp,hostPower=host.combatPower*host.hp/host.maxHp;
      const won=rng()<Math.max(.15,Math.min(.85,actorPower/Math.max(1,actorPower+hostPower)));
      const loser=won?host:actor;
      const amount=Math.max(0,Math.min(60,Math.floor(loser.hp-1),Math.ceil(loser.maxHp*.045)));
      loser.hp-=amount;
      const winner=won?actor:host;
      sect.reputation=Math.max(-1_000_000,Math.min(1_000_000,sect.reputation+(won?4:-2)));
      adjustSectAffinity(world,sect.id,host.sectId,won?-3:1);
      result={outcome:won?'completed':'contest_lost',peerId:host.id,winnerId:winner.id,
        ...(!won&&amount?{effects:[{kind:'hp',amount:-Math.min(60,amount),stage:'native'} as const]}:{}),
        line:`${actor.name}在${site.name}与${host.name}过了一招，${winner.name}赢了这一场。`};
      break;
    }
  }
  actor.locationId=home.id;
  for(const tile of tiles)if(tile&&!actor.exploredTileIds.includes(tile))actor.exploredTileIds.push(tile);
  noteTerrainVisit(world,actor);
  return {
    otherEvent:result.otherEvent,
    event:{id:eventId,tick:world.tick,year:world.year,month:world.month,category:result.winnerId?'combat':'diplomacy',
      title:result.winnerId?'一月内的山门切磋':`${format[plan.job]}归来`,description:result.line,locationId:site.id,
      actorIds:[actor.id,...(result.peerId?[result.peerId]:[])],...(result.winnerId?{duelWinnerId:result.winnerId}:{witnessScope:'participants' as const})},
    observation:{tick:world.tick,phase:'performed',siteId:site.id,sourceEventId:eventId,line:result.line,nativeEffects:result.effects,
      errand:{fromId:from.id,homeId:home.id,turnAt:plan.turnAt,path:plan.path, outcome:result.outcome}},
  };
}
