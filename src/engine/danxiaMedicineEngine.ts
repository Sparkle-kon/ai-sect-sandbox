import type { Cultivator, DanxiaMedicineCommitment, DanxiaMedicineMove, DanxiaMedicineState, DanxiaShortage, LLMDecisionPayload,
  WorldEvent, WorldState } from '../types/world';
import { brewDanxiaCustody, canBrewDanxiaCustody } from './alchemyEngine';
import { DANXIA_MEDICINE_ACK_TICKS, DANXIA_MEDICINE_LEAVES, DANXIA_MEDICINE_MAX_STEPS, DANXIA_MEDICINE_OFFER_TICKS,
  DANXIA_MEDICINE_STRIDE, activeDanxiaMedicineEscort, danxiaMedicineId, danxiaMedicineParties, flowDanxiaMedicine } from './danxiaMedicineTerms';
import { danxiaMedicineSite } from './danxiaShortageTerms';
import { clinicAccessForFollowup } from './infirmaryEngine';
import { flowActor, recordResourceFlow } from './resourceFlowEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { activeCourierForActor, courierActedThisTick, courierPublicPath } from './sealedCourierEngine';
import { activeEscortForActor } from './escortEngine';
import { activeRelocationForActor } from './relocationEngine';
import { activePilgrimageForActor, pilgrimageActedThisTick } from './pilgrimageEngine';
import { activeSiegeForActor } from './diplomacyEngine';
import { activeOccasionForActor } from './occasionEngine';
import { isTribulationActive } from './tribulationEngine';
import { isRetiredFromService } from './serviceRetirementEngine';
import { terrainTileAt } from './terrainEngine';
import { presentAtVillageGranary } from './villageGranaryEngine';

export const createDanxiaMedicineState = (): DanxiaMedicineState => ({commitments:[]});

export type DanxiaMedicineOption =
  | { action:'DANXIA_MEDICINE'; danxiaMedicineMove:'observe'|'retain'; targetDanxiaShortageId:string;targetDanxiaMedicineId?:never;targetCultivatorId?:never }
  | { action:'DANXIA_MEDICINE'; danxiaMedicineMove:'offer_ship'; targetDanxiaShortageId:string; targetCultivatorId:string;targetDanxiaMedicineId?:never }
  | { action:'DANXIA_MEDICINE'; danxiaMedicineMove:Exclude<DanxiaMedicineMove,'observe'|'retain'|'offer_ship'>; targetDanxiaMedicineId:string;targetDanxiaShortageId?:never;targetCultivatorId?:never };

const alive = (actor: Cultivator | undefined): actor is Cultivator => !!actor?.alive && actor.hp > 0;
const exactActor = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id);
const finiteStock = (value:number, minimum:number, maximum:number) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const existing = (world: WorldState, shortageId: string) => world.danxiaMedicine.commitments.some(row => row.shortageId === shortageId);

export {activeDanxiaMedicineEscort,danxiaMedicineCheckpoint} from './danxiaMedicineTerms';

function atRecoverySite(world:WorldState,actor:Cultivator,siteId:string,tick:number) {
  const assignment=actor.guardAssignment;
  return actor.locationId===siteId && world.locations.some(place=>place.id===siteId) &&
    !activeDanxiaMedicineEscort(world,actor) && !activeCourierForActor(world,actor) && !activeEscortForActor(world,actor) &&
    !activeRelocationForActor(world,actor) && !activePilgrimageForActor(world,actor) && !activeSiegeForActor(world,actor) &&
    !activeOccasionForActor(world,actor) && !isTribulationActive(actor) &&
    !(assignment && assignment.expiresTick>tick && assignment.locationId!==siteId) &&
    !world.boundaryReliefs.cases.some(item=>item.incomingId===actor.id && (item.status==='travelling'||item.status==='returning')) &&
    (tick!==world.tick||!pilgrimageActedThisTick(world,actor)&&!courierActedThisTick(world,actor));
}

