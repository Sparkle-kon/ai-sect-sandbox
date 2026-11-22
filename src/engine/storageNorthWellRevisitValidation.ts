import type {WorldState} from '../types/world';
import {findNorthWellRevisitEvidence} from './northWellRevisitEvidence';
import {NORTH_WELL_PERMIT_LIFE,NORTH_WELL_REVIEW_FEE,NORTH_WELL_SURVEY_RECENCY,
  northWellLawId,northWellReviewId} from './northWellRevisitTerms';
const SITE='loc-vein-north';
export function validateNorthWellRevisit(world:WorldState,fail:(path:string)=>never):void{
  const law=world.northWellRevisitLaw, rows=world.northWellRevisitReviews?.decisions??[];
  const flows=world.resourceFlow.months.flatMap(month=>month.entries.filter(row=>row.mechanism==='north_well_review'));
  if(!law&&!rows.length){
    if(flows.length)fail('northWellRevisit.missing');
    return;
  }
  const dates=(tick:number,year:number,month:number)=>tick>=1&&tick<=world.tick&&year>=1&&
    (year<world.year||year===world.year&&month<=world.month)&&(tick!==world.tick||year===world.year&&month===world.month);
  const evidence=law&&findNorthWellRevisitEvidence(world,law.sourceCharterId,law.declaredTick);
  if(law&&(!dates(law.declaredTick,law.year,law.month)||
    law.id!==northWellLawId(law.declaredTick,law.sourceCharterId)||law.siteId!==SITE||
    !evidence||evidence.well.id!==law.wellProjectId||evidence.freightClosedTick!==law.freightClosedTick||
    law.declaredTick===world.tick&&law.retainedPopulation!==evidence.village.population||
    world.coldWaterVein?.openings.some(row=>row.openedTick>law.declaredTick)))fail('northWellRevisit.law');
  const actors=new Set(world.cultivators.map(row=>row.id));
  const events=new Map(world.events.map(row=>[row.id,row]));
  const samples=new Map(world.coldWaterVein?.observations.map(row=>[row.id,row]));
  const mines=new Map(world.coldWaterVein?.mining.map(row=>[row.id,row]));
  type Decision=typeof rows[number];
  const payments=new Map<string,Decision>();
  const keys=new Set<string>(),usedPermits=new Set<string>();
  let previous=0;
  for(const row of rows){
    const sample=samples.get(row.surveyId),news=events.get(`evt-${row.id}`);
    const origin=findNorthWellRevisitEvidence(world,row.sourceCharterId,row.tick);
    const key=`${row.sourceCharterId}:${row.actorId}`;
    if(!dates(row.tick,row.year,row.month)||row.tick<previous||!actors.has(row.actorId)||keys.has(key)||
      row.id!==northWellReviewId(row.tick,row.actorId)||payments.has(row.id)||row.paidStones!==NORTH_WELL_REVIEW_FEE||
      !sample||sample.actorId!==row.actorId||sample.tick>=row.tick||sample.tick<row.tick-NORTH_WELL_SURVEY_RECENCY||
      !origin||origin.freightClosedTick!==row.freightClosedTick||
      (law?row.lawId!==law.id||row.sourceCharterId!==law.sourceCharterId||row.tick<law.declaredTick:row.lawId!==undefined)||
      news&&(news.tick!==row.tick||news.year!==row.year||news.month!==row.month||news.category!=='diplomacy'||
        news.locationId!==SITE||news.witnessScope!=='participants'||news.actorIds.length!==1||news.actorIds[0]!==row.actorId))
      fail('northWellRevisit.decision');
    payments.set(row.id,row);keys.add(key);previous=row.tick;
    const pass=row.permit;
    if(row.move==='keep'){
      if(pass)fail('northWellRevisit.permit.keep');
      continue;
    }
    if(!law||!pass||pass.validFromTick!==row.tick+1||pass.expiresTick!==pass.validFromTick+NORTH_WELL_PERMIT_LIFE||
      (pass.spentTick===undefined)!==(pass.miningReceiptId===undefined))fail('northWellRevisit.permit');
    if(pass.miningReceiptId!==undefined&&pass.spentTick!==undefined){
      const mine=mines.get(pass.miningReceiptId);
      if(!mine||usedPermits.has(mine.id)||mine.actorId!==row.actorId||mine.tick!==pass.spentTick||
        mine.tick<pass.validFromTick||mine.tick>=pass.expiresTick||mine.tick>world.tick)fail('northWellRevisit.permit.used');
      usedPermits.add(mine.id);
    }
  }
  if(law&&[...mines.values()].some(row=>row.tick>law.declaredTick&&!usedPermits.has(row.id)))
    fail('northWellRevisit.permit.unlicensed');
  const consumed=new Set<string>();
  for(const entry of flows){
    const row=payments.get(entry.refId);
    if(!row||consumed.has(row.id)||entry.tick!==row.tick||entry.amount!==NORTH_WELL_REVIEW_FEE||entry.good!=='stone'||
      entry.reason!=='old_well_review_paid'||entry.kind!=='consumption'||entry.from.kind!=='actor'||entry.from.id!==row.actorId||
      entry.visibility.kind!=='participants'||entry.visibility.actorIds.length!==1||entry.visibility.actorIds[0]!==row.actorId)
      fail('northWellRevisit.payment');
    consumed.add(entry.refId);
  }
  const complete=new Set(world.resourceFlow.months.filter(month=>month.totalEntries===month.entries.length).map(month=>month.tick));
  if(rows.some(row=>complete.has(row.tick)&&!consumed.has(row.id)))fail('northWellRevisit.payment.missing');
}
