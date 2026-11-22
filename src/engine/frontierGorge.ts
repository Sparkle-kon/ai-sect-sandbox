import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {activeFrontierVisit,availableFrontierMovementActions,frontierActedOnGeography,frontierPhysicalSite,
  resolveFrontierMovementAction} from './frontierMovementEngine';
import {frontierGorgeWeather,frontierGorgeWindBlocks,northGorgeHome,northGorgePass} from './frontierGorgeWeather';
import {frontierSite,frontierStepMonth,frontierWinter} from './frontierTerms';

const spring='frontier-north-spring',lee='frontier-north-lee-east';
type Origin=typeof northGorgePass|typeof northGorgeHome;
type Bend=typeof spring|typeof lee;
export type FrontierGorgeOption={action:'FRONTIER_GORGE'}&(
  {frontierGorgeMove:'wait';targetFrontierSiteId:Origin}|{frontierGorgeMove:'detour';targetFrontierSiteId:Bend});
export interface FrontierGorgeView {
  siteName:string;
  weather?:ReturnType<typeof frontierGorgeWeather>;
  options:readonly FrontierGorgeOption[];
  receipt?:{title:string;description:string};
  crossing?:{chartId:'chart-north-snow';fromTileId:string;toTileId:string};
}
const waitTitle='在峡边等风',waitText='这一月实在原处候风，没有越过关脊。';
const detourTitle='绕过这一道风口',detourText='已走到相邻一站；没有跳到山的另一面。';
const waitId=(tick:number,visitId:string)=>`evt-frontier-gorge-${tick}-${visitId}-wait`;
const pendingWaits=new WeakMap<WorldState,Set<string>>();
export const isPrivateFrontierGorgeEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith('evt-frontier-gorge-');

function local(world:WorldState,actor:Cultivator,tick:number){
  if((tick!==world.tick&&tick!==world.tick+1)||actor.positionPlane!=='frontier'||
    !world.cultivators.includes(actor)||world.cultivators.filter(row=>row.id===actor.id).length!==1)return;
  const here=frontierPhysicalSite(world,actor,tick),visit=activeFrontierVisit(world,actor.id);
  if(!here||here.regionId!=='north-snow'||!visit)return;
  return {here,visit};
}
function facingWind(world:WorldState,id:string,tick:number){
  if(frontierWinter(frontierStepMonth(world.month,tick-world.tick)))return false;
  return id===northGorgePass?frontierGorgeWindBlocks(world,id,northGorgeHome,tick):
    id===northGorgeHome&&frontierGorgeWindBlocks(world,id,northGorgePass,tick);
}
const destination=(site:Origin)=>site===northGorgePass?spring:lee;

export function availableFrontierGorgeActions(actor:Cultivator,world:WorldState,tick=world.tick+1):FrontierGorgeOption[]{
  const scene=local(world,actor,tick);
  if(!scene||frontierActedOnGeography(world,actor.id,tick)||
    !facingWind(world,scene.here.id,tick)||pendingWaits.get(world)?.has(waitId(tick,scene.visit.id))||
    world.events.some(event=>event.id===waitId(tick,scene.visit.id)))return [];
  const site=scene.here.id;
  if(site!==northGorgePass&&site!==northGorgeHome)return [];
  const result:FrontierGorgeOption[]=[{action:'FRONTIER_GORGE',frontierGorgeMove:'wait',targetFrontierSiteId:site}];
  const next=destination(site);
  if(availableFrontierMovementActions(actor,world,tick).some(row=>row.frontierMove==='travel'&&row.targetFrontierSiteId===next))
    result.unshift({action:'FRONTIER_GORGE',frontierGorgeMove:'detour',targetFrontierSiteId:next});
  return result;
}
export function resolveFrontierGorgeAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='FRONTIER_GORGE'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','frontierGorgeMove','targetFrontierSiteId'].includes(key)))return null;
  const option=availableFrontierGorgeActions(actor,world,world.tick).find(row=>
    row.frontierGorgeMove===decision.frontierGorgeMove&&row.targetFrontierSiteId===decision.targetFrontierSiteId);
  if(!option)return null;
  if(option.frontierGorgeMove==='detour')return resolveFrontierMovementAction(world,actor,{chosenAction:'FRONTIER',frontierMove:'travel',
    targetFrontierSiteId:option.targetFrontierSiteId,innerMonologue:'沿实有背风路，只走一步。'});
  const scene=local(world,actor,world.tick);
  if(!scene)return null;
  const id=waitId(world.tick,scene.visit.id);
  const reserved=pendingWaits.get(world)??new Set<string>();
  reserved.add(id);pendingWaits.set(world,reserved);
  return {id,tick:world.tick,year:world.year,month:world.month,
    title:waitTitle,description:waitText,actorIds:[actor.id],locationId:scene.here.id,category:'heavenly',witnessScope:'participants'};
}

export function projectFrontierGorge(world:WorldState,viewer:Cultivator):FrontierGorgeView|undefined{
  const scene=local(world,viewer,world.tick);
  if(!scene)return;
  const {visit,here}=scene;
  const options=availableFrontierGorgeActions(viewer,world);
  const original=(id:string)=>{
    const matches=world.events.filter(event=>event.id===id);
    if(matches.length!==1)return;
    const [event]=matches;
    if(event.tick===world.tick&&event.year===world.year&&event.month===world.month&&event.witnessScope==='participants'&&
      event.locationId===here.id&&event.actorIds.length===1&&event.actorIds[0]===viewer.id)return event;
  };
  let receipt:FrontierGorgeView['receipt'];
  let crossing:FrontierGorgeView['crossing'];
  if(viewer.currentAction==='FRONTIER_GORGE'){
    const waited=original(waitId(world.tick,visit.id));
    if(waited?.category==='heavenly'&&waited.title===waitTitle&&waited.description===waitText&&
      visit.steps.at(-1)!.tick<world.tick&&facingWind(world,here.id,world.tick))receipt={title:waitTitle,description:waitText};
    const from=visit.steps.at(-2);
    if(from&&(from.siteId===northGorgePass||from.siteId===northGorgeHome)&&destination(from.siteId)===here.id&&
      visit.steps.at(-1)?.tick===world.tick&&facingWind(world,from.siteId,world.tick)){
      const moved=original(`evt-frontier-movement-${visit.id}-travel-${world.tick}`);
      if(moved?.category==='diplomacy'&&moved.title==='走过相邻一格'&&
        moved.description==='只按当月实通的地边行一步，原身与物件一同抵达。'){
        receipt={title:detourTitle,description:detourText};
        crossing={chartId:'chart-north-snow',fromTileId:from.siteId,toTileId:here.id};
      }
    }
  }
  if(!options.length&&!receipt)return;
  return {siteName:frontierSite(here.id)?.name??here.name,weather:frontierGorgeWeather(world,world.tick),options,
    ...(receipt?{receipt}:{}),...(crossing?{crossing}:{})};
}