function atOrigin(world:WorldState,actor:Cultivator,originId:string, tick=world.tick) {
  return alive(actor) && danxiaMedicineSite(world)?.id === originId &&
    clinicAccessForFollowup(world,actor,tick)?.site.id === originId && !activeDanxiaMedicineEscort(world,actor);
}

function originalVillage(world:WorldState,settlementId:string) {
  const village = world.settlements.villages.find(item=>item.id===settlementId && item.population>0);
  const site = village && world.locations.find(item=>item.id===village.locationId &&
    (item.type==='market' || item.type==='sect_hq' || item.type==='spirit_vein'));
  return village && site ? {village,site} : undefined;
}

function sameHousehold(world:WorldState,row:Pick<DanxiaMedicineCommitment,'patientId'|'volunteerId'|'householdId'|'settlementId'>) {
  return world.households.members.some(item => item.recruitedId===row.patientId && item.volunteerId===row.volunteerId &&
    item.householdId===row.householdId && item.settlementId===row.settlementId && item.status==='recruited') &&
    world.households.groups.some(group=>group.id===row.householdId &&
      group.presences.some(place=>place.settlementId===row.settlementId));
}

function canReceive(world:WorldState,actor:Cultivator,row:DanxiaMedicineCommitment,tick:number) {
  return row.patientId === actor.id && row.status === 'arrived' && tick > (row.arrivedTick ?? Infinity) &&
    tick < (row.receiveUntilTick ?? -Infinity) && !activeDanxiaMedicineEscort(world,actor) &&
    originalVillage(world,row.settlementId)?.site.id === row.destinationId && sameHousehold(world,row) &&
    presentAtVillageGranary(world,actor,tick)?.id === row.settlementId;
}

function putativePath(world:WorldState,originId:string,destinationId:string) {
  const origin = world.locations.find(site=>site.id===originId);
  const destination = world.locations.find(site=>site.id===destinationId);
  const path = origin && destination ? courierPublicPath(world,origin,destination) : [];
  return path.length>=2 && path.length-1<=DANXIA_MEDICINE_MAX_STEPS ? path : undefined;
}

function scopedNew(world:WorldState,actor:Cultivator,row:DanxiaShortage,tick:number) {
  return row.status==='open' && row.discipleId===actor.id && row.openedTick<=tick && tick<=row.openedTick+1 &&
    !existing(world,row.id) && !isRetiredFromService(actor) && atOrigin(world,actor,row.siteId,tick) &&
    (actor.sectRank==='内门弟子'||actor.sectRank==='真传弟子') &&
    alive(exactActor(world,row.patientId)) && sameHousehold(world,row);
}

