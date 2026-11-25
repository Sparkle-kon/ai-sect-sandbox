import {COMEDY_ITEMS,COMEDY_PETS} from '../data/sectComedy/consequences';
import {isSectComedySequel} from '../data/sectComedy/scenes/continuations';
import {findSectComedyTemplate} from '../data/sectComedy';
import {COMEDY_MAX_EFFECTS,COMEDY_PENDING_LIMIT,type SectComedyEffect,type SectComedyPending,
  type SectComicAppliedEffect} from '../types/sectComedy';
import type {Cultivator,ResourceFlowDraft,SpiritBeast,WorldState} from '../types/world';
import {adjustSectAffinity,sectRelation} from './diplomacyEngine';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {recordMemory} from './memoryEngine';
import {flowActor,flowSect,recordResourceFlow} from './resourceFlowEngine';
import {isSectActive} from './sectActivity';
import {isRetiredFromService} from './serviceRetirementEngine';
import {createComedyRecruit} from './starterSectWorld';
import {noteTerrainVisit} from './terrainEngine';

import {comedyDueTick,comedyIdentity,comedyRecurringIds,comedyRelationTarget,type ComedyContext} from './sectComedyTerms';

const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));

/** Stage only the touched accounts. Repeated costs see the staged balances; no journal, visitor,
 * person or asset reaches the real world unless the entire authored beat is legal. */
