import type {FrontierSupplyLink as FrontierSupplyLinkView} from '../engine/frontierSupplyLinks';

const title:Record<FrontierSupplyLinkView['kind'],string>={
  north_practice:'一枝泽苇，暖了雪谷一课',
  west_layer:'雷脊来石，西井叩关',
  ridge_feeding:'西井的盐，到了雷脊牧栏',
};
const material:Record<FrontierSupplyLinkView['good'],string>={ward_reed:'御寒芦',stormstone:'雷石',rift_salt:'旱盐'};
const source:Record<FrontierSupplyLinkView['kind'],string>={north_practice:'南泽',west_layer:'雷脊',ridge_feeding:'西井'};
const useSite:Record<FrontierSupplyLinkView['kind'],string>={north_practice:'雪谷',west_layer:'西井冲境台',ridge_feeding:'雷脊牧栏'};
const terminal='min-w-0 space-y-2 rounded border border-amber-900/70 bg-slate-950 px-3 pb-3 text-sm text-slate-100 [overflow-wrap:anywhere]';
const control='flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline focus-visible:outline-amber-300';

type Frame={year:number;month:number;tick:number};
type Result=FrontierSupplyLinkView['result'];
function prose(link:FrontierSupplyLinkView,viewerName:string){
  const result:Result=link.result;
  switch(result.kind){
    case 'qi_gain':
      return viewerName+'在雪谷用了一份南泽来苇，修完这一课，灵气实增 '+result.qiGained+' 点。';
    case 'layer_advanced':
      return viewerName+'借井水与一块雷脊来石叩关。这回叩开了同境一层（第 '+result.fromStage+' 层至第 '+result.toStage+' 层），未曾破境。';
    case 'layer_backlash':
      return viewerName+'用下了一块雷脊来石，也取了井水。阵里起了反噬，这回没进层。';
    case 'herd_fed':
      return viewerName+'在雷脊取一份西井来的旱盐投食。盐确实入了牧栏，不再只是货单上的一行字。';
  }
}
function when(tick:number,frame?:Frame){
  if(!frame)return '第 '+tick+' 轮';
  const date=frame.year*12+frame.month-1-(frame.tick-tick);
  return '仙历 '+Math.floor(date/12)+' 年 '+(date%12+1)+' 月';
}
function valid(link:FrontierSupplyLinkView,frame?:Frame){
  if(![link.harvestedTick,link.loadedTick,link.arrivedTick,link.deliveredTick,link.usedTick].every(t=>Number.isSafeInteger(t)&&t>0)||
    link.quantity!==1||link.harvestedTick>link.loadedTick||link.loadedTick>=link.arrivedTick||link.arrivedTick>link.deliveredTick||
    link.deliveredTick>=link.usedTick||frame&&link.usedTick>frame.tick)return false;
  const {kind,result,good}=link;
  switch(kind){
    case 'north_practice':return good==='ward_reed'&&result.kind==='qi_gain'&&Number.isFinite(result.qiGained)&&result.qiGained>0;
    case 'west_layer':return good==='stormstone'&&(result.kind==='layer_advanced'&&result.toStage===result.fromStage+1||
      result.kind==='layer_backlash'&&result.toStage===result.fromStage);
    case 'ridge_feeding':return good==='rift_salt'&&result.kind==='herd_fed';
  }
}
function Proof({link,frame}:{link:FrontierSupplyLinkView;frame?:Frame}){
  return <details className="min-w-0 rounded border border-slate-800 px-2">
    <summary className={control+' text-slate-200'}>看这批货的来路</summary>
    <ol className="space-y-1 pb-2 text-xs text-slate-300">
      <li>原产于{source[link.kind]}：{when(link.harvestedTick,frame)}。</li>
      <li>这批{material[link.good]}实装：{when(link.loadedTick,frame)}。</li>
      <li>实到交接地：{when(link.arrivedTick,frame)}；实交：{when(link.deliveredTick,frame)}。</li>
      <li>在{useSite[link.kind]}实用 {link.quantity} 份：{when(link.usedTick,frame)}。</li>
    </ol>
  </details>;
}
export function CrossRegionConsequenceRead({consequences,viewerName,frame}:{
  consequences:readonly FrontierSupplyLinkView[];viewerName?:string;frame?:Frame;
}){
  const counts=new Map<string,number>();
  for(const link of consequences)counts.set(link.id,(counts.get(link.id)??0)+1);
  const known=consequences.filter(link=>valid(link,frame)&&counts.get(link.id)===1)
    .sort((a,b)=>b.usedTick-a.usedTick||a.id.localeCompare(b.id));
  if(!known.length)return null;
  const [latest,...prior]=known;
  const viewer=viewerName?.trim()||'此人';
  return <article className={terminal+' pt-3'} aria-label="亲历的远货后事">
    <h3 className="font-semibold text-amber-100">{title[latest.kind]}</h3>
    <p>{prose(latest,viewer)}</p>
    <Proof link={latest} frame={frame}/>
    {prior.length>0&&<details className="min-w-0 rounded border border-slate-800 px-2">
      <summary className={control+' text-slate-200'}>更早的远货后事</summary>
      <ul className="space-y-2 pb-2">
        {prior.map(link=><li key={link.id} className="space-y-1">
          <h4 className="font-semibold">{title[link.kind]}</h4>
          <p>{prose(link,viewer)}</p>
          <Proof link={link} frame={frame}/>
        </li>)}
      </ul>
    </details>}
  </article>;
}