export function availableDanxiaMedicineActions(actor:Cultivator,world:WorldState,executionTick=world.tick):DanxiaMedicineOption[] {
  if (!alive(actor) || !world.cultivators.includes(actor) || (executionTick!==world.tick&&executionTick!==world.tick+1)) return [];
  const result:DanxiaMedicineOption[]=[];
  const option={action:'DANXIA_MEDICINE' as const};
  const canPledge=finiteStock(actor.herbs.jade_leaf,2,99);
  for (const row of world.danxiaShortages.cases) {
    if (!scopedNew(world,actor,row,executionTick)) continue;
    const destination = originalVillage(world,row.settlementId)?.site;
    if (!destination) continue;
    const target = { ...option, targetDanxiaShortageId:row.id };
    result.push({...target,danxiaMedicineMove:'observe'});
    if (!canPledge) continue;
    result.push({...target,danxiaMedicineMove:'retain'});
    if (!putativePath(world,row.siteId,destination.id)) continue;
    for (const escort of world.cultivators) {
      if (escort.id===actor.id || escort.id===row.patientId || escort.age<18 ||
          escort.hp/Math.max(1,escort.maxHp)<.75 || !atOrigin(world,escort,row.siteId,executionTick)) continue;
      result.push({...target,danxiaMedicineMove:'offer_ship',targetCultivatorId:escort.id});
    }
  }
  for (const row of world.danxiaMedicine.commitments) {
    if (row.escrow!==DANXIA_MEDICINE_LEAVES) continue;
    const target = { ...option, targetDanxiaMedicineId:row.id };
    if (row.discipleId===actor.id && row.status==='retained' && executionTick>row.startedTick &&
        executionTick<row.offerUntilTick && atOrigin(world,actor,row.originId,executionTick) &&
        canBrewDanxiaCustody(actor,world,executionTick)) result.push({...target,danxiaMedicineMove:'brew'});
    if (row.escortId===actor.id && row.status==='offered' && executionTick>row.startedTick &&
        executionTick<row.offerUntilTick && atOrigin(world,actor,row.originId,executionTick) &&
        actor.hp/Math.max(1,actor.maxHp)>=.75) {
      result.push({...target,danxiaMedicineMove:'decline'});
      if (alive(exactActor(world,row.patientId)) && sameHousehold(world,row) &&
          originalVillage(world,row.settlementId)?.site.id===row.destinationId && putativePath(world,row.originId,row.destinationId)) {
        result.push({...target,danxiaMedicineMove:'accept'});
      }
    }
    if (canReceive(world,actor,row,executionTick)) {
      result.push({...target,danxiaMedicineMove:'decline'});
      if (finiteStock(actor.herbs.jade_leaf,0,97)) result.push({...target,danxiaMedicineMove:'receive'});
    }
    if (row.discipleId===actor.id && row.status==='recoverable' && actor.locationId===row.originId &&
        !activeDanxiaMedicineEscort(world,actor) && finiteStock(actor.herbs.jade_leaf,0,97) &&
        atRecoverySite(world,actor,row.originId,executionTick)) result.push({...target,danxiaMedicineMove:'recover'});
  }
  return result;
}

