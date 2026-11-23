import type {LocationNode,MapHazard,WorldEvent,WorldState} from '../types/world';
import type {FurnaceEmergencyCase,FurnaceEmergencyMove} from '../types/furnaceEmergency';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {terrainTileAt} from './terrainEngine';

export const MAX_WARD=12,USE_WINDOW=2;
export const exact=<T>(rows:readonly T[],test:(row:T)=>boolean)=>{let one:T|undefined;for(const row of rows)if(test(row)){if(one!==undefined)return;one=row;}return one;};
export const actorAt=(world:WorldState,id:string)=>exact(world.cultivators,row=>row.id===id);
export const siteAt=(world:WorldState,id:string)=>exact(world.locations,row=>row.id===id);
export const sourceAt=(world:WorldState,id:string)=>exact(world.events,row=>row.id===id);
export const caseId=(safetyId:string,studentId:string)=>`furnace-emergency-${safetyId}-${studentId}`;
export const isPhase=(hazard:MapHazard,tick:number)=>hazard.kind==='beast_tide'&&hazard.createdTick<tick&&tick<hazard.expiresTick;
export const tileAt=(world:WorldState,site:LocationNode)=>terrainTileAt(world,site.x,site.y);
export const siteAllowed=(site:LocationNode)=>site.type!=='abyss'&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site);
const day=(world:WorldState,tick:number)=>{const n=world.year*12+world.month-1-(world.tick-tick);return{year:Math.floor(n/12),month:n%12+1};};
const eventDate=(world:WorldState,event:WorldEvent,tick:number)=>{const date=day(world,tick);return event.tick===tick&&event.year===date.year&&event.month===date.month;};
export const adjacent=(world:WorldState,from:LocationNode,to:LocationNode)=>{
  const a=tileAt(world,from),b=tileAt(world,to);
  return !!a&&!!b&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1;
};
export function actualInjury(world:WorldState,row:FurnaceEmergencyCase,event:WorldEvent){
  return event.id===row.injuryEventId&&event.id===`evt-${row.damagedTick}-${row.hazardId}`&&eventDate(world,event,row.damagedTick)&&
    event.witnessScope===undefined&&event.locationId===row.siteId&&(event.category==='heavenly'||event.category==='death')&&
    event.title==='兽潮席卷'&&event.actorIds.filter(id=>id===row.studentId).length===1&&
    event.damage?.filter(hit=>hit.cultivatorId===row.studentId).length===1&&
    event.damage.find(hit=>hit.cultivatorId===row.studentId)?.amount===row.injuryHp;
}
export function actualClosure(world:WorldState,row:FurnaceEmergencyCase,event:WorldEvent){
  return event.id===`evt-${row.safetyId}-closed-${row.damagedTick}`&&eventDate(world,event,row.damagedTick)&&
    event.witnessScope===undefined&&event.locationId===row.siteId&&event.category==='heavenly'&&
    event.title==='兽潮实损，炉事暂止'&&!event.actorIds.length;
}
/** Archives omit raw damage; only use an exact independent public anchor when the 120-event ring rotated. */
export function furnaceEmergencyOriginals(world:WorldState,row:FurnaceEmergencyCase):boolean{
  const safety=exact(world.furnaceSafety.cases,caseRow=>caseRow.id===row.safetyId);
  if(!safety||safety.siteId!==row.siteId||safety.hazardId!==row.hazardId||safety.damagedTick!==row.damagedTick)return false;
  const proof=(id:string,raw:(event:WorldEvent)=>boolean,anchor:(event:WorldEvent)=>boolean)=>{
    const rows=world.events.filter(event=>event.id===id);
    if(rows.length)return rows.length===1&&raw(rows[0]);
    if(world.events.length<120||world.events.some(event=>event.tick<row.damagedTick))return false;
    const cold=exact(world.chronicleArchive.anchors,event=>event.id===id);
    return !!cold&&anchor(cold);
  };
  const injury=(event:WorldEvent)=>event.id===`evt-${row.damagedTick}-${row.hazardId}`&&eventDate(world,event,row.damagedTick)&&
    event.witnessScope===undefined&&event.locationId===row.siteId&&event.title==='兽潮席卷'&&
    (event.category==='heavenly'||event.category==='death')&&event.actorIds.filter(id=>id===row.studentId).length===1&&
    /^兽群扑向当地修士，[1-9]\d*人受创(?:，有人陨落)?。$/u.test(event.description);
  return proof(row.injuryEventId,event=>actualInjury(world,row,event),injury)&&
    proof(`evt-${row.safetyId}-closed-${row.damagedTick}`,event=>actualClosure(world,row,event),event=>
      actualClosure(world,row,event)&&event.description==='兽潮损伤实有丹炉，本炉停用；装炉品阶与已有凭据不改。');
}
export function tuition(world:WorldState,id:string){
  return exact(world.mentorship.offers,row=>row.id===id);
}
export const words:Record<FurnaceEmergencyMove|'applied'|'crossed'|'returned', {title:string;description:string}>={
  brace:{title:'先备下护炉药料的手势',description:'只做准备。未扣灵气，也没有重开受损丹炉。'},
  retreat:{title:'本人退至相邻安全处',description:'实际跨过一条相邻边，未带动他人；这月此前受的伤没有改写。'},
  request_rescue:{title:'向仍在现场的授业者求援',description:'本人请其决定是否援手；两个人都还没有移动。'},
  accept_rescue:{title:'授业者亲自答应同行撤离',description:'只记答应；实际两人过界后才记作撤离。'},
  applied:{title:'护住一份炉旁已有药材',description:'遇到原兽潮下一次实击，实付八点灵气、少受部分气血损失，封存一份已有玄土根。炉损和停用不变。'},
  crossed:{title:'两人已在相邻避难处落脚',description:'两人确实越过相邻一段路，在避难处落脚。炉口没有因此重开。'},
  returned:{title:'封存药材交回原处',description:'兽潮退后，已有的一份封存玄土根确实归回原处；没有新生药材。'},
};
export type EventKind=keyof typeof words;
export const eventId=(row:FurnaceEmergencyCase,kind:EventKind,tick:number)=>`evt-${row.id}-${kind}-${tick}`;
export const isPrivateFurnaceEmergencyEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith('evt-furnace-emergency-');
export function receipt(world:WorldState,row:FurnaceEmergencyCase,kind:EventKind,tick=world.tick):WorldEvent{
  const joint=kind==='request_rescue'||kind==='accept_rescue'||kind==='crossed';
  const place=kind==='retreat'||kind==='crossed'?row.decision?.refugeId:row.siteId;
  const wording=words[kind];
  return {id:eventId(row,kind,tick),tick,...day(world,tick),category:'heavenly',...(kind==='crossed'?{}:{witnessScope:'participants' as const}),locationId:place,
    actorIds:joint?[row.studentId,row.mentorId]:[row.studentId],title:wording.title,
    description:kind==='applied'?`${wording.description}实减${row.decision?.preventedHp}点。`:wording.description};
}
export function matching(world:WorldState,row:FurnaceEmergencyCase,kind:EventKind,event:WorldEvent,tick:number){
  const wanted=receipt(world,row,kind,tick);
  return event.id===wanted.id&&eventDate(world,event,tick)&&event.category===wanted.category&&event.witnessScope===wanted.witnessScope&&
    event.locationId===wanted.locationId&&event.title===wanted.title&&event.description===wanted.description&&
    event.actorIds.length===wanted.actorIds.length&&event.actorIds.every((id,i)=>id===wanted.actorIds[i]);
}

