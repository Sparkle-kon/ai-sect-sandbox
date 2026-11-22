import type {Artifact,ResourceFlowAccount,WorldState} from '../types/world';
import {CRAFT_TRAINING_OFFER_TICKS as offerTurns,CRAFT_TRAINING_WORK_TICKS as workTurns,craftTrainingArtifactId,
  craftTrainingBlankId,craftTrainingEventId,craftTrainingId,type CraftTrainingPhase} from '../types/craftTraining';
import {craftTrainingCosts,craftTrainingGradeScore} from './craftTrainingEngine';
import {FURNACE_USE_RETENTION_TICKS} from './furnaceReservationEngine';
import {RESOURCE_FLOW_MONTH_LIMIT} from './resourceFlowEngine';
import {workshopGradeForScore} from './workshopEngine';
import {activeRelocationForSect} from './relocationEngine';

type Fail=(field:string)=>never;
type Project=NonNullable<WorldState['craftTraining']>['projects'][number];
type EventProof={tick:number;siteId:string;actors:readonly string[]};
type Bill={tick:number;amount:number;from:ResourceFlowAccount;to?:ResourceFlowAccount;actors:readonly string[]};
type Good='stone'|'earth_root';
const eventPattern=/^evt-craft-training-[1-9][0-9]*-[1-9][0-9]*-(?:offer|join-first|join-second|blank|finish|declined|withdrawn|expired|unavailable)$/u;
const artifactPattern=/^craft-training-artifact-craft-training-[1-9][0-9]*$/u;
const actor=(id:string):ResourceFlowAccount=>({kind:'actor',id});
const escrow=(id:string):ResourceFlowAccount=>({kind:'craft_training',id});
const accounts=(a:ResourceFlowAccount,b:ResourceFlowAccount)=>a.kind===b.kind&&a.id===b.id;
const eq=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const journalKey=(projectId:string,tick:number,reason:string,good:string)=>JSON.stringify([projectId,tick,reason,good]);