function note(world:WorldState,row:DanxiaMedicineCommitment,kind:string,title:string,description:string,
  locationId:string|undefined=row.originId):WorldEvent {
  return {id:`evt-${world.tick}-${row.id}-${kind}`,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',actorIds:danxiaMedicineParties(row),title,description,locationId,witnessScope:'participants'};
}
const visible = (row:DanxiaMedicineCommitment) => ({kind:'participants' as const, actorIds:danxiaMedicineParties(row)});

function returnControl(world:WorldState,row:DanxiaMedicineCommitment,reason:NonNullable<DanxiaMedicineCommitment['disposition']>['reason']) {
  row.disposition ??= {tick:world.tick,reason};
  row.status='recoverable';
  return note(world,row,'recoverable','余药待原主取回','原批药叶仍封存，只可由原主实际取回；未转给患者。');
}

function startReturn(world:WorldState,row:DanxiaMedicineCommitment,reason:NonNullable<DanxiaMedicineCommitment['disposition']>['reason']) {
  row.disposition ??= {tick:world.tick,reason};
  row.status='returning';
  row.returnStartedTick=world.tick;
  return note(world,row,'turnback','封药沿原路退回','没有实际签收，原批药叶沿已经走过的路径退回。',row.destinationId);
}

function deliver(world:WorldState,row:DanxiaMedicineCommitment,actor:Cultivator,kind:'received'|'recovered') {
  actor.herbs.jade_leaf+=DANXIA_MEDICINE_LEAVES;
  row.escrow=0;row.status=kind;row.settlement={tick:world.tick,kind,actorId:actor.id};
  recordResourceFlow(world,{kind:'transfer',mechanism:'danxia_medicine',reason:kind==='received'?'danxia_medicine_delivery':'danxia_medicine_refund',
    refId:row.id,good:'jade_leaf',amount:DANXIA_MEDICINE_LEAVES,from:flowDanxiaMedicine(row.id),to:flowActor(actor.id),visibility:visible(row)});
  return note(world,row,kind,kind==='received'?'原定求药人实际签收':'原主实际取回余药',
    '同一批两株翡翠灵叶从封存转入本人药囊；不等同于已服药或复诊。',actor.locationId);
}

function legalOption(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload) {
  const move=payload.danxiaMedicineMove;
  const idKey = move==='observe'||move==='retain'||move==='offer_ship' ? 'targetDanxiaShortageId' : 'targetDanxiaMedicineId';
  const fields=['chosenAction','innerMonologue','spokenLine','danxiaMedicineMove',idKey,...(move==='offer_ship'?['targetCultivatorId']:[])];
  if (payload.chosenAction!=='DANXIA_MEDICINE'||Object.entries(payload).some(([key,value])=>value!==undefined&&!fields.includes(key)&&
    !(key==='action'&&value==='DANXIA_MEDICINE'))) return undefined;
  return availableDanxiaMedicineActions(actor,world).find(action=>action.danxiaMedicineMove===move &&
    ('targetDanxiaShortageId' in action ? action.targetDanxiaShortageId===payload.targetDanxiaShortageId :
      action.targetDanxiaMedicineId===payload.targetDanxiaMedicineId) &&
    (!('targetCultivatorId' in action)||action.targetCultivatorId===payload.targetCultivatorId));
}

export function resolveDanxiaMedicineAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload,rng:()=>number):WorldEvent|null {
  const action=legalOption(world,actor,payload);
  if (!action) return null;
  const move=action.danxiaMedicineMove;
  if(move==='observe'||move==='retain'||move==='offer_ship'){
    const source=world.danxiaShortages.cases.find(row=>row.id===action.targetDanxiaShortageId)!;
    const village=originalVillage(world,source.settlementId)!;
    const funded=move!=='observe';
    const row:DanxiaMedicineCommitment={id:danxiaMedicineId(source.id),shortageId:source.id,sourceCaseId:source.sourceCaseId,
      appointmentId:source.appointmentId,discipleId:source.discipleId,patientId:source.patientId,householdId:source.householdId,
      volunteerId:source.volunteerId,settlementId:source.settlementId,originId:source.siteId,destinationId:village.site.id,
      choice:move,startedTick:world.tick,offerUntilTick:world.tick+DANXIA_MEDICINE_OFFER_TICKS,
      status:move==='offer_ship'?'offered':move==='retain'?'retained':'observed',escrow:funded?2:0,
      ...(move==='offer_ship'?{escortId:action.targetCultivatorId}:{}),
      ...(funded?{reservedTick:world.tick}:{settlement:{tick:world.tick,kind:'observed',actorId:actor.id}})};
    world.danxiaMedicine.commitments.push(row);
    if (funded) {
      actor.herbs.jade_leaf-=DANXIA_MEDICINE_LEAVES;
      recordResourceFlow(world,{kind:'transfer',mechanism:'danxia_medicine',reason:'danxia_medicine_reserve',refId:row.id,
        good:'jade_leaf',amount:DANXIA_MEDICINE_LEAVES,from:flowActor(actor.id),to:flowDanxiaMedicine(row.id),visibility:visible(row)});
    }
    return note(world,row,row.status,funded?'两株实药单独封存':'决定旁观，不拨药',
      move==='offer_ship'?'只封存现有两株药叶，等指定护送人另行同意。':move==='retain'?'药叶仅可用于约定丹炉，尚未消耗或成丹。':'没有拨药，也没有形成护送或施治承诺。');
  }
  const row=world.danxiaMedicine.commitments.find(item=>item.id===action.targetDanxiaMedicineId)!;
  if (move==='receive'||move==='recover') return deliver(world,row,actor,move==='receive'?'received':'recovered');
  if (move==='decline') return row.status==='offered'?returnControl(world,row,'escort_declined'):startReturn(world,row,'recipient_declined');
  if (move==='accept') {
    const route=putativePath(world,row.originId,row.destinationId);
    if (!route) return null;
    row.acceptedTick=world.tick;row.path=route;row.pathIndex=0;row.status='in_transit';
    return note(world,row,'accepted','指定护送人同意运药','护送须走真实路线，签约当月不算出发或交付。');
  }
  if (move==='brew') {
    const result = brewDanxiaCustody(world,actor,row,rng);
    if (!result) return null;
    const kind=result.success?'brewed':'brew_failed';
    row.escrow=0;row.status=kind;
    row.settlement={tick:world.tick,kind,actorId:actor.id,artifactEventId:result.event.id};
    return {...result.event,witnessScope:'participants',actorIds:danxiaMedicineParties(row)};
  }
  return null;
}

