import type {CausalChronicleKind,CausalChronicleNode,CausalChronicleOutcome,CausalChronicleRelation,ChronicleAnchor,ChronicleChapter,WorldEvent,WorldState} from '../types/world';
import {buildCausalChronicleChain,causalPredecessorCompatible,type CausalChronicleView} from './chronicleCausalityEngine';
import {canFocusChronicleSite} from './chronicleFocusEngine';
import {isChronicleStoryFact} from './chronicleLead';
import {writeChronicleScene} from './chronicleScene';
import {publicChronicleChapters} from './coldHistoryEngine';
import {protagonistFactIndex} from './protagonistSuccession';

export const CHAPTER_TURNING_POINTS_LIMIT=3;
const SCENES_PER_ARC=6;
export type TurningPointOutcome=Exclude<CausalChronicleOutcome,'escort_failed'|'endpoint_missing'|'market_closed'>|'returned';
export interface TurningPointScene {
  eventId:string;
  tick:number;
  kind:CausalChronicleKind;
  outcome?:TurningPointOutcome;
  siteName:string;
  title:string;
  paragraph:string;
}
export interface TurningPointLink {
  fromEventId:string;
  toEventId:string;
  relation:CausalChronicleRelation;
  sameTurn:boolean;
}
export interface ChapterTurningPoint {
  id:string;
  consequenceEventId:string;
  scenes:TurningPointScene[];
  links:TurningPointLink[];
}
export interface ChapterTurningPoints { arcs:ChapterTurningPoint[];separateEventIds:string[] }
type Fact=ChronicleAnchor|WorldEvent;
type Proven={node:CausalChronicleNode;fact:Fact;siteName:string};
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const text=(s:string,max:number)=>s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,max);
const archiveCut=(s:string,max:number)=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
const publicSignature=(row:Fact)=>JSON.stringify([
  row.tick,row.year,row.month,row.category,archiveCut(row.title,80),archiveCut(row.description,220),row.locationId??null,
  [...new Set(row.actorIds)].slice(0,12),
]);
function sourcesFor(world:WorldState,chapters:readonly ChronicleChapter[],throughTick:number,ids:ReadonlySet<string>){
  const native=protagonistFactIndex(world,throughTick);
  const facts=new Map<string,Fact>();
  const blocked=new Set(native.disputed);
  for(const [id,row]of native.byId)if(ids.has(id))facts.set(id,row);
  // Closed chapter notes may outlive the hot feed. They provide a scene only; never reconstruct graph links.
  for(const chapter of chapters)if(chapter.endTick<=throughTick)for(const fact of chapter.anchors){
    if(!ids.has(fact.id)||!isChronicleStoryFact(fact,throughTick)||fact.tick<chapter.startTick||fact.tick>chapter.endTick)continue;
    const earlier=facts.get(fact.id);
    if(earlier&&publicSignature(earlier)!==publicSignature(fact))blocked.add(fact.id);
    else if(!earlier)facts.set(fact.id,fact);
  }
  for(const id of blocked)facts.delete(id);
  return facts;
}
function sameOrderedActors(fact:Fact,ids:readonly string[]){
  return fact.actorIds.length===ids.length&&ids.every((actorId,i)=>fact.actorIds[i]===actorId);
}
function marketStatus(outcome:CausalChronicleOutcome|undefined){
  return outcome==='delivered'?'delivered':outcome==='route_loss'?'lost':
    outcome==='escort_failed'||outcome==='endpoint_missing'||outcome==='market_closed'?'returned':undefined;
}
function nativeNodeValid(world:WorldState,{node,fact}:Proven):boolean{
  switch(node.kind){
    case 'market_buy_order':
    case 'market_sell_order': {
      const order=world.markets.orders.find(row=>row.id===node.entityId);
      return !!order&&order.side===(node.kind==='market_buy_order'?'buy':'sell')&&order.placedTick===node.tick&&
        order.locationId===node.locationId&&node.eventId===`evt-${node.tick}-market-${order.id}`&&sameOrderedActors(fact,[order.actorId]);
    }
    case 'market_shipment': {
      const shipment=world.markets.shipments.find(row=>row.id===node.entityId);
      return !!shipment&&shipment.departedTick===node.tick&&shipment.originId===node.locationId&&
        node.eventId===`evt-${node.tick}-market-${shipment.id}`&&sameOrderedActors(fact,[shipment.buyerId,shipment.sellerId]);
    }
    case 'market_settlement': {
      if(node.outcome==='local_fill'){
        const receipt=world.markets.receipts.find(row=>row.id===node.entityId&&row.status==='local_fill'&&row.tick===node.tick);
        return !!receipt&&receipt.originId===node.locationId&&receipt.destinationId===node.locationId&&
          node.eventId===`evt-${node.tick}-market-fill-${receipt.sequence}`&&sameOrderedActors(fact,[receipt.buyerId,receipt.sellerId]);
      }
      const status=marketStatus(node.outcome);
      const shipment=world.markets.shipments.find(row=>row.id===node.entityId&&row.settledTick===node.tick&&row.status===status);
      return !!shipment&&shipment.destinationId===node.locationId&&node.eventId===`evt-${node.tick}-market-${shipment.id}`&&
        sameOrderedActors(fact,[shipment.buyerId,shipment.sellerId])&&world.markets.receipts.some(row=>
          row.shipmentId===shipment.id&&row.tick===node.tick&&row.status===status&&row.originId===shipment.originId&&
          row.destinationId===shipment.destinationId&&row.buyerId===shipment.buyerId&&row.sellerId===shipment.sellerId&&
          row.good===shipment.good&&row.quantity===shipment.quantity&&row.unitPrice===shipment.unitPrice);
    }
    case 'siege_launched': {
      const siege=world.sieges.find(row=>row.id===node.entityId&&row.startedTick===node.tick);
      return !!siege&&node.eventId===`evt-${node.tick}-dip-${siege.attackerSectId}-${siege.defenderSectId}-launch_siege`&&
        siege.participantIds.length>0&&sameOrderedActors(fact,siege.participantIds);
    }
    case 'truce_signed': {
      const pact=world.ceasefires.agreements.find(row=>row.id===node.entityId&&row.signedTick===node.tick);
      return !!pact&&node.eventId===`evt-${node.tick}-${pact.id}-signed`&&
        fact.actorIds[0]===pact.proposerId&&fact.actorIds.includes(pact.targetLeaderId);
    }
    case 'sect_vacancy':
      return world.sects.some(row=>row.id===node.entityId)&&fact.actorIds.length===0&&
        node.eventId===`evt-${node.tick}-${node.entityId}-leadership-office-vacant`;
    case 'sect_election': {
      const sect=world.sects.find(row=>row.id===node.entityId);
      const elected=fact.actorIds[0];
      return !!sect&&!!elected&&node.eventId===`evt-${node.tick}-${sect.id}-leadership-vacancy-${elected}`&&
        (sect.succession?.tick!==node.tick||sect.succession.method==='election'&&sect.succession.leaderId===elected);
    }
  }
}
function realLocalMatch(world:WorldState,root:Proven,bid:Proven,ask:Proven):boolean{
  const receipt=world.markets.receipts.find(row=>row.id===root.node.entityId);
  const buyer=world.markets.orders.find(row=>row.id===bid.node.entityId);
  const seller=world.markets.orders.find(row=>row.id===ask.node.entityId);
  return !!receipt&&!!buyer&&!!seller&&buyer.actorId===receipt.buyerId&&seller.actorId===receipt.sellerId&&
    buyer.locationId===receipt.destinationId&&seller.locationId===receipt.originId&&buyer.good===receipt.good&&seller.good===receipt.good&&
    buyer.quantity>=receipt.quantity&&seller.quantity>=receipt.quantity&&
    receipt.unitPrice===(buyer.sequence<seller.sequence?buyer.limitPrice:seller.limitPrice)&&buyer.limitPrice>=seller.limitPrice;
}
function renderScene({node,siteName}:Proven):TurningPointScene{
  let title:string,paragraph:string;
  const story=(name:string,line:string)=>[name,`在${siteName}，${line}`] as const;
  switch(node.kind){
    case 'market_buy_order':[title,paragraph]=story('买单入簿','买家挂下求购，实际货款先交坊市保管。');break;
    case 'market_sell_order':[title,paragraph]=story('卖单入簿','卖家挂出货物，货先交坊市保管。');break;
    case 'market_shipment':[title,paragraph]=story('商队起程','商队接下已经托管的货，启程时还未交割。');break;
    case 'siege_launched':[title,paragraph]=story('出征列队','出征一方发动了这场攻山，参战者开始行动。');break;
    case 'truce_signed':[title,paragraph]=story('停战落签','双方签署停战，此处所列参战队伍有实据证明确已撤回。');break;
    case 'sect_vacancy':[title,paragraph]=story('掌门出缺','旧掌门的席位已经空出，个人离任缘由没有在这里补写。');break;
    case 'sect_election':[title,paragraph]=story('新掌门获推举','宗门实际推举了新掌门，填补先前的空缺。');break;
    case 'market_settlement': {
      const line=node.outcome==='local_fill'?['当场交割','买卖双方完成现场交割，货款与货物已经移交。']:
        node.outcome==='delivered'?['到货交割','商路货物实际交付，货款按原账结清。']:
        node.outcome==='route_loss'?['货未交到','原批货物没有交付，买家的托管货款退还。']:
        ['原单退运','这趟未能交付，货物与货款按原托管账退回。'];
      [title,paragraph]=story(line[0],line[1]);break;
    }
  }
  const scene=writeChronicleScene({title,description:paragraph,category:'diplomacy'});
  const outcome=node.outcome==='escort_failed'||node.outcome==='endpoint_missing'||node.outcome==='market_closed'?'returned':node.outcome;
  return {eventId:node.eventId,tick:node.tick,kind:node.kind,...(outcome?{outcome}:{}),siteName,
    title:scene.title,paragraph:scene.paragraph};
}
type Related={parent:Proven;node:Proven;relation:CausalChronicleRelation};
function arcProof(world:WorldState,root:Proven,graph:CausalChronicleView,prove:(id:string)=>Proven|undefined):Related[]|undefined{
  const exact=(child:Proven,branch:CausalChronicleView,relation:CausalChronicleRelation):Related[]=>{
    const found:Related[]=[];
    for(const edge of branch.previous){
      if(edge.relation!==relation)continue;
      const parent=prove(edge.node.entry.eventId);
      if(parent&&causalPredecessorCompatible(child.node,parent.node,relation))
        found.push({parent,node:child,relation});
    }
    return found;
  };
  switch(root.node.kind){
    case 'sect_election': {
      const links=exact(root,graph,'filled_vacancy');
      return links.length===1?links:undefined;
    }
    case 'truce_signed': {
      if(root.node.outcome!=='truce_with_withdrawal')return undefined;
      const pact=world.ceasefires.agreements.find(row=>row.id===root.node.entityId);
      const links=exact(root,graph,'withdrew_siege');
      if(!pact||!links.length||links.length!==root.node.predecessors.length||links.length>=SCENES_PER_ARC||
        links.some(row=>!pact.withdrawnSiegeIds.includes(row.parent.node.entityId)))return undefined;
      return links;
    }
    case 'market_settlement': {
      if(root.node.outcome==='local_fill'){
        const buy=exact(root,graph,'matched_buy_order'),sell=exact(root,graph,'matched_sell_order');
        return buy.length===1&&sell.length===1&&realLocalMatch(world,root,buy[0].parent,sell[0].parent)?[...buy,...sell]:undefined;
      }
      const transit=exact(root,graph,'settled_shipment');
      if(transit.length!==1)return undefined;
      const native=world.markets.shipments.find(row=>row.id===root.node.entityId);
      const child=graph.previous.find(edge=>edge.node.entry.eventId===transit[0].parent.node.eventId)?.node;
      if(!native||!child)return undefined;
      const start=transit[0].parent,buy=exact(start,child,'matched_buy_order'),sell=exact(start,child,'matched_sell_order');
      // Publishing the dispatch→settlement edge does not claim any invisible order history.
      return buy.length===1&&sell.length===1&&buy[0].parent.node.entityId===native.buyOrderId&&sell[0].parent.node.entityId===native.sellOrderId
        ?[...buy,...sell,...transit]:transit;
    }
    default:return undefined;
  }
}
export function projectChapterTurningPoints(world:WorldState,chapterId:string,viewerId?:string|null,throughTick=world.tick):ChapterTurningPoints{
  const empty={arcs:[],separateEventIds:[]};
  if(!viewerId||!Number.isSafeInteger(throughTick)||throughTick<0||throughTick>world.tick||
    !world.cultivators.some(row=>row.id===viewerId&&row.alive&&row.hp>0))return empty;
  const stored=[...world.chronicleArchive.chapters,...(world.coldHistory?.chapters??[])];
  if(stored.filter(row=>row.id===chapterId).length!==1)return empty;
  const chapters=publicChronicleChapters(world);
  const selected=chapters.find(row=>row.id===chapterId&&row.endTick<=throughTick);
  if(!selected)return empty;
  const cutoff=selected.endTick;
  const nodes=new Map<string,CausalChronicleNode>(),bad=new Set<string>();
  for(const node of world.chronicleCausality.nodes){
    if(nodes.has(node.eventId))bad.add(node.eventId);
    nodes.set(node.eventId,node);
  }
  const ids=new Set([...nodes.keys(),...selected.anchors.map(row=>row.id)]);
  const facts=sourcesFor(world,chapters,cutoff,ids);
  const sites=new Map<string,string|undefined>(),proved=new Map<string,Proven|undefined>();
  function local(id:string):string|undefined{
    if(!sites.has(id)){
      const site=canFocusChronicleSite(world,id,viewerId)?world.locations.find(row=>row.id===id):undefined;
      sites.set(id,site?text(site.name,100)||undefined:undefined);
    }
    return sites.get(id);
  }
  function prove(id:string):Proven|undefined{
    if(proved.has(id))return proved.get(id);
    const node=nodes.get(id),fact=facts.get(id),siteName=node?.locationId&&local(node.locationId);
    const row=node&&fact&&siteName&&!bad.has(id)&&node.tick<=cutoff&&node.tick===fact.tick&&
      node.locationId===fact.locationId&&fact.category==='diplomacy'?{node,fact,siteName}:undefined;
    const result=row&&nativeNodeValid(world,row)?row:undefined;
    proved.set(id,result);
    return result;
  }
  const arcs:ChapterTurningPoint[]=[];
  const appeared=new Set<string>();
  const candidates=selected.anchors.slice().sort((a,b)=>b.tick-a.tick||compare(a.id,b.id));
  for(const selectedAnchor of candidates){
    if(arcs.length>=CHAPTER_TURNING_POINTS_LIMIT)break;
    const root=prove(selectedAnchor.id);
    if(!root||publicSignature(root.fact)!==publicSignature(selectedAnchor))continue;
    const graph=buildCausalChronicleChain(world,root.node.eventId,viewerId);
    const edges=graph&&arcProof(world,root,graph,prove);
    if(!edges?.length)continue;
    const participating=new Map<string,Proven>([[root.node.eventId,root]]);
    for(const edge of edges){
      participating.set(edge.parent.node.eventId,edge.parent);
      participating.set(edge.node.node.eventId,edge.node);
    }
    if(participating.size>SCENES_PER_ARC)continue;
    const rows=[...participating.values()].sort((a,b)=>a.node.sequence-b.node.sequence||compare(a.node.eventId,b.node.eventId));
    rows.forEach(row=>appeared.add(row.node.eventId));
    arcs.push({id:root.node.eventId,consequenceEventId:root.node.eventId,scenes:rows.map(renderScene),links:edges.map(edge=>({
      fromEventId:edge.parent.node.eventId,toEventId:edge.node.node.eventId,relation:edge.relation,
      sameTurn:edge.parent.node.tick===edge.node.node.tick,
    }))});
  }
  return {arcs,separateEventIds:[...new Set(selected.anchors.flatMap(row=>{
    const fact=facts.get(row.id);
    return !appeared.has(row.id)&&fact&&row.locationId&&local(row.locationId)&&publicSignature(fact)===publicSignature(row)?[row.id]:[];
  }))]};
}
