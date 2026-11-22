import type {ResourceFlowEntry,WorldState} from '../types/world';
import {RESOURCE_FLOW_MONTH_LIMIT} from './resourceFlowEngine';
import {type UpperArrayFieldSiteId} from './upperArrayFieldTerms';
import {
  UPPER_ARRAY_FIELD_LATTICE_CAPACITY as CAP,UPPER_ARRAY_FIELD_LOCAL_COST as C,UPPER_ARRAY_FIELD_LOCAL_LIMIT as MAX,
  upperArrayFieldLatticeBatchId,upperArrayFieldLocalReceiptId,
  type UpperArrayFieldLatticeBatch,type UpperArrayFieldLatticeCustody,type UpperArrayLatticeSlice,
} from './upperArrayFieldLocalTerms';

type Fail=(path:string)=>never;
type Row=Record<string,unknown>;
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(row:Row,keys:readonly string[])=>Object.keys(row).length===keys.length&&keys.every(key=>Object.hasOwn(row,key));
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=240&&!/[\u0000-\u001f\u007f]/u.test(value);
const integer=(n:unknown,min=1,max=100_000_000):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const qi=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
const list=(value:unknown,check:(row:unknown)=>boolean)=>Array.isArray(value)&&value.length<=MAX&&value.every(check);
const lot=(value:unknown)=>object(value)&&exact(value,['batchId','quantity'])&&id(value.batchId)&&integer(value.quantity,1,2);
export function validateUpperArrayFieldLocalShape(value:unknown,path:string,fail:Fail):void{
  if(!object(value)||!exact(value,['version','batches','stock','receipts'])||value.version!==1||
    !list(value.batches,row=>object(row)&&exact(row,['id','actorId','visitId','tick','quantity'])&&
      id(row.id)&&id(row.actorId)&&id(row.visitId)&&integer(row.tick)&&row.quantity===C.condense.produced)||
    !list(value.stock,lot)||!list(value.receipts,row=>{
      if(!object(row)||!id(row.id)||!id(row.actorId)||!id(row.visitId)||!integer(row.tick))return false;
      const keys=['id','actorId','visitId','tick','move'];
      return row.move==='condense'?exact(row,[...keys,'batchId'])&&id(row.batchId):
        row.move==='cultivate'&&exact(row,[...keys,'spent','beforeQi','afterQi'])&&lot(row.spent)&&qi(row.beforeQi)&&qi(row.afterQi);
    })||Array.isArray(value.receipts)&&!value.receipts.length)return fail(path);
}

