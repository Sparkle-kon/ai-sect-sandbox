import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {terrainTileAt} from './terrainEngine';
import {FRONTIER_CHARTS,FRONTIER_EDGES,FRONTIER_ENTER_ROOTS,FRONTIER_ENTER_STONES,FRONTIER_REGIONS,FRONTIER_SETTLE_ROOTS,
  FRONTIER_SETTLE_STONES,FRONTIER_SITES,frontierEdge,frontierResidenceId,frontierSeaEdge,frontierSite,frontierStepMonth,frontierVisitId,
  frontierWinter,type FrontierAnchorId,type FrontierChartId,type FrontierMovementMove,type FrontierRegionId,type FrontierResidence,
  type FrontierSite,type FrontierSiteId,type FrontierState,type FrontierVisit} from './frontierTerms';

export type FrontierMovementOption={action:'FRONTIER'}&(
  {frontierMove:Exclude<FrontierMovementMove,'exit'>;targetFrontierSiteId:FrontierSiteId}|
  {frontierMove:'exit';targetFrontierSiteId:FrontierAnchorId}
);
const movements=['enter','travel','exit','settle'] as const satisfies readonly FrontierMovementMove[];
function latest(rows:readonly FrontierVisit[]|undefined,id:string):FrontierVisit|undefined{
  if(rows)for(let index=rows.length-1;index>=0;index--)if(rows[index].actorId===id)return rows[index];
  return undefined;
}
const living=(actor:Cultivator)=>actor.alive&&actor.hp>0;
const appropriateTick=(world:WorldState,tick:number)=>tick===world.tick||tick===world.tick+1;
const represented=(world:WorldState,actor:Cultivator)=>world.cultivators.includes(actor)&&living(actor)&&actor.age>=18;
const wallet=(actor:Cultivator,stones:number,roots:number)=>Number.isSafeInteger(actor.spiritStones)&&actor.spiritStones>=stones&&
  Number.isSafeInteger(actor.herbs.earth_root)&&actor.herbs.earth_root>=roots;

/** An empty charter book conveys no residence and does not alter the three original regions. */
export function ensureFrontierState(world:WorldState):FrontierState {
  return world.frontier??={version:1,visits:[],residences:[]};
}
export function activeFrontierVisit(world:WorldState,actorId:string):FrontierVisit|undefined {
  const row=latest(world.frontier?.visits,actorId);
  return row&&row.exitedTick===undefined&&row.deceasedTick===undefined?row:undefined;
}
export function frontierResidence(world:WorldState,actorId:string):FrontierResidence|undefined {
  return world.frontier?.residences.find(row=>row.actorId===actorId);
}
/** Reject same-name/same-col impostors; use an exact native place and fixed historical base tile. */
export function frontierAnchor(world:WorldState,regionId:FrontierRegionId){
  const chart=FRONTIER_CHARTS[regionId];
  const rows=world.locations.filter(location=>location.id===chart.anchorId);
  const place=rows.length===1?rows[0]:undefined;
  if(!place||terrainTileAt(world,place.x,place.y)?.id!==chart.anchorTileId)return undefined;
  if(regionId==='north-snow'?(place.type!=='spirit_vein'&&place.type!=='sect_hq')||place.spiritRoot!=='水':place.type!=='market')return undefined;
  if(place.ownerSectId&&!world.sects.some(sect=>sect.id===place.ownerSectId))return undefined;
  return place;
}
function baseScene(world:WorldState,actor:Cultivator,tick:number){
  if(actor.positionPlane!==undefined||!represented(world,actor)||!appropriateTick(world,tick))return undefined;
  const regionId=FRONTIER_REGIONS.find(region=>FRONTIER_CHARTS[region].anchorId===actor.locationId);
  if(!regionId)return undefined;
  const place=frontierAnchor(world,regionId);
  return place&&doctrineFoundingPhysicallyAt(world,actor,place.id,tick)?{regionId,place}:undefined;
}
/** Current detached bodily address; no origin coordinate or absent/foreign actor fallback. */
export function frontierPhysicalSite(world:WorldState,actor:Cultivator,tick=world.tick):FrontierSite|undefined{
  if(actor.positionPlane!=='frontier'||!represented(world,actor)||!appropriateTick(world,tick))return undefined;
  const active=activeFrontierVisit(world,actor.id),step=active?.steps.at(-1);
  if(!active||!step||active.enteredTick>tick||step.tick>tick||step.siteId!==actor.locationId)return undefined;
  const registered=frontierSite(step.siteId);
  return registered?.regionId===active.regionId&&registered.role!=='sea'?registered:undefined;
}
export function frontierActedOnGeography(world:WorldState,actorId:string,tick:number):boolean {
  const row=latest(world.frontier?.visits,actorId);
  return row?.steps.at(-1)?.tick===tick||row?.exitedTick===tick||frontierResidence(world,actorId)?.settledTick===tick;
}
const option=(frontierMove:Exclude<FrontierMovementMove,'exit'>,targetFrontierSiteId:FrontierSiteId):FrontierMovementOption=>
  ({action:'FRONTIER',frontierMove,targetFrontierSiteId});