function loseCargo(world:WorldState,row:DanxiaMedicineCommitment,reason:'route_lost'|'escort_lost',actorId:string) {
  row.disposition ??= {tick:world.tick,reason};
  row.status='lost';
  row.escrow=0;
  row.settlement={tick:world.tick,kind:'lost',actorId};
  recordResourceFlow(world,{kind:'loss',mechanism:'danxia_medicine',reason:'danxia_medicine_loss',refId:row.id,
    good:'jade_leaf',amount:DANXIA_MEDICINE_LEAVES,from:flowDanxiaMedicine(row.id),visibility:visible(row)});
  return note(world,row,'lost','封药在途中损失','同一批封药已经损失；没有交付，未据此施治。',undefined);
}

function physicalProgress(world:WorldState,row:DanxiaMedicineCommitment,escort:Cultivator):WorldEvent[] {
  const path=row.path,index=row.pathIndex;
  if (!path || index===undefined || (row.acceptedTick??Infinity)>=world.tick ||
      (row.lastMovedTick??-1)>=world.tick) return [];
  const backing = row.status==='returning'||row.status==='lost';
  if (backing&&(row.returnStartedTick??Infinity)>=world.tick) return [];
  row.lastMovedTick=world.tick;
  const events:WorldEvent[]=[];
  if (!backing && row.departedTick === undefined) {
    row.departedTick=world.tick;
    events.push(note(world,row,'departed','护送人携封药实际出发','未签收的原批药叶由指定护送人带上原定路线。'));
  }
  const direction=backing?-1:1;
  const finish=backing?0:path.length-1;
  for (let count=0;count<DANXIA_MEDICINE_STRIDE&&row.pathIndex!==finish;count++) {
    const next=(row.pathIndex ?? index)+direction;
    const point=path[next];
    if (!point) break;
    row.pathIndex=next;
    const tile=terrainTileAt(world,point.x,point.y);
    // Only a retained native severe physical incident on a tile actually entered can destroy the goods.
    const hazard=tile&&row.escrow===DANXIA_MEDICINE_LEAVES&&world.mapHazards.find(item=>item.tileId===tile.id&&
      item.intensity===3&&(item.kind==='meteor'||item.kind==='beast_tide')&&routeWarningHazardValid(world,item,world.tick));
    if (hazard) {
      row.hazard={...hazard};
      row.returnStartedTick ??= world.tick;
      return [...events,loseCargo(world,row,'route_lost',escort.id)];
    }
  }
  if (row.pathIndex!==finish) return events;
  if (backing) {
    row.returnedTick=world.tick;
    const origin=world.locations.find(site=>site.id===row.originId);
    if (origin) escort.locationId=origin.id;
    if (row.status==='lost') return [note(world,row,'escort_returned','护送人实际折返','原批封药并未随人返还。')];
    return [returnControl(world,row,row.disposition?.reason??'recipient_missed')];
  }
  row.arrivedTick=world.tick;
  row.receiveUntilTick=world.tick+DANXIA_MEDICINE_ACK_TICKS;
  row.status='arrived';
  escort.locationId=row.destinationId;
  return [...events,note(world,row,'arrived','封药实到原村','到达不等于签收；期限内须原定本人到场认可。',row.destinationId)];
}

