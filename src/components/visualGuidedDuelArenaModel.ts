import {activeAvatar} from '../engine/avatarEngine';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {projectGuidedForbiddenDuel} from '../engine/forbiddenArtEngine';
import {schoolFormDuelForParticipant,schoolFormDuelView} from '../engine/schoolFormDuel';
import {terrainTileAt} from '../engine/terrainEngine';
import type {Cultivator,WorldState} from '../types/world';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {mapTransitActorIds} from './mapConvoyView';
import {createTerrainMapView} from './terrainMapView';
import type {VisualArenaFighter,VisualDuelArenaFrame} from './visualDuelArenaModel';

const exact=<T extends {id:string}>(rows:readonly T[],id:string)=>{
  const matches=rows.filter(row=>row.id===id);
  return matches.length===1?matches[0]:undefined;
};
const grounded=(actor:Cultivator)=>actor.alive&&Number.isFinite(actor.hp)&&actor.hp>0&&actor.positionPlane===undefined;
const gauge=(value:number,max:number)=>Number.isFinite(value)&&Number.isFinite(max)&&max>0&&value>=0&&value<=max
  ?{value,max}:undefined;
const label=(name:string)=>[...name.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'').trim()].slice(0,60).join('');

/** Paint the offered native contact beside its original choices, before any blow is committed. */
export function projectGuidedVisualDuelArena(world:WorldState,viewer:Cultivator|undefined,
  kind:'school'|'forbidden',contactId:string):VisualDuelArenaFrame|undefined{
  if(!viewer||!grounded(viewer)||exact(world.cultivators,viewer.id)!==viewer)return;
  let opponentId:string,siteId:string;
  if(kind==='school'){
    const proof=schoolFormDuelView(world,viewer),contact=schoolFormDuelForParticipant(world,viewer);
    if(!proof?.options.length||proof.contactId!==contactId||contact?.id!==contactId||contact.attackerId!==viewer.id)return;
    opponentId=contact.defenderId;siteId=contact.siteId;
  }else{
    const read=projectGuidedForbiddenDuel(world);
    if(!read||read.contact.id!==contactId||activeAvatar(world)!==viewer||read.contact.ownerId!==viewer.id||
      !read.contact.queued&&!read.options.length)return;
    const contact=read.contact;
    if(contact.attackerId!==viewer.id&&contact.defenderId!==viewer.id)return;
    opponentId=contact.attackerId===viewer.id?contact.defenderId:contact.attackerId;siteId=contact.siteId;
  }
  const peer=exact(world.cultivators,opponentId),site=exact(world.locations,siteId);
  if(!peer||peer===viewer||!grounded(peer)||viewer.locationId!==siteId||peer.locationId!==siteId||
    !site||site.type==='secret_realm'||isScopedExpeditionGate(site))return;
  const view=createTerrainMapView(world,viewer,true),transit=mapTransitActorIds(world);
  const tile=terrainTileAt(world,site.x,site.y);
  if(!tile||view.locationTile.get(siteId)!==tile||!view.isCurrentLocation(siteId)||view.tileState(tile)!=='visible'||
    [viewer,peer].some(actor=>exact(view.liveActors,actor.id)!==actor||view.trailPositions.has(actor.id)||transit.has(actor.id)))return;
  const fighter=(actor:Cultivator):VisualArenaFighter=>{
    const appearance=projectCultivatorPortrait(world,actor);
    const hp=gauge(actor.hp,actor.maxHp),qi=actor===viewer?gauge(actor.qiProgress,100):undefined;
    return {id:actor.id,name:label(actor.name),realm:`${actor.realm}${actor.realmStage}层`,
      ...(hp?{hp}:{}),...(qi?{qi}:{}),...(appearance?{sprite:{id:actor.id,appearance,pose:'fight'}}:{})};
  };
  const theme=siteId==='loc-taixu'?'sword_peak':siteId==='loc-danxia'?'pill_valley':
    siteId==='loc-vein-north'?'north_vein':site.type==='market'?'market':site.type==='abyss'?'blood_abyss':'countryside';
  const month=world.month,season=month<=3?'spring':month<=6?'summer':month<=9?'autumn':'winter';
  return {key:`guided:${kind}:${contactId}:${world.tick}`,kind:'duel',siteId,siteName:label(site.name),tick:world.tick,
    theme,season,historical:false,left:fighter(viewer),right:fighter(peer),damages:[]};
}