export function validateFurnaceEmergencySave(world:WorldState,fail:(path:string)=>never):void{
  const state=world.furnaceEmergencies;
  if(!state)return;
  if(!state.cases.length)fail('furnaceEmergencies.empty');
  const ids=new Set<string>(),known=new Set<string>();
  const fresh=(tick:number)=>world.events.length<120||world.events.some(event=>event.tick<tick);
  const dated=(tick:number)=>Number.isSafeInteger(tick)&&tick>=1&&tick<=world.tick;
  function proof(id:string,tick:number,agree:(event:WorldEvent)=>boolean){
    const events=world.events.filter(event=>event.id===id);
    if(events.length>1||!events.length&&fresh(tick)||events[0]&&!agree(events[0]))fail('furnaceEmergencies.source');
  }
  for(const row of state.cases){
    const safety=exact(world.furnaceSafety.cases,item=>item.id===row.safetyId),site=siteAt(world,row.siteId);
    const student=actorAt(world,row.studentId),mentor=actorAt(world,row.mentorId),offer=tuition(world,row.tuitionId);
    if(ids.has(row.id)||row.id!==caseId(row.safetyId,row.studentId)||!student||!mentor||row.studentId===row.mentorId||
      !safety||!site||!siteAllowed(site)||safety.siteId!==site.id||safety.damagedTick!==row.damagedTick||
      safety.hazardId!==row.hazardId||safety.hazardTileId!==tileAt(world,site)?.id||!dated(row.damagedTick)||
      !dated(row.usedTick)||row.usedTick>=row.damagedTick||row.damagedTick-row.usedTick>USE_WINDOW||
      !Number.isSafeInteger(row.injuryHp)||row.injuryHp<=0||
      row.injuryEventId!==`evt-${row.damagedTick}-${row.hazardId}`||!offer&&fresh(row.damagedTick)||
      offer&&(offer.mentorId!==row.mentorId||offer.studentId!==row.studentId||offer.status!=='accepted'||
        offer.resolvedTick===undefined||offer.resolvedTick>=row.usedTick))fail('furnaceEmergencies.origin');
    ids.add(row.id);
    proof(row.injuryEventId,row.damagedTick,event=>actualInjury(world,row,event));
    proof(`evt-${row.safetyId}-closed-${row.damagedTick}`,row.damagedTick,event=>actualClosure(world,row,event));
    const used=world.furnaceReservations.uses.filter(use=>use.siteId===row.siteId&&use.actorId===row.studentId&&
      use.tick===row.usedTick&&use.kind==='brew');
    if(used.length>1||!used.length&&world.tick-row.usedTick<6)fail('furnaceEmergencies.brew');
    const d=row.decision;
    if(!d)continue;
    if(!dated(d.tick)||d.tick<=row.damagedTick||d.tick>=safety.hazardCreatedTick+4)fail('furnaceEmergencies.choice');
    const privateSource=(kind:EventKind,tick:number)=>{
      if(!dated(tick))fail('furnaceEmergencies.clock');
      const id=eventId(row,kind,tick);known.add(id);proof(id,tick,event=>matching(world,row,kind,event,tick));
    };
    privateSource(d.move,d.tick);
    if(d.move==='brace'){
      if(d.refugeId!==undefined||d.acceptedTick!==undefined||d.crossedTick!==undefined)fail('furnaceEmergencies.brace');
      if(d.appliedTick!==undefined){
        if(d.appliedTick!==d.tick+1||d.appliedTick>=safety.hazardCreatedTick+4||d.storedRoot!==1||
          !Number.isSafeInteger(d.preventedHp)||d.preventedHp!<1||d.preventedHp!>MAX_WARD)fail('furnaceEmergencies.applied');
        privateSource('applied',d.appliedTick);
      }else if(d.preventedHp!==undefined||d.storedRoot!==undefined||d.returnedTick!==undefined)fail('furnaceEmergencies.applied');
      if(d.returnedTick!==undefined){
        if(d.appliedTick===undefined||d.returnedTick<=d.appliedTick)fail('furnaceEmergencies.returned');
        privateSource('returned',d.returnedTick);
      }
    }else{
      const refuge=d.refugeId&&siteAt(world,d.refugeId);
      if(!refuge||!siteAllowed(refuge)||!adjacent(world,site,refuge)||d.storedRoot!==undefined||d.returnedTick!==undefined||
        d.appliedTick!==undefined||d.preventedHp!==undefined)fail('furnaceEmergencies.refuge');
      if(d.move==='retreat'){
        if(d.crossedTick!==d.tick||d.acceptedTick!==undefined)fail('furnaceEmergencies.retreat');
      }else{
        if(d.acceptedTick!==undefined){
          if(d.acceptedTick!==d.tick+1||d.acceptedTick>=safety.hazardCreatedTick+4)fail('furnaceEmergencies.accept');
          privateSource('accept_rescue',d.acceptedTick);
        }
        if(d.crossedTick!==undefined){
          if(d.acceptedTick===undefined||d.crossedTick!==d.acceptedTick+1)fail('furnaceEmergencies.crossed');
          privateSource('crossed',d.crossedTick);
        }
      }
    }
  }
  for(const event of world.events)if(event.id.startsWith('evt-furnace-emergency-')&&!known.has(event.id))fail('furnaceEmergencies.orphan');
}