type Good='stone'|'earth_root'|'upper_lattice';
type Flow={tick:number;refId:string;actorId:string;reason:string;good:Good;amount:number;kind:'production'|'consumption';account:'actor'|'upper_array_store'};
const reasons=new Set(['upper_lattice_material','upper_lattice_produced','upper_array_practice']);
const key=(ref:string,good:ResourceFlowEntry['good'])=>JSON.stringify([ref,good]);
export function validateUpperArrayFieldLocal(world:WorldState,custody:readonly UpperArrayFieldLatticeCustody[],fail:Fail):void{
  const path='upperArrayField.production';
  const field=world.upperArrayField, book=field?.production;
  const localFlows=world.resourceFlow.months.flatMap(month=>month.entries).filter(row=>row.mechanism==='upper_array_field'&&reasons.has(row.reason));
  const retained=world.events.filter(row=>row.id.startsWith('evt-array-field-local-'));
  if(!field||!book){if(custody.length||localFlows.length||retained.length)fail(path);return;}
  validateUpperArrayFieldLocalShape(book,path,fail);
  const visits=new Map(field.visits.map(visit=>[visit.id,visit]));
  const visitsByActor=new Map<string,typeof field.visits>();
  for(const visit of field.visits){
    const rows=visitsByActor.get(visit.actorId)??[];
    rows.push(visit);visitsByActor.set(visit.actorId,rows);
  }
  const residences=new Map(field.residences.map(home=>[home.actorId,home]));
  const personIds=new Set(world.cultivators.map(row=>row.id));
  const use=new Set<string>();
  function occupies(actorId:string,visitId:string|undefined,tick:number,siteId:UpperArrayFieldSiteId){
    if(!personIds.has(actorId)||(residences.get(actorId)?.settledTick??Infinity)>=tick)return false;
    const visit=visitId===undefined?
      visitsByActor.get(actorId)?.find(row=>row.enteredTick<tick&&tick<(row.exitedTick??row.deceasedTick??Infinity)):
      visits.get(visitId);
    if(!visit||visit.actorId!==actorId||visit.enteredTick>=tick||tick>=(visit.exitedTick??visit.deceasedTick??Infinity))return false;
    let step:typeof visit.steps[number]|undefined;
    for(let i=visit.steps.length-1;i>=0;i--)if(visit.steps[i].tick<=tick){step=visit.steps[i];break;}
    const slot=JSON.stringify([actorId,tick]);
    if(step?.siteId!==siteId||step.tick===tick||use.has(slot))return false;
    use.add(slot);return true;
  }
  const batches=new Map<string,UpperArrayFieldLatticeBatch>();
  const expected=new Map<string,Flow>();
  const movements:{tick:number;actorId:string;slices:readonly UpperArrayLatticeSlice[];direction:1|-1}[]=[];
  const events=new Map(retained.map(row=>[row.id,row]));
  if(events.size!==retained.length)return fail(path+'.event.duplicate');
  let previous=0;
  for(const row of book.receipts){
    const {id:refId,actorId,visitId,tick,move}=row;
    const siteId=move==='condense'?'array-field-source':'array-field-practice';
    if(tick<previous||tick>world.tick||refId!==upperArrayFieldLocalReceiptId(tick,actorId)||
      !occupies(actorId,visitId,tick,siteId))return fail(path+'.receipt');
    previous=tick;
    const evt=events.get(`evt-${refId}`);
    if(evt&&(evt.tick!==tick||evt.locationId!==siteId||evt.category!=='heavenly'||evt.witnessScope!=='participants'||
      evt.actorIds.length!==1||evt.actorIds[0]!==actorId))return fail(path+'.event');
    events.delete(`evt-${refId}`);
    const base={tick,refId,actorId};
    const add=(flow:Flow)=>expected.set(key(flow.refId,flow.good),flow);
    if(move==='condense'){
      if(row.batchId!==upperArrayFieldLatticeBatchId(refId)||batches.has(row.batchId))return fail(path+'.batch.id');
      const batch={id:row.batchId,actorId,visitId,tick,quantity:C.condense.produced};
      batches.set(batch.id,batch);
      movements.push({tick,actorId,slices:[{batchId:batch.id,quantity:batch.quantity}],direction:1});
      add({...base,reason:'upper_lattice_material',good:'earth_root',amount:C.condense.roots,kind:'consumption',account:'actor'});
      add({...base,reason:'upper_lattice_produced',good:'upper_lattice',amount:batch.quantity,kind:'production',account:'upper_array_store'});
    }else{
      if(row.spent.quantity!==C.cultivate.lattice||row.beforeQi>=100||row.afterQi!==Math.min(100,row.beforeQi+C.cultivate.qi))
        return fail(path+'.cultivate');
      movements.push({tick,actorId,slices:[row.spent],direction:-1});
      add({...base,reason:'upper_array_practice',good:'upper_lattice',amount:C.cultivate.lattice,kind:'consumption',account:'upper_array_store'});
    }
    add({...base,reason:move==='condense'?'upper_lattice_material':'upper_array_practice',good:'stone',
      amount:C[move].stones,kind:'consumption',account:'actor'});
  }
  if(events.size)return fail(path+'.event.orphan');
  const computed=[...batches.values()];
  if(book.batches.length!==computed.length||book.batches.some((row,i)=>{
    const wanted=computed[i];
    return row.id!==wanted.id||row.actorId!==wanted.actorId||row.visitId!==wanted.visitId||row.tick!==wanted.tick||row.quantity!==wanted.quantity;
  }))return fail(path+'.batch.provenance');
  const trades=new Set<string>();
  for(const row of custody){
    if(!id(row.tradeId)||trades.has(row.tradeId)||!integer(row.loadedTick,1,world.tick)||
      !occupies(row.actorId,undefined,row.loadedTick,'array-field-exchange')||!row.slices.length||row.slices.length>2||
      new Set(row.slices.map(slice=>slice.batchId)).size!==row.slices.length||
      row.slices.reduce((sum,slice)=>sum+slice.quantity,0)!==2||
      row.slices.some(slice=>!lot(slice)||(batches.get(slice.batchId)?.tick??Infinity)>=row.loadedTick))
      return fail(path+'.custody.load');
    trades.add(row.tradeId);
    movements.push({tick:row.loadedTick,actorId:row.actorId,slices:row.slices,direction:-1});
    if(row.restockedTick!==undefined){
      if(!integer(row.restockedTick,row.loadedTick+1,world.tick)||!occupies(row.actorId,undefined,row.restockedTick,'array-field-exchange'))
        return fail(path+'.custody.return');
      movements.push({tick:row.restockedTick,actorId:row.actorId,slices:row.slices,direction:1});
    }
  }
  const stock=new Map<string,number>(), totals=new Map<string,number>();
  for(const step of movements.sort((a,b)=>a.tick-b.tick)){
    let held=totals.get(step.actorId)??0;
    for(const row of step.slices){
      const batch=batches.get(row.batchId);
      if(!batch||batch.actorId!==step.actorId||batch.tick>step.tick||step.direction===-1&&batch.tick===step.tick)return fail(path+'.lot.owner');
      const count=(stock.get(row.batchId)??0)+step.direction*row.quantity;
      if(count<0||count>batch.quantity)return fail(path+'.lot.overdraw');
      if(count===0)stock.delete(row.batchId);else stock.set(row.batchId,count);
      held+=step.direction*row.quantity;
    }
    if(held>CAP)return fail(path+'.capacity');
    totals.set(step.actorId,held);
  }
  if(book.stock.length!==stock.size||new Set(book.stock.map(row=>row.batchId)).size!==stock.size||
    book.stock.some(row=>stock.get(row.batchId)!==row.quantity))return fail(path+'.stock');
  const complete=new Set(world.resourceFlow.months.filter(row=>row.entries.length===row.totalEntries).map(row=>row.tick));
  for(const row of localFlows){
    const ref=key(row.refId,row.good), proof=expected.get(ref);
    const account=row.kind==='production'?row.to:row.kind==='consumption'?row.from:undefined;
    if(!proof||proof.tick!==row.tick||proof.kind!==row.kind||proof.reason!==row.reason||proof.amount!==row.amount||
      !account||account.kind!==proof.account||account.id!==(proof.account==='actor'?proof.actorId:'upper-array-field')||
      row.visibility.kind!=='participants'||row.visibility.actorIds.length!==1||row.visibility.actorIds[0]!==proof.actorId)
      return fail(path+'.flow');
    expected.delete(ref);
  }
  for(const proof of expected.values()){
    if(complete.has(proof.tick)||proof.tick>world.tick-RESOURCE_FLOW_MONTH_LIMIT&&
      !world.resourceFlow.months.some(row=>row.tick===proof.tick))return fail(path+'.flow.missing');
  }
}
