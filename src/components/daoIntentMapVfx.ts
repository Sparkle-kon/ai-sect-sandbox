import {projectDaoDuelIntents} from '../engine/daoPathEngine';
import {DAO_INTENT_QI,DAO_PATHS} from '../engine/daoPathTerms';
import type {DaoIntentActivation} from '../types/daoPath';
import type {WorldState} from '../types/world';

export interface DaoIntentMapMark {
  readonly siteId:string;
  readonly x:number;
  readonly y:number;
  readonly side:0|1;
  readonly pathId:DaoIntentActivation['pathId'];
  readonly rank:DaoIntentActivation['rank'];
}

/** A paid original clash, not a readied stance, hypothetical highlight or invented winner. */
export function buildDaoIntentMapVfx(world:WorldState,authorized:(siteId:string)=>boolean,historical:boolean):DaoIntentMapMark[]{
  if(historical)return [];
  const marks:DaoIntentMapMark[]=[];
  const knownMarks=new Set<string>();
  for(const event of world.events){
    const siteId=event.locationId;
    if(event.tick!==world.tick||event.year!==world.year||event.month!==world.month||event.witnessScope!==undefined||
      !event.daoIntents?.length||event.actorIds.length!==2||!event.duelWinnerId||!event.actorIds.includes(event.duelWinnerId)||
      !((event.category==='combat'&&event.id.endsWith('-duel'))||(event.category==='death'&&event.id.endsWith('-kill')))||
      !siteId||!authorized(siteId)||world.events.filter(row=>row.id===event.id).length!==1)continue;
    const sites=world.locations.filter(site=>site.id===siteId);
    if(sites.length!==1)continue;
    for(const intent of projectDaoDuelIntents(world,event)){
      const side=event.actorIds.indexOf(intent.actorId),tag=`${event.id}:${intent.actorId}`;
      if((side!==0&&side!==1)||knownMarks.has(tag)||intent.qiPaid!==DAO_INTENT_QI||
        intent.tick!==world.tick||intent.siteId!==siteId||intent.eventId!==event.id||!Object.hasOwn(DAO_PATHS,intent.pathId)||
        (intent.rank!==1&&intent.rank!==2&&intent.rank!==3)||event.daoIntents.filter(row=>row.actorId===intent.actorId).length!==1)continue;
      knownMarks.add(tag);
      marks.push({siteId,x:sites[0].x,y:sites[0].y,side,pathId:intent.pathId,rank:intent.rank});
    }
  }
  return marks;
}

export function drawDaoIntentMapVfx(ctx:CanvasRenderingContext2D,marks:readonly DaoIntentMapMark[],elapsed:number,animate:boolean,pixel:number):void{
  for(const {x,y,side,pathId,rank} of marks){
    const progress=animate?Math.max(0,Math.min(1,elapsed/1000)):1;
    ctx.save();
    ctx.translate(x+(side===0?-12:12),y-7);
    ctx.strokeStyle=DAO_PATHS[pathId].color;
    ctx.lineWidth=Math.max(1,1.65*pixel);
    ctx.globalAlpha=animate ? .8-.32*progress : .64;
    ctx.beginPath();
    if(pathId==='sword'){
      const blades=rank===3?7:rank+2,spread=10+12*progress;
      for(let i=0;i<blades;i++){
        const sideOffset=(i/(blades-1)-.5)*spread*2;
        ctx.moveTo(sideOffset,-21+Math.abs(sideOffset)*.23);
        ctx.lineTo(sideOffset*.3,8);
        ctx.moveTo(sideOffset*.7,-7);ctx.lineTo(sideOffset*.48,-5);
      }
    }else if(pathId==='formation'){
      const radius=12+8*progress;
      for(let i=0;i<=6;i++){
        const angle=i*Math.PI/3+Math.PI/6,px=Math.cos(angle)*radius,py=Math.sin(angle)*radius*.58;
        if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
    }else if(pathId==='shadow'){
      ctx.moveTo(-18,8);ctx.lineTo(-4,-11);ctx.lineTo(-1,-2);ctx.lineTo(16,-13);
      ctx.moveTo(-11,10);ctx.lineTo(4,-5);ctx.lineTo(18,-2);
    }else{
      ctx.ellipse(0,2,14+9*progress,7+4*progress,0,0,Math.PI*2);
      if(pathId==='body'){ctx.moveTo(-9,8);ctx.lineTo(-6,-7);ctx.lineTo(6,-7);ctx.lineTo(9,8);}
      else {ctx.moveTo(0,5);ctx.quadraticCurveTo(-9,-4,0,-14);ctx.quadraticCurveTo(9,-4,0,5);}
    }
    ctx.stroke();
    ctx.restore();
  }
}
