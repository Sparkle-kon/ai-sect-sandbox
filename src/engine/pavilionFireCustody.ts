import { PAVILION_FIRE_SECURE_RECEIPT, pavilionFireActionId } from '../types/pavilionFire';
import type { Cultivator, Technique, WorldState } from '../types/world';
import { terrainTileAt } from './terrainEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { ascensionDutyActive } from './ascensionPresence';

const unique=<T extends {id:string}>(rows:readonly T[],id:string)=>{
  const found=rows.filter(row=>row.id===id);return found.length===1?found[0]:undefined;
};
const same=(a:Readonly<Technique>,b:Readonly<Technique>)=>a.id===b.id&&a.authorId===b.authorId&&
  a.createdTick===b.createdTick&&a.name===b.name&&a.spiritRoot===b.spiritRoot;

/** A volume still on the active burning shelf cannot be handed out by the ordinary desk. */
export function activeBurningShelfCopy(world:WorldState,sectId:string,scrollId:string|undefined):boolean{
  if(!scrollId||!world.pavilionFires?.cases.length)return false;
  const sect=unique(world.sects,sectId);
  return Boolean(sect&&sect.facilities.scripture_pavilion>0&&sect.inactiveSinceTick===undefined&&
    world.pavilionFires.cases.some(row=>row.sectId===sectId&&row.siteId===sect.headquartersId&&
      row.scrollId===scrollId&&row.scrollStatus==='shelved'&&!row.heat));
}

/** An owner can study exactly the physical copy they actually secured at the safe place. */
export function securedPavilionFireCopies(world:WorldState,actor:Cultivator):Technique[]{
  if(!world.pavilionFires?.cases.length||unique(world.cultivators,actor.id)!==actor||
    actor.positionPlane!==undefined||ascensionDutyActive(world,actor))return [];
  const place=unique(world.locations,actor.locationId);
  const tile=place&&terrainTileAt(world,place.x,place.y);
  if(!place||!tile||place.type==='secret_realm'||place.type==='abyss'||isScopedExpeditionGate(place)||tile.biome==='魔渊'||
    world.mapHazards.some(hazard=>hazard.tileId===tile.id&&hazard.createdTick<=world.tick&&hazard.expiresTick>world.tick)||
    world.pavilionFires.cases.some(row=>row.tileId===tile.id&&!row.heat)||
    !doctrineFoundingPhysicallyAt(world,actor,place.id,world.tick))return [];
  return world.pavilionFires.cases.flatMap(row=>{
    const {securedTick,carriedTick,copy}=row;
    if(row.scrollStatus!=='secured'||row.carrierId!==actor.id||row.safeSiteId!==place.id||securedTick===undefined||
      carriedTick===undefined||securedTick<=carriedTick||securedTick>world.tick||!copy||
      unique(world.pavilionFires?.cases??[],row.id)!==row)return [];
    const original=unique(world.scriptures.originals,row.scrollId);
    if(!original||!same(original.technique,copy))return [];
    const sources=world.events.filter(event=>event.id===pavilionFireActionId(securedTick,row.id,actor.id,'secure'));
    if(sources.length===0){
      // Durable typed custody remains useful once its genuine original rolls out of the hot window.
      return world.tick-securedTick>12?[copy]:[];
    }
    const [event]=sources;
    return sources.length===1&&event.tick===securedTick&&event.locationId===place.id&&
      world.year*12+world.month-(event.year*12+event.month)===world.tick-event.tick&&
      event.category==='heavenly'&&event.actorIds.length===1&&event.actorIds[0]===actor.id&&event.witnessScope==='participants'&&
      event.title===PAVILION_FIRE_SECURE_RECEIPT.title&&event.description===PAVILION_FIRE_SECURE_RECEIPT.description?[copy]:[];
  });
}
