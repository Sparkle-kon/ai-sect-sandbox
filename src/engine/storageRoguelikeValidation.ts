import type { WorldState } from '../types/world';
import type { RoguelikeEncounterChoice } from '../types/roguelikeEncounter';
import { activeRoguelikeEncounter, roguelikeEncounterRoll, roguelikeEncounterRoute, ROGUELIKE_ENCOUNTER_ACTOR_COOLDOWN,
  ROGUELIKE_ENCOUNTER_HISTORY, ROGUELIKE_ENCOUNTER_NPC_OPENING_THRESHOLD } from './roguelikeEncounterEngine';
import { roguelikeNominalEffect, selectRoguelikeStorylet } from './roguelikeEncounterCatalog';
import { isSectGatePublicSite, sectGateNominalReputation, sectGateReceiptText } from './sectGateTrialEngine';
import { SHARE_SAVE_REDACTED_TEXT } from './shareSaveRedactionText';
import { DIRECTOR_NUDGE_MAX_MONTHS } from './director/nudge';

type Fail = (field:string)=>never;

export function validateRoguelikeEncounterHistory(world:WorldState,actorIds:ReadonlySet<string>,fail:Fail):void {
  const rows=world.roguelikeEncounters??[];
  const eventPrefix='evt-roguelike-encounter-';
  const privateEvent=(eventId:string)=>eventId.startsWith(eventPrefix);
  const hasPrivate=(anchors:readonly {id:string}[])=>anchors.some(anchor=>privateEvent(anchor.id));
  if(hasPrivate(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(chapter=>hasPrivate(chapter.anchors))||
    world.coldHistory.chapters.some(chapter=>hasPrivate(chapter.anchors))||
    world.chronicleCausality.nodes.some(row=>privateEvent(row.eventId))||world.chronicleErrata.sources.some(row=>privateEvent(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>privateEvent(row.source.sourceEventId)))
    return fail('roguelikeEncounters.publicArchive');
  if(!rows.length&&world.roguelikeEncounters!==undefined)return fail('roguelikeEncounters.empty');
  if(!rows.length&&!world.events.some(({id})=>privateEvent(id)))return;
  const body=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const seen=new Set<string>(),offered=new Set<string>(),latest=new Map<string,number>();
  let lastOpened=0,previousTerminal=0;
  const stamps=new Map<string,{tick:number;actorId:string;siteId:string;gate?:{choice?:RoguelikeEncounterChoice}}>();
  const oldestHot=world.events.reduce((at,event)=>Math.min(at,event.tick),Infinity);
  const needsHot=(at:number)=>at>oldestHot||at===world.tick&&world.events.length<120;
  const siteAt=(id:string)=>{
    const matches=world.locations.filter(site=>site.id===id);
    return matches.length===1?matches[0]:undefined;
  };
  // Relocation can turn a once lawful headquarters into an ordinary vein. Honor that retained history
  // and never require a former ruler to be still alive, stationed here, or holding the same office.
  const pastBlood=(site:WorldState['locations'][number])=>site.id==='loc-blood'&&site.type==='abyss';
  const signed=(actual:number,nominal:number)=>nominal===0?actual===0:
    nominal>0?actual>=0&&actual<=nominal+1e-7:actual<=0&&actual>=nominal-1e-7;
  for(const row of rows){
    const {actorId,fromSiteId,siteId,id,openedTick,status,resolvedTick,choice,outcome,witnessId}=row;
    const gate=row.kind==='sect-gate',seal=row.sectGate;
    if(seen.has(id)||id!==`roguelike-encounter-${openedTick}-${actorId}`||openedTick<1||openedTick>world.tick||
      !actorIds.has(actorId)||(!gate&&!roguelikeEncounterRoute(world,fromSiteId,siteId))||
      (row.kind==='wounded-traveler'?(witnessId===undefined||witnessId===actorId||!actorIds.has(witnessId)):witnessId!==undefined))
      return fail('roguelikeEncounters.references');
    const hosts=gate&&seal?world.sects.filter(sect=>sect.id===seal.sectId):[];
    const host=hosts.length===1?hosts[0]:undefined;
    if(gate){
      if(row.directorTicketUntil!==undefined||row.directorChoice)return fail('roguelikeEncounters.sectGate.variant');
      const from=siteAt(fromSiteId),venue=siteAt(siteId);
      if(!row.guided||!seal||!host||seal.leaderId===actorId||!actorIds.has(seal.leaderId)||
        seal.possessionUntilTick<=openedTick||seal.possessionUntilTick>openedTick+5||
        !from||!venue||from===venue||
        (!isSectGatePublicSite(from)&&!(status!=='offered'&&pastBlood(from)))||
        !(venue.type==='sect_hq'||pastBlood(venue)||status!=='offered'&&venue.type==='spirit_vein'))
        return fail('roguelikeEncounters.sectGate.references');
      const stillTitled=host.headquartersId===siteId&&venue.ownerSectId===host.id&&isSectGatePublicSite(venue)&&
        (venue.type==='sect_hq'||pastBlood(venue));
      const endedAfter=(at:number)=>at>=openedTick&&at<=world.tick;
      const relocated=world.relocations.plans.some(plan=>plan.sectId===host.id&&plan.originId===siteId&&
        plan.status==='settled'&&plan.settledTick!==undefined&&endedAfter(plan.settledTick))||
        world.relocations.abandonedSites.some(site=>site.sectId===host.id&&site.originId===siteId&&endedAfter(site.tick));
      const retired=!stillTitled&&!relocated&&status!=='offered'&&host.headquartersId===siteId&&
        host.inactiveSinceTick!==undefined&&host.inactiveSinceTick>openedTick&&host.inactiveSinceTick<=world.tick&&
        world.doctrineFoundings.foundings.filter(founding=>{
          const settlement=founding.maturity?.settlement;
          return founding.status==='established'&&founding.independentSectId===host.id&&!!settlement&&
            settlement.tick===host.inactiveSinceTick&&settlement.siteId===siteId;
        }).length===1;
      if(!stillTitled&&!relocated&&!retired&&needsHot(openedTick))return fail('roguelikeEncounters.sectGate.title');
      if(openedTick===world.tick&&host.leaderId!==seal.leaderId)return fail('roguelikeEncounters.sectGate.authority');
      if(status==='offered'&&world.playerAvatar.possessedId===actorId&&
        world.playerAvatar.possessionUntilTick!==seal.possessionUntilTick)return fail('roguelikeEncounters.sectGate.authority');
    }else if(seal!==undefined||outcome?.sectReputationDelta!==undefined)return fail('roguelikeEncounters.sectGate.variant');
    if(openedTick<lastOpened||openedTick-(latest.get(actorId)??-Infinity)<ROGUELIKE_ENCOUNTER_ACTOR_COOLDOWN)
      return fail('roguelikeEncounters.order');
    if(!gate){
      const aim=roguelikeEncounterRoll(world,row,'kind');
      // Stored ownership is independently checked above; past posture/HP is not a live role.
      const kind=selectRoguelikeStorylet(aim,actorId,witnessId)?.definition.id;
      if(row.kind!==kind)return fail('roguelikeEncounters.kind');
      const ticket=row.directorTicketUntil;
      if(ticket!==undefined&&(!world.storyteller||openedTick<=world.storyteller.configuredTick||
        ticket<openedTick||ticket-openedTick>=DIRECTOR_NUDGE_MAX_MONTHS))return fail('roguelikeEncounters.directorTicket');
      if(!row.guided&&ticket===undefined&&roguelikeEncounterRoll(world,row,'opening')>=ROGUELIKE_ENCOUNTER_NPC_OPENING_THRESHOLD)
        return fail('roguelikeEncounters.openingRoll');
    }
    seen.add(id);latest.set(actorId,openedTick);lastOpened=openedTick;
    stamps.set(`evt-${id}-open`,{tick:openedTick,actorId,siteId,...(gate?{gate:{}}:{})});
    if(status!=='resolved'&&row.directorChoice)return fail('roguelikeEncounters.directorChoice');
    if(status==='offered'){
      const person=body.get(actorId);
      const releasedGate=gate&&world.playerAvatar.possessedId!==actorId;
      if(offered.has(actorId)||openedTick!==world.tick||resolvedTick!==undefined||choice!==undefined||outcome!==undefined||
        !person||!releasedGate&&activeRoguelikeEncounter(world,person)!==row)
        return fail('roguelikeEncounters.open');
      offered.add(actorId);
      continue;
    }
    if(resolvedTick===undefined||resolvedTick<openedTick||resolvedTick>world.tick||resolvedTick>openedTick+1)
      return fail('roguelikeEncounters.phase');
    if(resolvedTick<world.tick)previousTerminal++;
    if(status==='expired'){
      if(choice!==undefined||outcome!==undefined)return fail('roguelikeEncounters.phase');
      continue;
    }
    if(choice===undefined||outcome===undefined||(!row.guided&&!row.directorChoice&&resolvedTick!==openedTick+1)||
      (row.guided&&resolvedTick!==openedTick&&choice!=='leave'))return fail('roguelikeEncounters.phase');
    if(row.directorChoice){
      const history=world.storyteller?.highlights;
      const command=history?.find(item=>item.tick===openedTick);
      const hasChoice=command?.kind==='encounter'&&command.sourceId===id&&command.actorId===actorId&&command.chosen===choice;
      const beyondHistory=history?.length===120&&openedTick<history[0].tick;
      if(row.guided||resolvedTick!==openedTick||!hasChoice&&!beyondHistory)return fail('roguelikeEncounters.directorChoice');
    }
    if(row.kind==='sect-gate'){
      if(!host||resolvedTick!==openedTick)return fail('roguelikeEncounters.sectGate.phase');
      const nominal=sectGateNominalReputation(host.alignment,choice),paid=outcome.sectReputationDelta;
      if(paid===undefined||paid<0||paid>nominal||outcome.success!==(choice!=='leave')||
        [outcome.qiDelta,outcome.hpDelta,outcome.karmaDelta,outcome.lifespanDelta,outcome.affinityDelta].some(delta=>delta!==0))
        return fail('roguelikeEncounters.sectGate.outcome');
      stamps.set(`evt-${id}-settled`,{tick:resolvedTick,actorId,siteId,gate:{choice}});
      continue;
    }
    const {success,effect}=roguelikeNominalEffect(row.kind,choice,roguelikeEncounterRoll(world,row,choice));
    if(success!==outcome.success||!signed(outcome.qiDelta,effect.qi)||!signed(outcome.karmaDelta,effect.karma)||
      !signed(outcome.lifespanDelta,effect.years)||!signed(outcome.affinityDelta,effect.affinity)||
      !signed(outcome.hpDelta,Math.round(1_000_000_000*effect.hpRate)))return fail('roguelikeEncounters.outcome');
    stamps.set(`evt-${id}-settled`,{tick:resolvedTick,actorId,siteId});
  }
  // The previous frame's bounded native event ring may still pin terminals which just left the new ring.
  if(previousTerminal>ROGUELIKE_ENCOUNTER_HISTORY+120)return fail('roguelikeEncounters.retention');
  const newsIds=new Set<string>();
  for(const news of world.events){
    if(!privateEvent(news.id))continue;
    const expected=stamps.get(news.id);
    if(!expected||newsIds.has(news.id)||news.witnessScope!=='participants'||news.category!=='intrigue'||
      news.tick!==expected.tick||news.locationId!==expected.siteId||news.actorIds.length!==1||news.actorIds[0]!==expected.actorId||
      news.dialogue!==undefined||news.duelWinnerId!==undefined||news.damage!==undefined)
      return fail('roguelikeEncounters.event');
    if(expected.gate){
      const date=(world.year-1)*12+world.month-1-(world.tick-expected.tick);
      const words=sectGateReceiptText(expected.gate.choice);
      // The confirmed share export redacts exactly these two narrative fields, never the dated receipt authority.
      const exactWords=news.title===words.title&&news.description===words.description;
      const redactedWords=news.title===SHARE_SAVE_REDACTED_TEXT&&news.description===SHARE_SAVE_REDACTED_TEXT;
      if(date<0||news.year!==Math.floor(date/12)+1||news.month!==date%12+1||
        (!exactWords&&!redactedWords)||news.daoIntents!==undefined||news.forbiddenArt!==undefined)
        return fail('roguelikeEncounters.sectGate.event');
    }
    newsIds.add(news.id);
  }
  const gateProofs=new Set([...stamps].filter(([,stamp])=>stamp.gate!==undefined).map(([eventId])=>eventId));
  for(const eventId of gateProofs){
    const stamp=stamps.get(eventId)!;
    if(needsHot(stamp.tick)&&!newsIds.has(eventId))return fail('roguelikeEncounters.sectGate.source');
  }
  if(gateProofs.size&&world.cultivators.some(actor=>actor.rumors.some(row=>row.originEventId!==undefined&&gateProofs.has(row.originEventId))))
    return fail('roguelikeEncounters.sectGate.privateRumor');
}