export function advanceDanxiaMedicine(world:WorldState):WorldEvent[] {
  const events:WorldEvent[]=[];
  for (const row of world.danxiaMedicine.commitments) {
    if (row.status==='retained'||row.status==='offered') {
      const origin=danxiaMedicineSite(world)?.id===row.originId;
      const keeper=exactActor(world,row.discipleId);
      if (!origin || !alive(keeper)) events.push(returnControl(world,row,!origin?'title_lost':'disciple_lost'));
      else if (world.tick>=row.offerUntilTick) events.push(returnControl(world,row,'offer_expired'));
      continue;
    }
    if (row.status!=='in_transit'&&row.status!=='returning'&&row.status!=='arrived'&&row.status!=='lost') continue;
    const escort=row.escortId?exactActor(world,row.escortId):undefined;
    if (!alive(escort)) {
      if (row.escrow!==DANXIA_MEDICINE_LEAVES) continue;
      if (row.status==='in_transit'&&row.departedTick===undefined) events.push(returnControl(world,row,'escort_lost'));
      else events.push(loseCargo(world,row,'escort_lost',row.escortId??row.discipleId));
      continue;
    }
    if (row.status==='lost'&&(row.returnStartedTick===undefined||row.returnedTick!==undefined)) continue;
    const validVillage=originalVillage(world,row.settlementId)?.site.id===row.destinationId;
    const patient=exactActor(world,row.patientId);
    if ((row.status==='in_transit'||row.status==='arrived')&&(!validVillage||!alive(patient)||!sameHousehold(world,row))) {
      if (row.pathIndex===0&&row.departedTick===undefined) events.push(returnControl(world,row,'recipient_missed'));
      else events.push(startReturn(world,row,'recipient_missed'));
      continue;
    }
    if (row.status==='arrived') {
      if (world.tick>=(row.receiveUntilTick??Infinity)) events.push(startReturn(world,row,'recipient_missed'));
      continue;
    }
    events.push(...physicalProgress(world,row,escort));
  }
  return events;
}

export interface DanxiaMedicineView {
  id:string; shortageId:string; choice:DanxiaMedicineCommitment['choice']; status:DanxiaMedicineCommitment['status'];
  role:'disciple'|'patient'|'escort'; startedTick:number; reservedTick?:number; acceptedTick?:number; departedTick?:number;
  arrivedTick?:number; receiveUntilTick?:number; returnStartedTick?:number; returnedTick?:number;
  disposition?:DanxiaMedicineCommitment['disposition']; settledTick?:number;
}
export function projectDanxiaMedicine(world:WorldState,viewer?:Cultivator):DanxiaMedicineView[] {
  if (!viewer || !world.cultivators.includes(viewer)) return [];
  return world.danxiaMedicine.commitments.flatMap((row):DanxiaMedicineView[] => {
    const role=viewer.id===row.discipleId?'disciple':viewer.id===row.patientId?'patient':viewer.id===row.escortId?'escort':undefined;
    if (!role) return [];
    return [{id:row.id,shortageId:row.shortageId,role,choice:row.choice,status:row.status,startedTick:row.startedTick,
      ...(row.reservedTick!==undefined?{reservedTick:row.reservedTick}:{}),...(row.acceptedTick!==undefined?{acceptedTick:row.acceptedTick}:{}),
      ...(row.departedTick!==undefined?{departedTick:row.departedTick}:{}),...(row.arrivedTick!==undefined?{arrivedTick:row.arrivedTick}:{}),
      ...(row.receiveUntilTick!==undefined?{receiveUntilTick:row.receiveUntilTick}:{}),
      ...(row.returnStartedTick!==undefined?{returnStartedTick:row.returnStartedTick}:{}),...(row.returnedTick!==undefined?{returnedTick:row.returnedTick}:{}),
      ...(row.disposition?{disposition:{...row.disposition}}:{}),...(row.settlement?{settledTick:row.settlement.tick}:{})}];
  });
}