/** Independent timing, custody and retained physical furnace receipts; a later game move may change any artifact's current holder. */
export function validateCraftTraining(world:WorldState,fail:Fail):void{
  const state=world.craftTraining;
  const projects=state?.projects??[];
  const people=new Map((state?world.cultivators:[]).map(actor=>[actor.id,actor]));
  const sites=new Map((state?world.locations:[]).map(site=>[site.id,site]));
  const sects=new Map((state?world.sects:[]).map(sect=>[sect.id,sect]));
  const usesByActorTurn=new Map((state?world.furnaceReservations.uses:[]).map(row=>[JSON.stringify([row.actorId,row.tick]),row]));
  const {stones:fundingStones,roots:fundingRoots,blankStones,finishStones}=craftTrainingCosts();
  const live=(id:string)=>{const actor=people.get(id);return !!actor?.alive&&actor.hp>0;};
  const projectsById=new Map<string,Project>(),eventRows=new Map<string,EventProof>(),bills=new Map<string,Bill>();
  const artifactReceipts=new Map<string,Project>();
  const actorMoves=new Set<string>(),stageActorSlots=new Set<string>(),stageSiteSlots=new Set<string>();
  const inUse=new Map<string,number>(),bookedSite=new Map<string,number>();
  const clock=(tick:number)=>tick>=1&&tick<=world.tick;
  const actions=(id:string,tick:number)=>{
    const key=JSON.stringify([id,tick]);
    if(actorMoves.has(key))return fail('craftTraining.actorTurn');
    actorMoves.add(key);
  };
  const audience=(row:Project)=>[row.keeperId,...row.traineeIds];
  const event=(row:Project,tick:number,phase:CraftTrainingPhase,actors:readonly string[]=audience(row))=>
    eventRows.set(craftTrainingEventId(row.id,tick,phase),{tick,siteId:row.siteId,actors});
  const addBill=(row:Project,tick:number,phase:string,good:Good,amount:number,from:ResourceFlowAccount,to?:ResourceFlowAccount)=>{
    if(amount)bills.set(journalKey(row.id,tick,phase,good),{tick,amount,from,to,actors:audience(row)});
  };
  function forge(row:Project,stage:{actorId:string;tick:number;slot:number}){
    const actorStamp=JSON.stringify([stage.actorId,stage.tick]),siteStamp=JSON.stringify([row.siteId,stage.tick,stage.slot]);
    if(stageActorSlots.has(actorStamp)||stageSiteSlots.has(siteStamp))return fail('craftTraining.furnace');
    const use=usesByActorTurn.get(actorStamp);
    if(stage.tick>world.tick-FURNACE_USE_RETENTION_TICKS&&(!use||use.siteId!==row.siteId||
      use.slot!==stage.slot||use.kind!=='forge'||use.workshopOrderId!==undefined))
      return fail('craftTraining.furnace');
    stageActorSlots.add(actorStamp);stageSiteSlots.add(siteStamp);
    actions(stage.actorId,stage.tick);
  }
  if(state&&(!projects.length||projects.length>100_000||state.nextId!==projects.length+1))return fail('craftTraining.retention');
  let serial=0,priorOffer=0;
  for(const row of projects){
    const {keeperId,traineeIds,siteId,sectId,offeredTick,offerExpiresTick,status,firstJoinedTick,secondJoinedTick,
      fundedTick,workExpiresTick,closedTick,closedById,unavailableReason,blank,finish}=row;
    const [first,second]=traineeIds;
    if(row.id!==craftTrainingId(++serial)||new Set([keeperId,first,second]).size!==3||
      traineeIds.length!==2||!people.has(keeperId)||!people.has(first)||!people.has(second)||
      !sects.has(sectId)||!clock(offeredTick)||offeredTick<priorOffer||offerExpiresTick!==offeredTick+offerTurns)
      return fail('craftTraining.references');
    projectsById.set(row.id,row);priorOffer=offeredTick;

    // Register only true non-overlapping local participation; touching same closure month is allowed.
    for(const person of audience(row)){
      if((inUse.get(person)??0)>offeredTick)return fail('craftTraining.concurrent');
      inUse.set(person,closedTick??Infinity);
    }
    if((bookedSite.get(siteId)??0)>offeredTick)return fail('craftTraining.concurrent');
    bookedSite.set(siteId,closedTick??Infinity);
    actions(keeperId,offeredTick);event(row,offeredTick,'offer');
    for(const [index,joinedTick] of [firstJoinedTick,secondJoinedTick].entries()){
      if(joinedTick===undefined)continue;
      if(!clock(joinedTick)||joinedTick<=offeredTick||joinedTick>=offerExpiresTick||
        closedTick!==undefined&&joinedTick>closedTick)return fail('craftTraining.signatures');
      actions(traineeIds[index],joinedTick);event(row,joinedTick,index===0?'join-first':'join-second');
    }
    const signed=firstJoinedTick!==undefined&&secondJoinedTick!==undefined;
    if(signed!==(fundedTick!==undefined)||(fundedTick===undefined?workExpiresTick!==undefined:
      fundedTick!==Math.max(firstJoinedTick!,secondJoinedTick!)||workExpiresTick!==fundedTick+workTurns))
      return fail('craftTraining.funding');
    const open=status==='offered'||status==='funded'||status==='blank';
    const deadline=workExpiresTick??offerExpiresTick;
    if(open!==(closedTick===undefined)||open&&world.tick>=deadline||
      closedTick!==undefined&&(!clock(closedTick)||closedTick<Math.max(offeredTick,firstJoinedTick??0,secondJoinedTick??0,blank?.tick??0,finish?.tick??0)||
        (status==='expired'?closedTick!==deadline:closedTick>=deadline)))
      return fail('craftTraining.closure');
    if(status==='offered'&&(signed||blank||finish)||status==='funded'&&(!signed||blank||finish)||
      status==='blank'&&(!signed||!blank||finish)||(status==='completed'||status==='failed')!==!!finish)
      return fail('craftTraining.phase');

    if(status==='declined'||status==='withdrawn'){
      if(closedTick===undefined||closedTick<=offeredTick||!closedById||
        (status==='declined'?!traineeIds.includes(closedById):closedById!==keeperId))
        return fail('craftTraining.reply');
      actions(closedById,closedTick);
    }else if(closedById!==undefined)return fail('craftTraining.reply');
    if((status==='unavailable')!==(unavailableReason!==undefined))return fail('craftTraining.unavailable');
    if(open||closedTick===world.tick&&status==='unavailable'){
      const sect=sects.get(sectId),site=sites.get(siteId);
      const actualSite=site?.type==='sect_hq'&&site.ownerSectId===sectId&&site.furnaceGrade>=1&&
        sect?.headquartersId===siteId&&!activeRelocationForSect(world,sectId);
      const loss=!actualSite?'site':sect?.leaderId!==keeperId||!live(keeperId)||people.get(keeperId)?.sectId!==sectId?'keeper':
        traineeIds.some(id=>!live(id))?'trainee':undefined;
      if(open?loss!==undefined:unavailableReason!==loss)return fail('craftTraining.authority');
    }
    if(closedTick!==undefined&&(status==='declined'||status==='withdrawn'||status==='expired'||status==='unavailable'))
      event(row,closedTick,status);

    const fundedStones=signed?fundingStones:0,fundedRoots=signed?fundingRoots:0;
    const remainingStones=fundedStones-(blank?blankStones:0)-(finish?finishStones:0);
    const remainingRoots=fundedRoots-Number(!!blank)-Number(!!finish);
    if(remainingStones<0||remainingRoots<0||row.escrowStones!==(open?remainingStones:0)||
      row.escrowRoots!==(open?remainingRoots:0)||row.refundedStones!==(open?0:remainingStones)||
      row.refundedRoots!==(open?0:remainingRoots))return fail('craftTraining.custody');
    const common=escrow(row.id),payer=actor(keeperId);
    if(fundedTick!==undefined){
      addBill(row,fundedTick,'craft_training_deposit','stone',fundingStones,payer,common);
      addBill(row,fundedTick,'craft_training_deposit','earth_root',fundingRoots,payer,common);
    }
    if(blank){
      const blankId=craftTrainingBlankId(row.id);
      if(blank.id!==blankId||!clock(blank.tick)||blank.tick<=(fundedTick??Infinity)||blank.tick>=deadline||
        blank.actorId!==first||blank.stonesUsed!==blankStones||blank.rootsUsed!==1||
        blank.masteryAfter!==Math.min(100,blank.masteryBefore+1))return fail('craftTraining.blank');
      forge(row,blank);
      event(row,blank.tick,'blank',[first]);
      addBill(row,blank.tick,'craft_training_fuel','stone',blankStones,common);
      addBill(row,blank.tick,'craft_training_material','earth_root',1,common);
    }
    if(finish){
      const quality=craftTrainingGradeScore(finish.masteryBefore,finish.furnaceGrade,finish.rootMatched,finish.strained);
      const grade=workshopGradeForScore(quality),passed=grade!=='failed';
      if(!blank||finish.blankId!==blank.id||!clock(finish.tick)||finish.tick<=blank.tick||finish.tick>=deadline||
        finish.tick!==closedTick||finish.actorId!==second||finish.stonesUsed!==finishStones||finish.rootsUsed!==1||
        finish.slot>finish.furnaceGrade||finish.qualityScore!==quality||finish.grade!==grade||
        finish.masteryAfter!==(passed?Math.min(100,finish.masteryBefore+1):finish.masteryBefore)||
        row.status!==(passed?'completed':'failed')||
        finish.artifactId!==(passed?craftTrainingArtifactId(row.id):undefined))
        return fail('craftTraining.finish');
      forge(row,finish);
      event(row,finish.tick,'finish',[second]);
      addBill(row,finish.tick,'craft_training_fuel','stone',finishStones,common);
      addBill(row,finish.tick,'craft_training_material','earth_root',1,common);
      if(finish.artifactId)artifactReceipts.set(finish.artifactId,row);
    }
    if(closedTick!==undefined){
      addBill(row,closedTick,'craft_training_refund','stone',row.refundedStones,common,payer);
      addBill(row,closedTick,'craft_training_refund','earth_root',row.refundedRoots,common,payer);
    }
  }

  const seenEvents=new Set<string>();
  for(const news of world.events){
    if(!eventPattern.test(news.id))continue;
    const expected=eventRows.get(news.id);
    if(!expected||seenEvents.has(news.id)||news.tick!==expected.tick||news.locationId!==expected.siteId||
      news.category!=='diplomacy'||news.witnessScope!=='participants'||!eq(news.actorIds,expected.actors))
      return fail('craftTraining.event');
    seenEvents.add(news.id);
  }
  const exposed=(anchors:readonly {id:string}[])=>anchors.some(anchor=>eventPattern.test(anchor.id));
  if(exposed(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(chapter=>exposed(chapter.anchors))||
    world.coldHistory.chapters.some(chapter=>exposed(chapter.anchors)))return fail('craftTraining.archive');

  const seenBills=new Set<string>(),monthComplete=new Map<number,boolean>();
  for(const month of world.resourceFlow.months){
    monthComplete.set(month.tick,month.totalEntries===month.entries.length);
    for(const entry of month.entries){
      const uses=('from'in entry&&entry.from.kind==='craft_training')||('to'in entry&&entry.to.kind==='craft_training');
      if(!uses&&!entry.reason.startsWith('craft_training_')&&!projectsById.has(entry.refId))continue;
      const key=journalKey(entry.refId,entry.tick,entry.reason,entry.good),expected=bills.get(key);
      if(!expected||seenBills.has(key)||entry.mechanism!=='workshop'||entry.amount!==expected.amount||
        entry.visibility.kind!=='participants'||!eq(entry.visibility.actorIds,expected.actors)||
        (expected.to?(entry.kind!=='transfer'||!accounts(entry.from,expected.from)||!accounts(entry.to,expected.to)):
          entry.kind!=='consumption'||!accounts(entry.from,expected.from)))return fail('craftTraining.resourceJournal');
      seenBills.add(key);
    }
  }
  for(const [key,row] of bills){
    if(!seenBills.has(key)&&row.tick>world.tick-RESOURCE_FLOW_MONTH_LIMIT&&monthComplete.get(row.tick)!==false)
      return fail('craftTraining.resourceJournal');
  }

  const found=new Set<string>();
  const checkArtifact=(item:Artifact)=>{
    const origin=item.craftTrainingOrigin;
    if(!origin&&!(item.id&&artifactPattern.test(item.id)))return;
    const proof=item.id&&artifactReceipts.get(item.id);
    if(!origin||!item.id||!proof||!proof.blank||!proof.finish||found.has(item.id)||
      item.tier!=='法器'||item.workshopOrigin!==undefined||item.relicSetId!==undefined||
      origin.projectId!==proof.id||origin.blankId!==proof.blank.id||origin.siteId!==proof.siteId||
      origin.keeperId!==proof.keeperId||origin.firstTraineeId!==proof.traineeIds[0]||origin.secondTraineeId!==proof.traineeIds[1]||
      origin.blankTick!==proof.blank.tick||origin.finishedTick!==proof.finish.tick)return fail('craftTraining.artifact');
    found.add(item.id);
  };
  for(const person of world.cultivators)for(const item of person.artifacts)checkArtifact(item);
  for(const estate of world.estates.entries)for(const item of estate.holdings.artifacts)checkArtifact(item);
  for(const exhibit of world.relicExhibits.entries)if(exhibit.custody)checkArtifact(exhibit.custody);
  for(const loan of world.toolLoans.loans)if(loan.custody)checkArtifact(loan.custody);
}
