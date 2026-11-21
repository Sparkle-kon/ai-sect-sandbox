import type {AuthoredEraOrigin, Cultivator, WorldState} from '../types/world';
import type {TimelineBranch,TimelineSnapshot,WorldTimeline} from './timelineEngine';
import {applyAuthoredEraDesign} from './authoredEraEngine';
import {authoredEraId,isAuthoredEraProof} from './authoredEraProof';
import {isChronicleStoryFact,publicChronicleSceneEvents} from './chronicleLead';
import {publicChronicleChapters} from './coldHistoryEngine';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {encodeEraDesignDraft} from './eraDesignSchema';
import {householdCensus} from './householdEngine';
import {projectFieldObservatory} from './fieldObservatoryEngine';
import {visibleCouriers} from './sealedCourierEngine';
import {projectDanxiaMedicine} from './danxiaMedicineEngine';
import {encodeEraWorldSave} from './storageEngine';
import {currentVisibleTileIds,terrainTileAt} from './terrainEngine';
import {villageEvolutionLocalSettlement} from './villageEvolutionEngine';
import {sameGeneratedWorld} from './worldIdentity';

export interface EraCounterpointDate {readonly tick:number;readonly year:number;readonly month:number}
export interface EraCounterpointProof {
  readonly naturalBranchId:string;readonly authoredBranchId:string;
  readonly naturalSourceBranchId:string;readonly opening:EraCounterpointDate;
}
type VerificationFailure='same_branch'|'missing_branch'|'not_native'|'not_authored'|'opening_unretained'|
  'baseline_mismatch'|'invalid_origin'|'integrity_unavailable'|'aborted';
export type EraCounterpointVerification={ok:true;proof:EraCounterpointProof}|{ok:false;reason:VerificationFailure};
export interface EraCounterpointScope {naturalViewerId?:string;authoredViewerId?:string;settlementId?:string}
export interface EraCounterpointEvidence {kind:'native_snapshot'|'authored_opening'|'played_snapshot';tick:number}
export interface EraCounterpointObligation {
  kind:'observatory'|'courier'|'oath'|'medicine';openedTick:number;dueTick?:number;status:string;
}
export interface EraCounterpointSide {
  branchId:string;label:string;source:'native'|'authored';asOf:EraCounterpointDate;firstRetained:EraCounterpointDate;
  earliestPublicFact?:EraCounterpointDate;
  north?:{siteId:string;name:string;qi:number;ownership:{kind:'unowned'}|{kind:'owned';sectName:string};evidence:EraCounterpointEvidence;
    ownershipEvidence:EraCounterpointEvidence;qiEvidence:EraCounterpointEvidence};
  village?:{settlementId:string;name:string;population:number;capacity:number;householdGroups:number;
    registeredResidents:number;evidence:EraCounterpointEvidence;
    populationEvidence:EraCounterpointEvidence;capacityEvidence:EraCounterpointEvidence};
  obligations:readonly EraCounterpointObligation[];
}
export type EraCounterpointResult=
  |{ok:true;opening:EraCounterpointDate;natural:EraCounterpointSide;authored:EraCounterpointSide}
  |{ok:false;reason:'stale_proof'|'invalid_tick'|'unaligned_frame'};

