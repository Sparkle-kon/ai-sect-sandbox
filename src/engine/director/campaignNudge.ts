import type {Cultivator,WorldState} from '../../types/world';
import {activeCeasefireBetween} from '../ceasefireEngine';
import {isSectActive} from '../sectActivity';
import {activeRelocationForSect} from '../relocationEngine';

const STAGING_WINDOW=6;
const one=<T>(rows:readonly T[],match:(row:T)=>boolean):T|undefined=>{
  let found:T|undefined;
  for(const row of rows){
    if(!match(row))continue;
    if(found!==undefined)return;
    found=row;
  }
  return found;
};
const samePair=(a:string,b:string,x:string,y:string)=>(a===x&&b===y)||(a===y&&b===x);

/** The two personally named leaders may consider returning to their own headquarters.
 * A war declaration announces a reason to prepare, not consent to fight or knowledge of an army's location. */
export function publicCampaignStaging(world:WorldState,actor:Cultivator,tick=world.tick){
  if(one(world.cultivators,person=>person.id===actor.id)!==actor||!actor.alive||actor.hp<=0||
    actor.positionPlane!==undefined||world.sieges.some(siege=>(siege.status==='marching'||siege.status==='sieging')&&
      siege.participantIds.includes(actor.id)))return;
  const own=one(world.sects,sect=>sect.id===actor.sectId);
  if(!isSectActive(own)||own.leaderId!==actor.id||actor.locationId===own.headquartersId||activeRelocationForSect(world,own.id))return;
  const site=one(world.locations,row=>row.id===own.headquartersId);
  if(!site||site.expeditionOmenId!==undefined||site.type!=='sect_hq'||site.ownerSectId!==own.id)return;
  for(const standing of world.diplomacy){
    const {sectAId,sectBId,sinceTick}=standing;
    if(standing.pact!=='war'||sinceTick>world.tick||tick<sinceTick||tick>sinceTick+STAGING_WINDOW||
      (sectAId!==own.id&&sectBId!==own.id))continue;
    const other=one(world.sects,sect=>sect.id===(sectAId===own.id?sectBId:sectAId));
    if(!isSectActive(other)||!other.leaderId||other.id===own.id||
      one(world.diplomacy,row=>samePair(row.sectAId,row.sectBId,own.id,other.id))!==standing||
      activeCeasefireBetween(world,own.id,other.id)||activeRelocationForSect(world,other.id))continue;
    const initiating=one(world.events,event=>event.id===`evt-${sinceTick}-dip-${own.id}-${other.id}-declare_war`||
      event.id===`evt-${sinceTick}-dip-${other.id}-${own.id}-declare_war`);
    if(!initiating||initiating.tick!==sinceTick||initiating.category!=='diplomacy'||initiating.witnessScope!==undefined||
      initiating.title!=='宗门正式宣战')continue;
    const abs=world.year*12+world.month-1-(world.tick-sinceTick);
    if(initiating.year!==Math.floor(abs/12)||initiating.month!==abs%12+1)continue;
    const ownDeclared=initiating.id===`evt-${sinceTick}-dip-${own.id}-${other.id}-declare_war`;
    const [first,second]=ownDeclared?[own,other]:[other,own];
    if(initiating.locationId!==first.headquartersId||initiating.actorIds.length!==2||
      initiating.actorIds[0]!==first.leaderId||initiating.actorIds[1]!==second.leaderId)continue;
    return {site,expiresTick:sinceTick+STAGING_WINDOW};
  }
}
