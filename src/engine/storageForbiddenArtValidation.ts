import type {ForbiddenArtScar,ForbiddenDuelContact} from '../types/forbiddenArt';
import type {WorldEvent,WorldState} from '../types/world';
import {equippedArtifact} from './artifactEngine';
import {FORBIDDEN_ART_CATALOG} from './forbiddenArtCatalog';
import {forbiddenArtCost,forbiddenArtEventId,forbiddenArtScarId,forbiddenDuelContactId,forbiddenDuelForParticipant}
  from './forbiddenArtEngine';

type Fail=(path:string)=>never;
const opening=(id:string)=>id.startsWith('evt-forbidden-duel-')&&id.endsWith('-contact');
const sameScar=(a:ForbiddenArtScar,b:ForbiddenArtScar)=>a.id===b.id&&a.contactId===b.contactId&&a.artId===b.artId&&
  a.ownerId===b.ownerId&&a.opponentId===b.opponentId&&a.artifactId===b.artifactId&&a.siteId===b.siteId&&
  a.openedTick===b.openedTick&&a.tick===b.tick&&a.paid.hp===b.paid.hp&&a.paid.lifespan===b.paid.lifespan&&
  a.paid.durability===b.paid.durability&&a.result===b.result&&a.origin===b.origin;
const attack=(scar:ForbiddenArtScar)=>scar.contactId===forbiddenDuelContactId(scar.openedTick,scar.ownerId,scar.opponentId)?
  scar.ownerId:scar.opponentId;
const scarKey=(scar:ForbiddenArtScar)=>JSON.stringify([scar.ownerId,scar.artId]);

function validEvent(event:WorldEvent,row:ForbiddenArtScar):boolean{
  if(event.actorIds.length!==2||!event.actorIds.includes(row.ownerId)||!event.actorIds.includes(row.opponentId)||
    event.witnessScope!==undefined||event.locationId!==row.siteId||event.tick!==row.tick)return false;
  if(row.result==='escape')return event.id===forbiddenArtEventId(row.contactId)&&event.category==='combat'&&
    event.actorIds[0]===attack(row)&&event.duelWinnerId===undefined&&event.dialogue===undefined&&!event.damage?.length;
  const death=event.category==='death';
  return (death||event.category==='combat')&&event.actorIds[0]===attack(row)&&
    event.id===`evt-${row.tick}-${event.actorIds[0]}-${death?'kill':'duel'}`&&
    event.duelWinnerId===(row.result==='reversal'?row.ownerId:row.opponentId)&&
    (row.result==='reversal'||death===(row.result==='fallen'));
}

