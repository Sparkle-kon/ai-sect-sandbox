import type {Cultivator,LocationNode,SpiritBeast,WorldEvent,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {disasterShelterCheckpoint} from './disasterShelterCheckpoint';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {ascensionDutyActive} from './ascensionPresence';
import {localQiWeather} from './weatherEngine';

export const WILD_MIGRATION_HISTORY=96;
export const WILD_MIGRATION_RESPONSE_TICKS=2;
export const wildRoamEventId=(tick:number,beastId:string)=>`evt-${tick}-beast-roam-${beastId}`;
export const wildMigrationId=(tick:number,beastId:string)=>`wild-migration-${tick}-${beastId}`;
export const wildMigrationWilderness=(site:LocationNode)=>!isScopedExpeditionGate(site)&&
  (site.type==='spirit_vein'||site.type==='abyss'||site.type==='secret_realm');
export function presentForWildMigration(world:WorldState,actor:Cultivator,siteId:string):boolean{
  const id=actor.id;
  return actor.alive&&actor.hp>0&&actor.positionPlane===undefined&&actor.locationId===siteId&&
    !ascensionDutyActive(world,actor)&&!activeDanxiaMedicineEscort(world,actor)&&
    (!actor.guardAssignment||actor.guardAssignment.expiresTick<=world.tick||actor.guardAssignment.locationId===siteId)&&
    actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    !disasterShelterCheckpoint(world,actor)&&!expeditionRescueCheckpoint(world,actor)&&!boundaryReliefCheckpoint(world,actor)&&
    !world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')&&
    !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))&&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&row.status==='active')&&
    !world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'))&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(id));
}

/** Native successful movement calls this after moving the real body; no extra draw, travel, or mutation to it. */
export function recordWildMigration(world:WorldState,beast:SpiritBeast,from:LocationNode,to:LocationNode,original:WorldEvent):void{
  if(!from.ownerSectId||!to.ownerSectId||from.ownerSectId===to.ownerSectId||from.id===to.id||
    !wildMigrationWilderness(from)||!wildMigrationWilderness(to)||from.type==='secret_realm'||to.type==='secret_realm'||
    !world.sects.some(row=>row.id===from.ownerSectId)||!world.sects.some(row=>row.id===to.ownerSectId)||
    world.locations.filter(row=>row.id===from.id).length!==1||world.locations.filter(row=>row.id===to.id).length!==1||
    world.spiritBeasts.filter(row=>row.id===beast.id).length!==1||!world.spiritBeasts.includes(beast)||
    !beast.alive||beast.hp<=0||beast.tamedBy||beast.locationId!==to.id||original.id!==wildRoamEventId(world.tick,beast.id)||
    original.tick!==world.tick||original.year!==world.year||original.month!==world.month||original.witnessScope!==undefined||
    original.category!=='heavenly'||original.actorIds.length!==0||original.locationId!==to.id||original.title!=='妖兽游踪')return;
  const state=world.wildMigrations??={records:[]};
  const id=wildMigrationId(world.tick,beast.id);
  if(state.records.some(row=>row.id===id))return;
  const ids=new Map<string,number>();
  for(const actor of world.cultivators)ids.set(actor.id,(ids.get(actor.id)??0)+1);
  const observe=(site:LocationNode)=>world.cultivators.filter(actor=>actor.sectId===site.ownerSectId&&
    ids.get(actor.id)===1&&actor.locationId===site.id&&presentForWildMigration(world,actor,site.id))
    .map(actor=>actor.id).sort();
  const weather=(site:LocationNode)=>{const {season,kind,intensity}=localQiWeather(world,site);return {season,kind,intensity};};
  state.records.push({id,beastId:beast.id,kind:beast.kind,tick:world.tick,sourceEventId:original.id,
    from:{siteId:from.id,sectId:from.ownerSectId,witnessIds:observe(from)},to:{siteId:to.id,sectId:to.ownerSectId,witnessIds:observe(to)},
    fromWeather:weather(from),toWeather:weather(to),responses:[]});
  // An arbitrarily busy single month cannot revoke its still-live reaction window.
  const recent=new Set(state.records.slice(-WILD_MIGRATION_HISTORY));
  const hot=new Set(world.events.filter(event=>/^evt-\d+-wild-migration-/.test(event.id)).map(event=>event.id));
  state.records=state.records.filter(row=>recent.has(row)||row.tick>=world.tick-WILD_MIGRATION_RESPONSE_TICKS||
    row.responses.some(response=>hot.has(`evt-${response.tick}-${row.id}-${response.side}`)));
}
