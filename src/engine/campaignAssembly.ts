import type {GrandSiegeHeroMove} from '../types/grandSiege';
import type {Cultivator,SectSiege,WorldEvent,WorldState} from '../types/world';
import {availableCeasefireActions} from './ceasefireEngine';
import {roundEventId} from './grandSiegeProof';
import {availableGrandSiegeHeroActions,isGrandSiegeFighterPresent} from './grandSiegeTheatreEngine';
import {knownMapLocations} from './terrainEngine';

type Guard={kind:'guard';command:{chosenAction:'GRAND_SIEGE_HERO';targetGrandSiegeId:string;
  grandSiegeHeroMove:Exclude<GrandSiegeHeroMove,'hold'>}};
type Negotiate={kind:'negotiate';command:{chosenAction:'CEASEFIRE'}&(
  {ceasefireMove:'offer';targetSectId:string}|{ceasefireMove:'accept';targetCeasefireId:string})};
type Join={kind:'join';command:{chosenAction:'EXPLORE';targetLocationId:string}};
export type CampaignAssemblyOption={siegeId:string;label:string}&(Guard|Negotiate|Join);
export interface CampaignAssemblyView {
  siteName:string;
  phase:'arrived'|'engaged'|'withdrawn';
  cohorts:readonly {sectName:string;side:'attacker'|'defender';count:number;commanderName?:string}[];
  options:readonly CampaignAssemblyOption[];
}
const label=(text:string)=>text.replace(/[\p{C}]/gu,'').trim().slice(0,60);
const pair=(a:string,b:string,x:string,y:string)=>a===x&&b===y||a===y&&b===x;
function one<T>(list:readonly T[],match:(row:T)=>boolean):T|undefined {
  let result:T|undefined;
  for(const row of list)if(match(row)){if(result!==undefined)return;result=row;}
  return result;
}
function ids(got:readonly string[],want:readonly string[]){
  return got.length===want.length&&got.every((id,i)=>id===want[i]);
}
const actorOf=(world:WorldState,id:string)=>one(world.cultivators,row=>row.id===id);
const sectOf=(world:WorldState,id:string)=>one(world.sects,row=>row.id===id);
const relation=(world:WorldState,a:string,b:string)=>one(world.diplomacy,row=>pair(row.sectAId,row.sectBId,a,b));
const scene=(world:WorldState,id:string,tick:number,title:string,siteId:string)=>{
  const row=one(world.events,event=>event.id===id);
  const absolute=world.year*12+world.month-1-(world.tick-tick);
  return row&&tick<=world.tick&&row.tick===tick&&row.year===Math.floor(absolute/12)&&row.month===absolute%12+1&&
    row.title===title&&row.locationId===siteId&&row.category==='diplomacy'&&row.witnessScope===undefined?row:undefined;
};
function agreementOriginal(world:WorldState,a:string,b:string,atTick:number,verb:'offer_alliance'|'declare_war'){
  const title=verb==='offer_alliance'?'宗门订立同盟':'宗门正式宣战';
  const rows:WorldEvent[]=[];
  for(const row of world.events){
    if(row.tick>atTick||!row.locationId)continue;
    const normal=`evt-${row.tick}-dip-${a}-${b}-${verb}`,swapped=`evt-${row.tick}-dip-${b}-${a}-${verb}`;
    if(row.id!==normal&&(verb!=='offer_alliance'||row.id!==swapped))continue;
    if(!scene(world,row.id,row.tick,title,row.locationId)||row.actorIds.length!==2||row.actorIds[0]===row.actorIds[1])continue;
    const first=actorOf(world,row.actorIds[0]),second=actorOf(world,row.actorIds[1]);
    if(!first||!second||!pair(first.sectId,second.sectId,a,b))continue;
    rows.push(row);
  }
  return rows.length===1?rows[0]:undefined;
}
function allied(world:WorldState,a:string,b:string,through:number):boolean{
  if(a===b)return true;
  const standing=relation(world,a,b);
  if(standing?.pact!=='alliance'||standing.sinceTick>through)return false;
  return agreementOriginal(world,a,b,standing.sinceTick,'offer_alliance')?.tick===standing.sinceTick;
}
function certified(world:WorldState,siege:SectSiege){
  const theatre=siege.theatre,arrived=theatre?.arrivedTick;
  if(!theatre||arrived===undefined||arrived<=siege.startedTick+1||arrived>world.tick||
    !(siege.status==='sieging'||siege.status==='withdrawn')||
    one(world.sieges,row=>row.id===siege.id)!==siege||
    theatre.openedTick!==siege.startedTick||new Set(siege.participantIds).size!==siege.participantIds.length)return;
  const attacker=sectOf(world,siege.attackerSectId),defender=sectOf(world,siege.defenderSectId);
  const site=one(world.locations,row=>row.id===siege.destinationId);
  if(!attacker||!defender||!site||attacker.id===defender.id||defender.headquartersId!==site.id||
    (site.ownerSectId!==undefined&&site.ownerSectId!==defender.id))return;
  const standing=relation(world,attacker.id,defender.id);
  const war=agreementOriginal(world,attacker.id,defender.id,siege.startedTick,'declare_war');
  if(!war||!standing||(siege.status==='sieging'&&(standing.pact!=='war'||standing.sinceTick!==war.tick)))return;
  const launchId=`evt-${siege.startedTick}-dip-${attacker.id}-${defender.id}-launch_siege`;
  const launch=scene(world,launchId,siege.startedTick,'宗门集结攻山',attacker.headquartersId);
  const arrival=scene(world,roundEventId(arrived,siege.id),arrived,'联军抵达山门',site.id);
  if(theatre.sourceLaunchId!==launchId||!launch||!ids(launch.actorIds,siege.participantIds)||
    launch.description!==`${attacker.name}耗费330灵石，集结${siege.participantIds.length}名修士向${defender.name}出征。`||
    !arrival||arrival.actorIds.some(id=>!siege.participantIds.includes(id))||
    new Set(arrival.actorIds).size!==arrival.actorIds.length)return;
  const assembled=new Set(arrival.actorIds);
  const arrivedBodies=arrival.actorIds.flatMap(id=>{
    const actor=actorOf(world,id);
    return actor?[actor]:[];
  });
  const qualifying=(actor:Cultivator)=>siege.status==='withdrawn'||isGrandSiegeFighterPresent(world,actor,site.id);
  if(!arrivedBodies.some(actor=>actor.sectId===attacker.id&&qualifying(actor))||
    !arrivedBodies.some(actor=>actor.sectId!==attacker.id&&
      allied(world,attacker.id,actor.sectId,siege.startedTick)&&qualifying(actor)))return;
  if(siege.status==='withdrawn'){
    const terminal=theatre.terminal;
    if(!terminal||terminal.status!=='withdrawn'||terminal.tick!==world.tick)return;
    const deal=one(world.ceasefires.agreements,row=>row.status==='active'&&row.signedTick===terminal.tick&&
      row.withdrawnSiegeIds.includes(siege.id)&&pair(row.proposerSectId,row.targetSectId,attacker.id,defender.id));
    const signed=one(world.events,row=>row.id===terminal.sourceEventId);
    if(!deal||!signed||terminal.sourceEventId!==`evt-${terminal.tick}-${deal.id}-signed`||
      !signed.locationId||!scene(world,signed.id,terminal.tick,'两宗签署停战撤军议约',signed.locationId)||
      !ids(signed.actorIds.slice(0,2),[deal.proposerId,deal.targetLeaderId])||
      new Set(signed.actorIds).size!==signed.actorIds.length||
      signed.actorIds.slice(2).some(id=>!world.sieges.some(army=>deal.withdrawnSiegeIds.includes(army.id)&&
        army.participantIds.includes(id))))return;
  }
  return {siege,site,attacker,defender,assembled};
}
type Certified=NonNullable<ReturnType<typeof certified>>;
function sideOf(world:WorldState,c:Certified,actor:Cultivator){
  if(c.assembled.has(actor.id)&&c.siege.participantIds.includes(actor.id)&&
    allied(world,c.attacker.id,actor.sectId,c.siege.startedTick))return 'attacker' as const;
  if(!c.siege.participantIds.includes(actor.id)&&allied(world,c.defender.id,actor.sectId,c.siege.startedTick))return 'defender' as const;
  return;
}
function exactActor(world:WorldState,actor:Cultivator):boolean{
  return actorOf(world,actor.id)===actor&&!world.sieges.some(row=>
    (row.status==='marching'||row.status==='sieging')&&row.destinationId!==actor.locationId&&row.participantIds.includes(actor.id))&&
    isGrandSiegeFighterPresent(world,actor,actor.locationId);
}
function optionsFor(world:WorldState,actor:Cultivator,c:Certified,executionTick:number):CampaignAssemblyOption[]{
  if(c.siege.status!=='sieging')return [];
  const side=sideOf(world,c,actor);
  if(!side)return [];
  const out:CampaignAssemblyOption[]=[];
  if(actor.locationId!==c.site.id){
    if(side==='defender'&&knownMapLocations(world,actor).includes(c.site)){
      out.push({kind:'join',siegeId:c.siege.id,label:'赴阵',command:{chosenAction:'EXPLORE',targetLocationId:c.site.id}});
    }
    return out;
  }
  for(const hero of availableGrandSiegeHeroActions(actor,world))
    if(hero.targetGrandSiegeId===c.siege.id&&hero.grandSiegeHeroMove!=='hold'){
      out.push({kind:'guard',siegeId:c.siege.id,label:'改守',command:{chosenAction:hero.action,
        targetGrandSiegeId:hero.targetGrandSiegeId,grandSiegeHeroMove:hero.grandSiegeHeroMove}});
    }
  const opposite=side==='attacker'?c.defender.id:c.attacker.id;
  for(const native of availableCeasefireActions(actor,world)){
    if(native.ceasefireMove==='offer'&&native.targetSectId===opposite){
      out.push({kind:'negotiate',siegeId:c.siege.id,label:'提议停战',command:{chosenAction:native.action,
        ceasefireMove:'offer',targetSectId:opposite}});
    }
    if(native.ceasefireMove==='accept'&&native.targetCeasefireId){
      const deal=one(world.ceasefires.agreements,row=>row.id===native.targetCeasefireId);
      if(deal&&deal.offerExpiresTick>executionTick&&deal.targetLeaderId===actor.id&&
        pair(deal.proposerSectId,deal.targetSectId,c.attacker.id,c.defender.id)){
        out.push({kind:'negotiate',siegeId:c.siege.id,label:'签署停战',command:{chosenAction:native.action,
          ceasefireMove:'accept',targetCeasefireId:deal.id}});
      }
    }
  }
  return out;
}
export function availableCampaignAssemblyActions(actor:Cultivator,world:WorldState,executionTick=world.tick+1):CampaignAssemblyOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||
    !world.sieges.some(row=>row.status==='sieging'&&row.theatre?.arrivedTick!==undefined)||!exactActor(world,actor))return [];
  return world.sieges.flatMap(siege=>{
    const c=certified(world,siege);
    return c?optionsFor(world,actor,c,executionTick):[];
  });
}
export function projectCampaignAssembly(world:WorldState,viewer:Cultivator):CampaignAssemblyView|undefined{
  if(!world.sieges.some(siege=>siege.theatre?.arrivedTick!==undefined&&
    (siege.status==='sieging'||siege.status==='withdrawn'&&siege.theatre?.terminal?.tick===world.tick))||!exactActor(world,viewer))return;
  const found=world.sieges.flatMap(siege=>{
    const c=certified(world,siege);
    if(!c||!sideOf(world,c,viewer))return [];
    const options=optionsFor(world,viewer,c,world.tick+1),here=viewer.locationId===c.site.id;
    return here||options.length?[{c,here,options}]:[];
  }).sort((a,b)=>Number(b.here)-Number(a.here)||b.c.siege.startedTick-a.c.siege.startedTick)[0];
  if(!found)return;
  const {c,here,options}=found;
  const groups=new Map<string,CampaignAssemblyView['cohorts'][number]>();
  if(here&&c.siege.status==='sieging'){
    const canonical=new Map<string,Cultivator|undefined>();
    for(const actor of world.cultivators)canonical.set(actor.id,canonical.has(actor.id)?undefined:actor);
    const currentLocal=[...canonical.values()].filter((actor):actor is Cultivator=>
      !!actor&&actor.locationId===c.site.id&&isGrandSiegeFighterPresent(world,actor,c.site.id));
    for(const actor of currentLocal){
      const side=sideOf(world,c,actor),sect=sectOf(world,actor.sectId);
      if(!side||!sect)continue;
      const key=`${side}:${sect.id}`,group=groups.get(key)??{sectName:label(sect.name),side,count:0};
      group.count++;
      if(sect.leaderId===actor.id&&actor.sectRank==='掌门')group.commanderName=label(actor.name);
      groups.set(key,group);
    }
  }
  return {siteName:label(c.site.name),phase:c.siege.status==='withdrawn'?'withdrawn':c.siege.rounds?'engaged':'arrived',
    cohorts:[...groups.values()],options};
}
