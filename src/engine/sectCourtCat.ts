import {comedyRecurringIds, type ComedyContext} from './sectComedyTerms';
import {planComedyEffects} from './sectComedyEffects';
import {directorSiteIsSafe} from './director/nudgeIntegrations';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {isSectActive} from './sectActivity';
import {flowSect,recordResourceFlow} from './resourceFlowEngine';
import type {WorldEvent,WorldState} from '../types/world';

export type CourtCatCommand={readonly kind:'feed_cat'|'shoo_cat'};
const TREAT=2,TAMING=3;
function pieces(world:WorldState){
  const m=world.sectManagement,notebook=m?.comedy;
  const hq=world.locations.find(site=>site.id===m?.homeSiteId&&site.ownerSectId===m.sectId);
  const owner=world.cultivators.find(actor=>actor.id===m?.leaderId&&actor.sectId===m.sectId);
  const sect=world.sects.find(sect=>sect.id===m?.sectId);
  const id=comedyRecurringIds(world)?.cat;
  const cat=world.spiritBeasts.find(beast=>beast.id===id);
  if(!m||!notebook||m.growth?.failure||!hq||!owner||!isSectActive(sect)||sect.leaderId!==owner.id||
    !directorSiteIsSafe(world,hq)||!cat?.alive||cat.hp<=0)return;
  return {m,notebook,hq,owner,sect,cat};
}
export function projectCourtCat(world:WorldState){
  const state=pieces(world);
  if(!state||state.cat.locationId!==state.hq.id)return;
  const {notebook,owner,cat,sect,hq}=state;
  const present=isGrandSiegeFighterPresent(world,owner,hq.id);
  const bond=notebook.catBond;
  const visits=bond?.feeds??0;
  const alreadyOwns=world.spiritBeasts.some(beast=>beast.alive&&beast.hp>0&&beast.tamedBy===owner.id);
  return {name:cat.name,visits,adopted:cat.tamedBy===owner.id,treat:TREAT,
    canFeed:present&&!cat.tamedBy&&!alreadyOwns&&visits<TAMING&&bond?.fedTick!==world.tick&&sect.spiritStones>=TREAT,
    canShoo:present&&!cat.tamedBy&&cat.homeLocationId!==hq.id};
}
export function applyCourtCatCommand(world:WorldState,command:CourtCatCommand):boolean{
  const state=pieces(world),view=projectCourtCat(world);
  if(!state||!view)return false;
  const {m,notebook,hq,owner,sect,cat}=state,bond=notebook.catBond;
  if(command.kind==='shoo_cat'){
    if(!view.canShoo||!world.locations.some(site=>site.id===cat.homeLocationId))return false;
    cat.locationId=cat.homeLocationId;
    cat.nextActionTick=Math.max(cat.nextActionTick,world.tick+2);
    const {returnedTick:_,...earlier}=bond??{feeds:0};
    m.comedy={...notebook,catBond:{...earlier,shooedTick:world.tick}};
    return true;
  }
  if(command.kind!=='feed_cat'||!view.canFeed)return false;
  const feeds=(bond?.feeds??0)+1;
  const ctx:ComedyContext={tick:world.tick,templateId:'courtyard-cat',speakerId:owner.id,siteId:hq.id,source:{phase:'ambient',presence:'home'}};
  const adopt=feeds===TAMING?planComedyEffects(world,ctx,[{kind:'pet',template:'pill-cat'}]):undefined;
  if(feeds===TAMING&&!adopt)return false;
  adopt?.commit();
  if(!adopt)cat.nextActionTick=Math.max(cat.nextActionTick,world.tick+2);
  sect.spiritStones-=TREAT;
  recordResourceFlow(world,{kind:'consumption',from:flowSect(sect.id),mechanism:'sect_economy',reason:'sect_cat_treat',good:'stone',amount:TREAT,
    refId:cat.id,visibility:{kind:'participants',actorIds:[owner.id]}});
  m.comedy={...notebook,catBond:{...bond,feeds,fedTick:world.tick}};
  return true;
}

export function settleCourtCatReturn(world:WorldState):WorldEvent|undefined{
  const state=pieces(world),bond=state?.notebook.catBond;
  if(!state||bond?.shooedTick===undefined||bond.returnedTick!==undefined||world.tick<bond.shooedTick+2)return;
  const {m,notebook,hq,owner,cat}=state;
  if(cat.tamedBy||!isGrandSiegeFighterPresent(world,owner,hq.id))return;
  cat.locationId=hq.id;
  cat.nextActionTick=world.tick+1;
  m.comedy={...notebook,catBond:{...bond,returnedTick:world.tick}};
  return {id:`evt-${world.tick}-${m.sectId}-court-cat-return`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    title:'灵猫溜回来了',description:'偷丹灵猫沿着廊柱轻轻绕回山门。',locationId:hq.id,actorIds:[owner.id],witnessScope:'participants'};
}
