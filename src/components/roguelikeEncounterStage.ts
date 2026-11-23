import {activeAvatar} from '../engine/avatarEngine';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {ROGUELIKE_ENCOUNTER_CATALOG,roguelikeSettlementNarration} from '../engine/roguelikeEncounterCatalog';
import {contextualEncounterKind,validEncounterContext} from '../engine/contextualEncounterEvidence';
import {activeRoguelikeEncounter,roguelikeEncounterRoute} from '../engine/roguelikeEncounterEngine';
import type {RoguelikeEncounterRecord} from '../types/roguelikeEncounter';
import type {Cultivator,WorldState} from '../types/world';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {mapTransitActorIds} from './mapConvoyView';
import type {SceneStageActor,SceneStageFrame,SceneStagePose} from './sceneStageModel';
import {createTerrainMapView} from './terrainMapView';

function unique<T extends {id:string}>(rows:readonly T[],id:string):T|undefined {
  const matches=rows.filter(row=>row.id===id);
  return matches.length===1?matches[0]:undefined;
}
const safeName=(name:string)=>Array.from(name.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'').trim()).slice(0,40).join('');
const living=(actor:Cultivator)=>actor.alive&&Number.isFinite(actor.hp)&&actor.hp>0&&actor.positionPlane===undefined;

/** Private illustration for an exactly held native guided contact. Never used by the public stage read. */
export function projectRoguelikeEncounterStage(world:WorldState, actor:Cultivator, record:RoguelikeEncounterRecord):SceneStageFrame|undefined {
  if(record.kind==='sect-gate'||!record.guided||!living(actor)||activeAvatar(world)!==actor||
    unique(world.cultivators,actor.id)!==actor||unique(world.roguelikeEncounters??[],record.id)!==record||
    record.actorId!==actor.id||record.siteId!==actor.locationId||
    !Number.isSafeInteger(record.openedTick)||record.openedTick<1||record.openedTick>world.tick||
    record.id!==`roguelike-encounter-${record.openedTick}-${actor.id}`||
    !(contextualEncounterKind(record.kind)?validEncounterContext(world,record):roguelikeEncounterRoute(world,record.fromSiteId,record.siteId)))return;
  const scene=ROGUELIKE_ENCOUNTER_CATALOG[record.kind];
  const exactReceipt=(phase:'open'|'settled',tick:number,title:string)=>{
    const fact=unique(world.events,`evt-${record.id}-${phase}`);
    return fact&&fact.tick===tick&&Number.isSafeInteger(fact.year)&&Number.isSafeInteger(fact.month)&&
      fact.month>=1&&fact.month<=12&&(world.year-fact.year)*12+world.month-fact.month===world.tick-tick&&
      fact.category==='intrigue'&&fact.witnessScope==='participants'&&fact.actorIds.length===1&&fact.actorIds[0]===actor.id&&
      fact.locationId===record.siteId&&fact.title===title?fact:undefined;
  };
  const opening=exactReceipt('open',record.openedTick,scene.title);
  if(!opening||opening.description!==scene.scene)return;
  let pose=scene.stage.actorPose;
  if(record.status==='offered'){
    if(activeRoguelikeEncounter(world,actor)!==record)return;
  }else if(record.status==='resolved'){
    const choice=record.choice;
    if(record.resolvedTick!==world.tick||world.tick>record.openedTick+1||!choice||!record.outcome||
      world.tick!==record.openedTick&&choice!=='leave'||
      !scene.choices.some(row=>row.choice===choice))return;
    const suffix=choice==='leave'?'转身':record.outcome.success?'得悟':'余波';
    const settled=exactReceipt('settled',world.tick,`${scene.title}：${suffix}`);
    const narration=roguelikeSettlementNarration(record);
    if(settled?.description!==narration)return;
    pose=choice==='leave'?'idle':pose;
  }else return;
  const site=unique(world.locations,record.siteId),scope=createTerrainMapView(world,actor,true);
  if(!site||isScopedExpeditionGate(site)||!scope.seenLocations.includes(site)||!scope.isCurrentLocation(site.id))return;
  const transit=mapTransitActorIds(world);
  const visible=(person:Cultivator)=>living(person)&&person.locationId===site.id&&scope.liveActors.includes(person)&&
    !scope.trailPositions.has(person.id)&&!transit.has(person.id);
  if(!visible(actor))return;
  const castMember=(person:Cultivator,bodyPose:SceneStagePose):SceneStageActor|undefined=>{
    const appearance=projectCultivatorPortrait(world,person);
    const name=safeName(person.name);
    return appearance&&name?{id:person.id,name,realm:person.realm,appearance,pose:bodyPose}:undefined;
  };
  const portrait=castMember(actor,pose);
  if(!portrait)return;
  const cast=[portrait];
  if(record.kind==='wounded-traveler'&&record.witnessId&&record.witnessId!==actor.id&&scene.stage.witnessPose){
    const witness=unique(world.cultivators,record.witnessId);
    if(witness&&visible(witness)){
      const member=castMember(witness,scene.stage.witnessPose);
      if(member)cast.push(member);
    }
  }
  const season=world.month<=3?'spring':world.month<=6?'summer':world.month<=9?'autumn':'winter';
  return {theme:scene.stage.theme,season,siteId:site.id,siteName:safeName(site.name),cast,portrait,historical:false};
}