export function availableFrontierMovementActions(actor:Cultivator,world:WorldState,executionTick=world.tick):FrontierMovementOption[]{
  if(!appropriateTick(world,executionTick)||!represented(world,actor)||frontierActedOnGeography(world,actor.id,executionTick))return [];
  if(actor.positionPlane===undefined){
    const scene=baseScene(world,actor,executionTick);
    if(!scene||activeFrontierVisit(world,actor.id)||actor.guardAssignment&&actor.guardAssignment.expiresTick>executionTick||
      scene.place.ownerSectId&&scene.place.ownerSectId!==actor.sectId||!wallet(actor,FRONTIER_ENTER_STONES,FRONTIER_ENTER_ROOTS))return [];
    return [option('enter',FRONTIER_CHARTS[scene.regionId].gateId)];
  }
  const site=frontierPhysicalSite(world,actor,executionTick);
  if(!site)return [];
  const chart=FRONTIER_CHARTS[site.regionId];
  const month=frontierStepMonth(world.month,executionTick-world.tick);
  const choices:FrontierMovementOption[]=FRONTIER_EDGES.flatMap(edge=>{
    if(edge.winterClosed&&frontierWinter(month))return [];
    return edge.from===site.id?[option('travel',edge.to)]:edge.to===site.id?[option('travel',edge.from)]:[];
  });
  if(site.id===chart.gateId&&frontierAnchor(world,site.regionId))choices.push({action:'FRONTIER',frontierMove:'exit',targetFrontierSiteId:chart.anchorId});
  if(site.id===chart.homeId&&!frontierResidence(world,actor.id)&&wallet(actor,FRONTIER_SETTLE_STONES,FRONTIER_SETTLE_ROOTS))
    choices.push(option('settle',chart.homeId));
  return choices;
}
function spend(world:WorldState,actor:Cultivator,refId:string,move:'enter'|'settle',stones:number,roots:number){
  actor.spiritStones-=stones;actor.herbs.earth_root-=roots;
  const visibility={kind:'participants' as const,actorIds:[actor.id]};
  recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:move==='enter'?'frontier_entry_paid':'frontier_home_paid',
    from:flowActor(actor.id),amount:stones,good:'stone',refId,visibility});
  recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:move==='enter'?'frontier_entry_paid':'frontier_home_paid',
    from:flowActor(actor.id),amount:roots,good:'earth_root',refId,visibility});
}
export function resolveFrontierMovementAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='FRONTIER'||!movements.some(move=>payload.frontierMove===move)||Object.keys(payload).some(key=>
    !['chosenAction','innerMonologue','spokenLine','frontierMove','targetFrontierSiteId'].includes(key)))return null;
  const exact=availableFrontierMovementActions(actor,world).find(op=>op.frontierMove===payload.frontierMove&&
    op.targetFrontierSiteId===payload.targetFrontierSiteId);
  if(!exact)return null;
  const move=exact.frontierMove,target=exact.targetFrontierSiteId;
  const site=move==='exit'?frontierPhysicalSite(world,actor):frontierSite(target);
  if(!site)return null;
  const tick=world.tick;
  let reference:string,destination:string=site.id,title:string,description:string;
  if(move==='enter'){
    const chart=FRONTIER_CHARTS[site.regionId];
    const id=frontierVisitId(tick,actor.id);
    const entry:FrontierVisit={id,actorId:actor.id,regionId:site.regionId,anchorId:chart.anchorId,enteredTick:tick,
      paidStones:FRONTIER_ENTER_STONES,paidRoots:FRONTIER_ENTER_ROOTS,steps:[{tick,siteId:site.id}]};
    ensureFrontierState(world).visits.push(entry);
    spend(world,actor,id,'enter',FRONTIER_ENTER_STONES,FRONTIER_ENTER_ROOTS);
    actor.positionPlane='frontier';actor.locationId=site.id;
    reference=id;title='验身过关';description='其人付八灵石、一株地根，只入另图门关，尚未抵村。';
  }else{
    const visit=activeFrontierVisit(world,actor.id);
    if(!visit||!world.frontier)return null;
    reference=visit.id;
    if(move==='travel'){
      if(!frontierEdge(actor.locationId,site.id))return null;
      visit.steps.push({tick,siteId:site.id});
      actor.locationId=site.id;
      title='走过相邻一格';description='只按当月实通的地边行一步，原身与物件一同抵达。';
    }else if(move==='exit'){
      const actual=frontierAnchor(world,visit.regionId);
      if(!actual||actual.id!==visit.anchorId||actual.id!==target)return null;
      visit.exitedTick=tick;destination=actual.id;
      actor.locationId=destination;delete actor.positionPlane;
      title='由原关返回旧域';description='从当前实到门关返回原界接口，不生成另一具身躯。';
    }else{
      const id=frontierResidenceId(tick,actor.id);
      const receipt:FrontierResidence={id,actorId:actor.id,regionId:site.regionId,homeSiteId:site.id,visitId:visit.id,settledTick:tick,
        paidStones:FRONTIER_SETTLE_STONES,paidRoots:FRONTIER_SETTLE_ROOTS};
      world.frontier.residences.push(receipt);
      spend(world,actor,id,'settle',FRONTIER_SETTLE_STONES,FRONTIER_SETTLE_ROOTS);
      reference=id;title='亲造一处住脚';description='本人已到聚落，实付四灵石、一株地根安宅；只入自己住籍，不取得整个地域。';
    }
  }
  return {id:`evt-frontier-movement-${reference}-${move}-${tick}`,tick,year:world.year,month:world.month,
    category:'diplomacy',locationId:destination,actorIds:[actor.id],title,description,witnessScope:'participants'};
}
export function recordFrontierDeath(world:WorldState,actor:Cultivator):void{
  if(actor.positionPlane!=='frontier'||living(actor)||!world.cultivators.includes(actor))return;
  const visit=activeFrontierVisit(world,actor.id);
  if(visit?.steps.at(-1)?.siteId===actor.locationId)visit.deceasedTick=world.tick;
}
export function settleFrontierMortality(world:WorldState):void{
  for(const actor of world.cultivators)if(actor.positionPlane==='frontier'&&!living(actor))recordFrontierDeath(world,actor);
}
export interface FrontierMovementView {
  scope:'anchor'|'frontier';regionId:FrontierRegionId;chartId:FrontierChartId;anchorId:FrontierAnchorId;
  gateId:FrontierSiteId; options:FrontierMovementOption[];site?:FrontierSite;visibleSites:FrontierSite[];
  residence?:FrontierResidence;visit?:{enteredTick:number;paidStones:number;paidRoots:number};anchorOwnerSectId?:string;
  blocked?:'fee'|'duty'|'title';
}
export function projectFrontierMovement(world:WorldState,actor?:Cultivator):FrontierMovementView|undefined{
  if(!actor)return undefined;
  const site=frontierPhysicalSite(world,actor), scene=!site?baseScene(world,actor,world.tick):undefined;
  const regionId=site?.regionId??scene?.regionId;
  if(!regionId)return undefined;
  const chart=FRONTIER_CHARTS[regionId],options=availableFrontierMovementActions(actor,world,world.tick+1);
  const common={regionId,chartId:chart.id,anchorId:chart.anchorId,gateId:chart.gateId,options};
  if(!site&&scene){
    const blocked=!options.length?(scene.place.ownerSectId&&scene.place.ownerSectId!==actor.sectId?'title':
      !wallet(actor,FRONTIER_ENTER_STONES,FRONTIER_ENTER_ROOTS)?'fee':'duty'):undefined;
    return {scope:'anchor',...common,visibleSites:[],...(scene.place.ownerSectId?{anchorOwnerSectId:scene.place.ownerSectId}:{}),
      ...(blocked?{blocked}:{})};
  }
  if(!site)return undefined;
  const visit=activeFrontierVisit(world,actor.id)!;
  const residence=frontierResidence(world,actor.id);
  return {scope:'frontier',...common,site:{...site},visibleSites:FRONTIER_SITES.filter(row=>row.regionId===regionId&&
    (row.id===site.id||frontierEdge(row.id,site.id)||row.role==='sea'&&frontierSeaEdge(row.id,site.id))).map(row=>({...row})),
    visit:{enteredTick:visit.enteredTick,paidStones:visit.paidStones,paidRoots:visit.paidRoots},
    ...(residence?.regionId===regionId?{residence:{...residence}}:{})};
}
