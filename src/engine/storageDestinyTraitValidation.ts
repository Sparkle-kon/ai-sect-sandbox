import type {DestinyTraitAwakening,DestinyTraitId,DestinyTraitOffer} from '../types/destinyTrait';
import type {ChronicleAnchor,CultivationRealm,WorldEvent,WorldState} from '../types/world';
import {destinyTraitEarnedEventId,destinyTraitOfferId,destinyTraitOptions,destinyTraitSourceEventId,destinyTraitSourceEventMatches,
  isDestinyRealmTransition} from './destinyTraitEngine';
import {DESTINY_TRAIT_CATALOG} from './destinyTraitCatalog';

const realms:readonly CultivationRealm[]=['练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫'];
const singleActor=(e:Pick<WorldEvent,'actorIds'>,id:string)=>e.actorIds.length===1&&e.actorIds[0]===id;

const noInjectedDetail=(event:WorldEvent)=>event.witnessScope===undefined&&event.dialogue===undefined&&
  event.damage===undefined&&event.duelWinnerId===undefined;

/** The long-lived typed offer survives bounded chronicle retention. Any retained source must agree with it. */
export function validateDestinyTraitHistory(world:WorldState,fail:(field:string)=>never):void {
  const holders=world.cultivators.filter(actor=>actor.destinyTraits!==undefined);
  if(!holders.length)return;
  const sources=new Map<string,DestinyTraitOffer>();
  const awakenings=new Map<string,DestinyTraitAwakening>();
  for(const actor of holders){
    const progress=actor.destinyTraits;
    if(!progress)continue;
    if(!progress.earned.length&&!progress.pending)return fail('cultivators.destinyTraits.empty');
    const known:DestinyTraitId[]=[];
    let priorChosen=0,priorRealm=1;
    const readOffer=(offer:DestinyTraitOffer)=>{
      const {actorId,fromRealm,realm,openedTick,sourceEventId,id,options}=offer;
      const rank=realms.indexOf(realm);
      if(actorId!==actor.id||id!==destinyTraitOfferId(actorId,openedTick,realm)||
        !isDestinyRealmTransition(fromRealm,realm)||rank<=priorRealm||rank>realms.indexOf(actor.realm)||
        openedTick<=priorChosen||openedTick>world.tick||
        sourceEventId!==destinyTraitSourceEventId(actorId,openedTick,realm)||sources.has(sourceEventId))
        return fail('cultivators.destinyTraits.references');
      const expected=destinyTraitOptions(world,{id,actorId,fromRealm,realm,openedTick,sourceEventId},known);
      if(options.length!==3||new Set(options).size!==3||!expected||
        options.some((choice,i)=>choice!==expected[i]))return fail('cultivators.destinyTraits.options');
      const retainedTrial=actor.tribulation;
      if(sourceEventId.endsWith('-tribulation-passed')&&retainedTrial?.targetRealm===realm&&
        (retainedTrial.stage!=='passed'||retainedTrial.resolvedTick!==openedTick))
        return fail('cultivators.destinyTraits.source');
      sources.set(sourceEventId,offer);
      priorRealm=rank;
    };
    for(const row of progress.earned){
      readOffer(row);
      if(row.chosenTick<row.openedTick||row.chosenTick>world.tick||!row.options.includes(row.traitId)||known.includes(row.traitId))
        return fail('cultivators.destinyTraits.chosen');
      known.push(row.traitId);priorChosen=row.chosenTick;
      awakenings.set(destinyTraitEarnedEventId(row.id),row);
    }
    if(progress.pending){
      readOffer(progress.pending);
      if(progress.pending.realm!==actor.realm||!actor.alive||actor.hp<=0)return fail('cultivators.destinyTraits.pending');
    }
  }
  const hotIds=new Set<string>();
  for(const event of world.events){
    const offer=sources.get(event.id);
    const learned=awakenings.get(event.id);
    if(!offer&&!learned)continue;
    if(hotIds.has(event.id))return fail('cultivators.destinyTraits.eventDuplicate');
    hotIds.add(event.id);
    if(offer&&(!destinyTraitSourceEventMatches(event,offer)||!noInjectedDetail(event)))
      return fail('cultivators.destinyTraits.source');
    if(learned){
      const trait=DESTINY_TRAIT_CATALOG[learned.traitId];
      if(!singleActor(event,learned.actorId)||event.tick!==learned.chosenTick||event.category!=='breakthrough'||!event.locationId||
        !noInjectedDetail(event)||!event.title.endsWith(`觉醒命格「${trait.name}」`)||
        !event.description.endsWith(`踏入${learned.realm}后凝成命格「${trait.name}」，领悟本命神通「${trait.artName}」。`))
        return fail('cultivators.destinyTraits.awakening');
    }
  }
  const checkArchive=(rows:readonly ChronicleAnchor[])=>{
    for(const event of rows){
      const offer=sources.get(event.id);
      const learned=awakenings.get(event.id);
      // Chapters contain a legitimate sampled/display-trimmed copy. Do not equate its words with the live original.
      if(offer&&(!singleActor(event,offer.actorId)||event.tick!==offer.openedTick||event.category!=='breakthrough'))
        return fail('cultivators.destinyTraits.source');
      if(learned&&(!singleActor(event,learned.actorId)||event.tick!==learned.chosenTick||event.category!=='breakthrough'))
        return fail('cultivators.destinyTraits.awakening');
    }
  };
  checkArchive(world.chronicleArchive.anchors);
  for(const chapter of world.chronicleArchive.chapters)checkArchive(chapter.anchors);
  for(const chapter of world.coldHistory.chapters)checkArchive(chapter.anchors);
}