export function planComedyEffects(world:WorldState,ctx:ComedyContext,effects:readonly SectComedyEffect[],receiptId?:string){
  if(effects.length>COMEDY_MAX_EFFECTS||ctx.tick!==world.tick)return;
  if(!effects.length)return {applied:[] as SectComicAppliedEffect[],pending:[] as SectComedyPending[],commit:()=>{}};
  const m=world.sectManagement,actor=world.cultivators.find(row=>row.id===ctx.speakerId);
  const sect=world.sects.find(row=>row.id===m?.sectId);
  if(!m||!actor||!actor.alive||actor.hp<=0||actor.positionPlane!==undefined||isRetiredFromService(actor)||
    actor.sectId!==m.sectId||m.growth?.failure||!isSectActive(sect))return;
  const home=world.locations.find(row=>row.id===m.homeSiteId&&row.ownerSectId===m.sectId&&row.type==='sect_hq');
  const ids=comedyRecurringIds(world);
  if(!ids)return;
  const applied:SectComicAppliedEffect[]=[],queued:SectComedyPending[]=[],journal:ResourceFlowDraft[]=[];
  const recruits:Cultivator[]=[],newPets:SpiritBeast[]=[],updates=new Map<string,SpiritBeast>();
  const diplomacy=new Map<string,number>();
  const herbs={...actor.herbs},artifacts=[...actor.artifacts],buildings={...m.buildings};
  let hp=actor.hp,qi=actor.qiProgress,stones=sect.spiritStones,fame=sect.reputation,debt=m.debt&&{...m.debt};
  const refId=receiptId??`evt-${ctx.tick}-${sect.id}-comic`;
  function flow(good:'stone'|keyof Cultivator['herbs'],amount:number){
    const account=good==='stone'?flowSect(sect!.id):flowActor(actor!.id);
    const base={mechanism:'sect_economy',reason:'sect_comedy',refId,good,amount:Math.abs(amount),
      visibility:{kind:'participants',actorIds:[ctx.speakerId]}} as const;
    journal.push(amount>0?{...base,kind:'production',to:account}:{...base,kind:'loss',from:account});
  }
  for(const [index,effect] of effects.entries()){
    if('amount' in effect&&(!Number.isSafeInteger(effect.amount)||effect.amount===0))return;
    switch(effect.kind){
      case 'qi': {
        if(!Number.isFinite(qi)||qi<0||qi>100||Math.abs(effect.amount)>100)return;
        const next=clamp(qi+effect.amount,0,100),amount=next-qi;
        if(!amount)return;
        qi=next;
        applied.push({kind:'qi',amount});
        break;
      }
      case 'stones':
        if(!Number.isFinite(stones)||stones+effect.amount<0||stones+effect.amount>1_000_000_000)return;
        stones+=effect.amount;
        flow('stone',effect.amount);
        applied.push(effect);
        break;
      case 'herb': {
        const next=herbs[effect.herb]+effect.amount;
        if(!Number.isSafeInteger(next)||next<0||next>10_000)return;
        herbs[effect.herb]=next;
        flow(effect.herb,effect.amount);
        applied.push(effect);
        break;
      }
      case 'item':
      case 'item_loss': {
        const definition=COMEDY_ITEMS[effect.template];
        if(!definition)return;
        if(effect.kind==='item'){
          const itemId=comedyIdentity(sect.id,'item',`${ctx.tick}-${index}`);
          if(artifacts.some(item=>item.id===itemId)||world.cultivators.some(person=>person.artifacts.some(item=>item.id===itemId)))return;
          artifacts.push({...definition,id:itemId,tier:'法器',durability:45,maxDurability:45});
          applied.push({...effect,itemId});
        }else{
          const position=artifacts.findIndex(item=>item.id?.startsWith(comedyIdentity(sect.id,'item',''))&&
            item.name===definition.name&&!item.boundTo&&!item.soul&&!item.workshopOrigin&&!item.craftTrainingOrigin&&!item.relicSetId);
          const itemId=position>=0?artifacts[position].id:undefined;
          if(!itemId)return;
          artifacts.splice(position,1);
          applied.push({...effect,itemId});
        }
        break;
      }
      case 'injury': {
        if(!Number.isFinite(effect.rate)||effect.rate<=0||effect.rate>1||!Number.isFinite(actor.maxHp))return;
        const next=Math.max(1,hp-Math.max(1,Math.floor(actor.maxHp*effect.rate))),amount=next-hp;
        if(amount>=0)return;
        hp=next;
        applied.push({kind:'injury',amount});
        break;
      }
      case 'kitchen_damage':
      case 'building_damage': {
        const building=effect.kind==='kitchen_damage'?'kitchen':effect.building;
        if(!home||!Number.isSafeInteger(buildings[building])||buildings[building]<1||effect.amount!==1)return;
        buildings[building]--;
        applied.push(effect.kind==='kitchen_damage'?{kind:'kitchen_damage',amount:-1}:{...effect,amount:-1});
        break;
      }
      case 'sect_relation': {
        const targetSectId=comedyRelationTarget(world,ctx,effect.target);
        if(!targetSectId||targetSectId===sect.id||!isSectActive(world.sects.find(row=>row.id===targetSectId)))return;
        const previous=diplomacy.get(targetSectId)??sectRelation(world,sect.id,targetSectId)?.affinity??0;
        const next=clamp(previous+effect.amount,-100,100),amount=next-previous;
        if(!amount)return;
        diplomacy.set(targetSectId,next);
        applied.push({kind:'sect_relation',targetSectId,amount});
        break;
      }
      case 'fame':
        if(!Number.isFinite(fame)||Math.abs(fame+effect.amount)>1_000_000)return;
        fame+=effect.amount;
        applied.push(effect);
        break;
      case 'debt': {
        const creditor=world.cultivators.find(row=>row.id===ids.wang&&row.alive&&row.hp>0&&row.positionPlane===undefined);
        if(!creditor||debt&&debt.creditorId!==ids.wang)return;
        const next=(debt?.principal??0)+effect.amount;
        if(next<0||next>1_000_000_000||!debt&&world.tick+6>100_000_000)return;
        debt=next?{creditorId:ids.wang,dueTick:debt?.dueTick??world.tick+6,principal:next,
          comedyAdjustedTick:world.tick}:undefined;
        applied.push(effect);
        break;
      }
      case 'recruit': {
        const actorId=comedyIdentity(sect.id,'recruit',effect.template);
        if(!home||world.cultivators.some(row=>row.id===actorId)||recruits.some(row=>row.id===actorId))return;
        const recruit=createComedyRecruit(effect.template,actorId,home);
        recordMemory(recruit,world.tick,recruit.title,8,'social',3);
        recruits.push(recruit);
        applied.push({...effect,actorId});
        break;
      }
      case 'pet': {
        const beastId=effect.template==='pill-cat'?ids.cat:comedyIdentity(sect.id,'pet',effect.template);
        const existing=world.spiritBeasts.find(row=>row.id===beastId);
        if(!home||!isGrandSiegeFighterPresent(world,actor,home.id)||updates.has(beastId)||newPets.some(row=>row.id===beastId)||
          [...world.spiritBeasts,...newPets,...updates.values()].some(row=>row.tamedBy===actor.id&&row.alive&&row.hp>0))return;
        if(effect.template==='pill-cat'){
          if(!existing?.alive||existing.hp<=0||existing.tamedBy||existing.locationId!==home.id)return;
          updates.set(beastId,{...existing,tamedBy:actor.id,nextActionTick:world.tick+2});
        }else{
          if(existing)return;
          const data=COMEDY_PETS[effect.template];
          newPets.push({...data,id:beastId,kind:'瑞兽',locationId:home.id,homeLocationId:home.id,hp:data.maxHp,
            alive:true,tamedBy:actor.id,nextActionTick:world.tick+2,cultivation:5});
        }
        applied.push({...effect,beastId});
        break;
      }
      case 'visit':
      case 'sequel': {
        const dueTick=comedyDueTick(world.random.seed,ctx,index,effect.afterMonths);
        if(dueTick===undefined||queued.length+(m.comedy?.pending?.length??0)>=COMEDY_PENDING_LIMIT)return;
        if(effect.kind==='visit'&&!effect.reason.trim()||effect.kind==='sequel'&&!isSectComedySequel(effect.templateId)&&!findSectComedyTemplate(effect.templateId))return;
        const continuation=effect.kind==='visit'?{kind:'visit' as const,npc:effect.npc,dueTick}:
          {kind:'sequel' as const,templateId:effect.templateId,dueTick};
        queued.push({...continuation,originTick:ctx.tick,originTemplateId:ctx.templateId,effectIndex:index,speakerId:ctx.speakerId,
          ...(ctx.siteId?{siteId:ctx.siteId}:{})});
        applied.push(continuation);
        break;
      }
      case 'rumor': {
        if(!effect.line.trim()||effect.line.length>240||/[\p{Cc}\p{Cf}\p{Cs}<>]/u.test(effect.line))return;
        // Opening a public rumor is a deliberate authored choice; a private report cannot supply its proof.
        if(effect.group!=='own'&&(effect.group==='leaders'||ctx.source.phase!=='performed'||!ctx.source.reportEventId||
          !world.events.some(event=>event.id===('reportEventId' in ctx.source&&ctx.source.reportEventId)&&event.tick===ctx.tick&&
            event.witnessScope===undefined&&event.actorIds.includes(actor.id))))return;
        if(applied.some(row=>row.kind==='rumor'))return;
        applied.push({kind:'rumor',group:effect.group});
        break;
      }
    }
  }
  let committed=false;
  return {applied,pending:queued,commit:()=>{
    if(committed)return;
    committed=true;
    actor.qiProgress=qi;
    actor.hp=hp;
    actor.herbs=herbs;
    actor.artifacts=artifacts;
    sect.spiritStones=stones;
    sect.reputation=fame;
    for(const [id,next] of diplomacy)adjustSectAffinity(world,sect.id,id,next-(sectRelation(world,sect.id,id)?.affinity??0));
    if(home){
      if(buildings.furnace<m.buildings.furnace){
        const grade=buildings.furnace;
        if((grade===0||grade===1||grade===2)&&home.furnaceGrade>grade)home.furnaceGrade=grade;
        sect.facilities.alchemy_hall=Math.min(sect.facilities.alchemy_hall,buildings.furnace);
      }
      if(buildings.library<m.buildings.library)sect.facilities.scripture_pavilion=Math.min(sect.facilities.scripture_pavilion,buildings.library);
    }
    Object.assign(m.buildings,buildings);
    if(debt)m.debt=debt;
    else delete m.debt;
    world.cultivators.push(...recruits);
    for(const recruit of recruits)noteTerrainVisit(world,recruit);
    for(const beast of world.spiritBeasts){
      const next=updates.get(beast.id);
      if(next)Object.assign(beast,next);
    }
    world.spiritBeasts.push(...newPets);
    for(const entry of journal)recordResourceFlow(world,entry);
  }};
}