/** Active custody matches the current world; historical scars do not assert who carries the item today. */
export function validateForbiddenArtHistory(world:WorldState,fail:Fail):void{
  const privateSource=(rows:readonly {id:string}[])=>rows.some(({id})=>opening(id));
  if(privateSource(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(chapter=>privateSource(chapter.anchors))||
    world.coldHistory.chapters.some(chapter=>privateSource(chapter.anchors))||
    world.chronicleCausality.nodes.some(row=>opening(row.eventId))||world.chronicleErrata.sources.some(row=>opening(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>opening(row.source.sourceEventId))||world.mapPresentation.effects.some(row=>opening(row.id)))
    return fail('forbiddenDuels.publicArchive');

  const contacts=world.forbiddenDuels??[];
  if(!contacts.length&&world.forbiddenDuels!==undefined)return fail('forbiddenDuels.empty');
  if(!contacts.length&&!world.cultivators.some(actor=>actor.forbiddenScars!==undefined)&&
    !world.events.some(event=>event.forbiddenArt!==undefined||opening(event.id)))return;
  const people=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const sites=new Set(world.locations.map(site=>site.id));
  const active=new Map<string,ForbiddenDuelContact>(),inUse=new Set<string>();
  const firstScar=new Map<string,ForbiddenArtScar>();
  const histories=new Map<string,ForbiddenArtScar>();
  const eventForScar=new Set<string>();

  for(const row of contacts){
    const actor=people.get(row.attackerId),owner=people.get(row.ownerId);
    // Dynamic health and available payment can change; the native resolver reoffers or declines safely.
    if(!actor||!owner||forbiddenDuelForParticipant(world,actor)!==row||active.has(row.id)||
      inUse.has(row.attackerId)||inUse.has(row.defenderId)||row.openedTick<1)
      return fail('forbiddenDuels.contact');
    const choice=row.queued?.choice;
    const root=equippedArtifact(owner)?.spiritRoot;
    if(row.queued&&(!row.guided||row.queued.tick<row.openedTick||row.queued.tick>world.tick||
      (choice!==undefined&&choice!=='decline'&&FORBIDDEN_ART_CATALOG[choice].roots?.some(r=>r===root)===false)))
      return fail('forbiddenDuels.queued');
    active.set(row.id,row);
    inUse.add(row.attackerId);inUse.add(row.defenderId);
  }

  const validatesScar=(row:ForbiddenArtScar)=>{
    const owner=people.get(row.ownerId);
    if(!owner||!people.has(row.opponentId)||row.ownerId===row.opponentId||!sites.has(row.siteId)||
      row.openedTick<1||row.openedTick>=row.tick||row.tick>world.tick||active.has(row.contactId)||
      row.id!==forbiddenArtScarId(row.contactId,row.artId)||
      (row.contactId!==forbiddenDuelContactId(row.openedTick,row.ownerId,row.opponentId)&&
        row.contactId!==forbiddenDuelContactId(row.openedTick,row.opponentId,row.ownerId)))
      return fail('forbiddenArt.scar');
    const recipe=FORBIDDEN_ART_CATALOG[row.artId];
    const largest=forbiddenArtCost(row.artId,1_000_000_000);
    const minimum=recipe.bloodFraction?1:0;
    if(row.paid.lifespan!==largest.lifespan||row.paid.durability!==largest.durability||
      !Number.isSafeInteger(row.paid.hp)||row.paid.hp<minimum||row.paid.hp>largest.hp||
      row.tick===world.tick&&row.paid.hp!==forbiddenArtCost(row.artId,owner.maxHp).hp||
      Boolean(recipe.escape)!==(row.result==='escape')||recipe.lastStand&&row.result==='fallen')
      return fail('forbiddenArt.cost');
  };

  for(const actor of world.cultivators){
    const rows=actor.forbiddenScars;
    if(rows&&!rows.length)return fail('cultivators.forbiddenScars.empty');
    let previousTick=0;
    for(const row of rows??[]){
      validatesScar(row);
      const key=scarKey(row);
      if(row.ownerId!==actor.id||firstScar.has(key)||histories.has(row.contactId)||row.tick<=previousTick)
        return fail('cultivators.forbiddenScars.owner');
      previousTick=row.tick;
      firstScar.set(key,row);histories.set(row.contactId,row);
    }
  }

  // Native bounded events can carry repeats of the same art without overwriting its first scar.
  const eventsById=new Map<string,WorldEvent[]>();
  const privateSeen=new Set<string>();
  for(const event of world.events){
    const linked=eventsById.get(event.id);
    if(linked)linked.push(event);else eventsById.set(event.id,[event]);
    const row=event.forbiddenArt;
    if(opening(event.id)){
      const [attackerId,defenderId]=event.actorIds;
      const source=forbiddenDuelContactId(event.tick,attackerId,defenderId);
      const custody=active.get(source)??histories.get(source);
      if(privateSeen.has(event.id)||event.id!==`evt-${source}-contact`||!!row||
        event.actorIds.length!==2||attackerId===defenderId||!people.has(attackerId)||!people.has(defenderId)||
        event.tick<1||event.tick>world.tick||event.category!=='combat'||event.witnessScope!=='participants'||
        !event.locationId||!sites.has(event.locationId)||custody&&custody.siteId!==event.locationId||
        event.dialogue!==undefined||event.damage!==undefined||event.duelWinnerId!==undefined)
        return fail('forbiddenDuels.openEvent');
      privateSeen.add(event.id);
    }
    if(!row)continue;
    validatesScar(row);
    const first=firstScar.get(scarKey(row));
    if(eventForScar.has(row.contactId)||!validEvent(event,row)||!first||
      row.tick<first.tick||row.tick===first.tick&&!sameScar(row,first))return fail('events.forbiddenArt');
    eventForScar.add(row.contactId);
  }

  for(const row of histories.values()){
    const id=`evt-${row.tick}-${attack(row)}`;
    const sources=row.result==='escape'?[forbiddenArtEventId(row.contactId)]:
      row.result==='reversal'?[`${id}-duel`,`${id}-kill`]:[`${id}-${row.result==='fallen'?'kill':'duel'}`];
    const originals=sources.flatMap(source=>eventsById.get(source)??[]);
    if(originals.length>1||originals.some(event=>!event.forbiddenArt||!sameScar(event.forbiddenArt,row)))
      return fail('cultivators.forbiddenScars.event');
  }
}