const anchors=new WeakMap<EraCounterpointProof,{
  native:TimelineSnapshot;authorReference:TimelineSnapshot;origin:AuthoredEraOrigin;effectProof:string;
}>();
const northId='loc-vein-north';
const encoder=new TextEncoder();
const sameDate=(a:EraCounterpointDate,b:EraCounterpointDate)=>a.tick===b.tick&&a.year===b.year&&a.month===b.month;
const asDate=({tick,year,month}:EraCounterpointDate):EraCounterpointDate=>({tick,year,month});
const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const stable=(input:unknown):string=>{
  if(Array.isArray(input))return `[${input.map(stable).join(',')}]`;
  if(input!==null&&typeof input==='object'){
    const record=input as Record<string,unknown>;
    return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(input)??'undefined';
};
async function sha(text:string):Promise<string>{
  const digest=await globalThis.crypto.subtle.digest('SHA-256',encoder.encode(text));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
const branch=(timeline:WorldTimeline,id:string)=>{
  const rows=timeline.branches.filter(row=>row.id===id);
  return rows.length===1?rows[0]:undefined;
};
function exact(branch:TimelineBranch,tick:number):TimelineSnapshot|undefined{
  const found=branch.snapshots.filter(row=>row.tick===tick);
  const only=found[0];
  // The token is tied to immutable timeline storage, not to an editable world clone.
  return found.length===1&&only.world.tick===tick&&Object.isFrozen(only)&&Object.isFrozen(only.world)?only:undefined;
}
const head=(branch:TimelineBranch)=>{const last=branch.snapshots.at(-1);return last&&exact(branch,last.tick);};
const native=(world:WorldState)=>!world.authoredEraOrigin&&!world.scenarioOrigin&&!world.scenarioAudit;
const adjustedMonth=({year,month,tick}:EraCounterpointDate,at:number)=>{
  const months=month-1+(at-tick);
  const result=year+Math.floor(months/12);
  return {tick:at,year:result,month:((months%12)+12)%12+1};
};
function nativeSources(timeline:WorldTimeline,selection:TimelineBranch,tick:number):TimelineBranch[]{
  const result:TimelineBranch[]=[],seen=new Set<string>();
  let current:TimelineBranch|undefined=selection;
  const start=head(selection)?.world;
  while(current){
    const world=head(current)?.world;
    if(seen.has(current.id)||!world||!start||!native(world)||!sameGeneratedWorld(start,world))return [];
    seen.add(current.id);
    result.push(current);
    if(!current.parentBranchId){if(current.forkTick!==undefined)return [];break;}
    const forkTick=current.forkTick;
    if(forkTick===undefined||!integer(forkTick)||forkTick>world.tick)return [];
    if(forkTick<tick)break;
    current=branch(timeline,current.parentBranchId);
    if(!current)return [];
  }
  return result;
}

/** Cheap date candidates only. They carry no claim about matching origins or confidential facts. */
export function listEraCounterpointCandidateTicks(timeline:WorldTimeline,naturalBranchId:string,authoredBranchId:string):number[]{
  if(naturalBranchId===authoredBranchId)return [];
  const a=branch(timeline,naturalBranchId),b=branch(timeline,authoredBranchId);
  const aHead=a&&head(a),bHead=b&&head(b),origin=bHead?.world.authoredEraOrigin;
  if(!a||!b||!aHead||!native(aHead.world)||!bHead||!origin)return [];
  const opening={tick:origin.openedTick,year:origin.year,month:origin.month};
  return a.snapshots.flatMap(row=>{
    if(row.tick<opening.tick||exact(a,row.tick)!==row)return [];
    const other=exact(b,row.tick);
    return other&&sameDate(row.world,other.world)&&sameDate(row.world,adjustedMonth(opening,row.tick))?[row.tick]:[];
  }).sort((x,y)=>x-y);
}

/** Bind both declarations to an independently retained, byte-exact native frame.
 * A digest is an equality proof here; imported self-declaration cannot create authorship. */
export async function verifyEraCounterpoint(timeline:WorldTimeline,naturalBranchId:string,authoredBranchId:string,
  signal?:AbortSignal):Promise<EraCounterpointVerification>{
  const failed=(reason:VerificationFailure):EraCounterpointVerification=>({ok:false,reason});
  if(signal?.aborted)return failed('aborted');
  if(naturalBranchId===authoredBranchId)return failed('same_branch');
  const a=branch(timeline,naturalBranchId),b=branch(timeline,authoredBranchId);
  const aHead=a&&head(a),bHead=b&&head(b);
  if(!a||!b||!aHead||!bHead)return failed('missing_branch');
  if(!native(aHead.world))return failed('not_native');
  const origin=bHead.world.authoredEraOrigin;
  if(!origin)return failed('not_authored');
  if(!isAuthoredEraProof(origin)||authoredEraId(origin)!==origin.id)return failed('invalid_origin');
  const opening=Object.freeze({tick:origin.openedTick,year:origin.year,month:origin.month});
  if(!integer(opening.tick)||opening.tick<2||!integer(opening.year)||!integer(opening.month)||opening.month<1||opening.month>12||
    !sameDate(bHead.world,adjustedMonth(opening,bHead.tick))||bHead.tick<opening.tick)return failed('invalid_origin');
  const retained=nativeSources(timeline,a,opening.tick).flatMap(row=>{
    const point=exact(row,opening.tick);
    return point?[{branchId:row.id,point}]:[];
  });
  if(!retained.length)return failed('opening_unretained');
  if(!globalThis.crypto?.subtle)return failed('integrity_unavailable');
  let draftText:string;
  try{draftText=encodeEraDesignDraft(origin.draft);}catch{return failed('invalid_origin');}
  let designHash:string;
  try{designHash=await sha(draftText);}catch{return failed(signal?.aborted?'aborted':'integrity_unavailable');}
  if(signal?.aborted)return failed('aborted');
  if(designHash!==origin.designDigest)return failed('invalid_origin');
  for(const {branchId,point} of retained){
    const baseline=point.world;
    if(!sameDate(opening,baseline)||!native(baseline)||!sameGeneratedWorld(aHead.world,baseline)||
      baseline.random.seed!==origin.draft.seed||baseline.worldgen?.profileId!==origin.draft.profileId)continue;
    let bytes:string;
    try{bytes=encodeEraWorldSave(baseline);}catch{continue;}
    let digest:string;
    try{digest=await sha(bytes);}catch{return failed(signal?.aborted?'aborted':'integrity_unavailable');}
    if(signal?.aborted)return failed('aborted');
    if(digest!==origin.baselineDigest)continue;
    // Verify immutable typed overlay receipts without replaying or filling in missing history.
    try{
      const expected=applyAuthoredEraDesign(origin.draft,baseline,origin).authoredEraOrigin;
      if(!expected||stable(expected.effects)!==stable(origin.effects))return failed('invalid_origin');
    }catch{return failed('invalid_origin');}
    const proof=Object.freeze({naturalBranchId,authoredBranchId,naturalSourceBranchId:branchId,opening});
    anchors.set(proof,{native:point,authorReference:bHead,origin,effectProof:stable(origin.effects)});
    return {ok:true,proof};
  }
  return failed('baseline_mismatch');
}
function bound(timeline:WorldTimeline,proof:EraCounterpointProof){
  const trusted=anchors.get(proof);
  if(!trusted)return undefined;
  const a=branch(timeline,proof.naturalBranchId),b=branch(timeline,proof.authoredBranchId);
  const aHead=a&&head(a),bHead=b&&head(b);
  if(!a||!b||!aHead||!bHead||!native(aHead.world)||!sameGeneratedWorld(aHead.world,trusted.native.world)||
    !sameGeneratedWorld(bHead.world,trusted.authorReference.world)||!bHead.world.authoredEraOrigin||
    stable(bHead.world.authoredEraOrigin.effects)!==trusted.effectProof||
    !nativeSources(timeline,a,proof.opening.tick).some(row=>row.id===proof.naturalSourceBranchId&&
      exact(row,proof.opening.tick)===trusted.native))return undefined;
  return {a,b,trusted};
}
function aligned(sides:NonNullable<ReturnType<typeof bound>>,proof:EraCounterpointProof,tick:number){
  const a=exact(sides.a,tick),b=exact(sides.b,tick);
  if(!a||!b||tick<proof.opening.tick||!sameDate(a.world,b.world)||!sameDate(a.world,adjustedMonth(proof.opening,tick))||
    !native(a.world)||!sameGeneratedWorld(sides.trusted.native.world,a.world)||
    !sameGeneratedWorld(sides.trusted.authorReference.world,b.world)||!b.world.authoredEraOrigin||
    stable(b.world.authoredEraOrigin.effects)!==sides.trusted.effectProof)return undefined;
  return {a,b};
}
export function listEraCounterpointTicks(timeline:WorldTimeline,proof:EraCounterpointProof):number[]{
  const pair=bound(timeline,proof);
  return pair?listEraCounterpointCandidateTicks(timeline,proof.naturalBranchId,proof.authoredBranchId)
    .filter(tick=>!!aligned(pair,proof,tick)):[];
}

function firstPublicFact(world:WorldState):EraCounterpointDate|undefined{
  const events=publicChronicleSceneEvents(world);
  const allLiveIds=new Set(world.events.map(row=>row.id));
  const dates=[...events,...publicChronicleChapters(world).flatMap(row=>row.anchors)]
    .filter(row=>isChronicleStoryFact(row,world.tick)&&(!allLiveIds.has(row.id)||events.some(event=>event.id===row.id&&
      event.tick===row.tick&&event.year===row.year&&event.month===row.month)))
    .filter(row=>sameDate(row,adjustedMonth(world,row.tick))).sort((a,b)=>a.tick-b.tick);
  return dates[0]?asDate(dates[0]):undefined;
}
function outstanding(world:WorldState,viewer:Cultivator|undefined):EraCounterpointObligation[]{
  if(!viewer)return [];
  // Strip payloads, IDs, names and route metadata; never borrow the other branch's visibility.
  const rows:EraCounterpointObligation[]=[];
  for(const run of projectFieldObservatory(world,viewer).runs){
    if(run.status==='pending'&&run.openedTick<=world.tick&&run.targetTick>=world.tick)
      rows.push({kind:'observatory',status:'pending',openedTick:run.openedTick,dueTick:run.targetTick});
  }
  for(const courier of visibleCouriers(world,viewer)){
    if((courier.status==='in_transit'||courier.status==='returning')&&courier.acceptedTick!==undefined&&courier.acceptedTick<=world.tick)
      rows.push({kind:'courier',status:courier.status,openedTick:courier.openedTick,
        ...(courier.deadlineTick!==undefined?{dueTick:courier.deadlineTick}:{})});
  }
  for(const oath of world.oaths.contracts){
    if(oath.status==='active'&&(oath.requesterId===viewer.id||oath.providerId===viewer.id)&&oath.offeredTick<=world.tick&&
      oath.deadlineTick!==undefined&&oath.deadlineTick>world.tick&&(oath.escrow.payment>0||oath.escrow.collateral>0))
      rows.push({kind:'oath',status:'active',openedTick:oath.offeredTick,dueTick:oath.deadlineTick});
  }
  for(const medicine of projectDanxiaMedicine(world,viewer)){
    if(medicine.startedTick<=world.tick&&medicine.settledTick===undefined&&
      (medicine.status==='retained'||medicine.status==='offered'||medicine.status==='in_transit'||medicine.status==='arrived'||
        medicine.status==='returning'||medicine.status==='recoverable'))
      rows.push({kind:'medicine',status:medicine.status,openedTick:medicine.startedTick,
        ...(medicine.receiveUntilTick!==undefined?{dueTick:medicine.receiveUntilTick}:{})});
  }
  return rows.sort((a,b)=>b.openedTick-a.openedTick||a.kind.localeCompare(b.kind)).slice(0,12);
}
function side(branch:TimelineBranch,frame:TimelineSnapshot,source:EraCounterpointSide['source'],origin:AuthoredEraOrigin,
  viewerId?:string,settlementId?:string):EraCounterpointSide{
  const world=frame.world,viewer=viewerId&&world.cultivators.find(actor=>actor.id===viewerId&&actor.alive&&actor.hp>0)||undefined;
  const earliest=branch.snapshots.find(row=>row.tick<=frame.tick&&exact(branch,row.tick)===row&&sameGeneratedWorld(frame.world,row.world))??frame;
  const earliestPublicFact=firstPublicFact(world);
  const evidence=(changed:boolean):EraCounterpointEvidence=>({kind:source==='native'?'native_snapshot':
    world.tick===origin.openedTick&&world.interventionSequence===0?
      (changed?'authored_opening':'native_snapshot'):'played_snapshot',tick:world.tick});
  let north:EraCounterpointSide['north'],village:EraCounterpointSide['village'];
  if(viewer){
    const seat=world.locations.find(row=>row.id===northId),tile=seat&&terrainTileAt(world,seat.x,seat.y);
    if(seat&&tile&&doctrineFoundingPhysicallyAt(world,viewer,viewer.locationId,world.tick)&&currentVisibleTileIds(world,viewer).has(tile.id)){
      const owner=seat.ownerSectId&&world.sects.find(sect=>sect.id===seat.ownerSectId);
      const changedQi=origin.effects.some(row=>row.kind==='jade_vein_depleted'&&row.siteId===seat.id);
      const changedTitle=origin.effects.some(row=>row.kind==='danxia_branch_moves_north'&&row.destinationId===seat.id);
      if(!seat.ownerSectId||owner)north={siteId:seat.id,name:seat.name,qi:seat.spiritQi,ownership:owner?
        {kind:'owned',sectName:owner.name}:{kind:'unowned'},evidence:evidence(changedQi||changedTitle),
        qiEvidence:evidence(changedQi),ownershipEvidence:evidence(changedTitle)};
    }
    const local=villageEvolutionLocalSettlement(world,viewer);
    if(local&&(!settlementId||local.id===settlementId)){
      const census=householdCensus(world,local.id);
      const changedCapacity=origin.effects.some(row=>row.kind==='village_capacity'&&row.settlementId===local.id);
      if(census)village={settlementId:local.id,name:local.name,population:local.population,capacity:local.capacity,
        householdGroups:census.groups.length,registeredResidents:census.namedResidents,evidence:evidence(changedCapacity),
        populationEvidence:evidence(false),capacityEvidence:evidence(changedCapacity)};
    }
  }
  return {branchId:branch.id,label:branch.label,source,asOf:asDate(world),firstRetained:asDate(earliest.world),
    ...(earliestPublicFact?{earliestPublicFact}:{}),...(north?{north}:{}),...(village?{village}:{}),
    obligations:outstanding(world,viewer)};
}

/** Exact frames only; aged-out origins and lookalike tokens cannot authorize any projection. */
export function projectEraCounterpoint(timeline:WorldTimeline,proof:EraCounterpointProof,tick:number,scope:EraCounterpointScope={}):EraCounterpointResult{
  if(!integer(tick))return {ok:false,reason:'invalid_tick'};
  const pair=bound(timeline,proof);
  if(!pair)return {ok:false,reason:'stale_proof'};
  const frames=aligned(pair,proof,tick);
  if(!frames)return {ok:false,reason:'unaligned_frame'};
  const {origin}=pair.trusted;
  return {ok:true,opening:proof.opening,natural:side(pair.a,frames.a,'native',origin,scope.naturalViewerId,scope.settlementId),
    authored:side(pair.b,frames.b,'authored',origin,scope.authoredViewerId,scope.settlementId)};
}
