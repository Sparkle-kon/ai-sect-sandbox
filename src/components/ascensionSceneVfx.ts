import {ascensionEventProof} from '../engine/ascensionProof';
import {ascensionEventId,IMMORTAL_ASCENSION_ADDRESS} from '../engine/ascensionTerms';
import type {AscensionWaveNumber} from '../types/ascension';
import type {WorldState} from '../types/world';

export type AscensionMapMark={actorId:string;siteId:string;x:number;y:number}&(
  {kind:'warning'}|{kind:'wave';wave:AscensionWaveNumber}|{kind:'gate'}
);

/** The court only paints already-applied native records from this viewed month/venue. */
export function buildAscensionMapVfx(world:WorldState,visible:(id:string)=>boolean,historical:boolean):AscensionMapMark[]{
  if(historical||!world.ascension?.trials.length)return [];
  const marks:AscensionMapMark[]=[];
  for(const trial of world.ascension.trials){
    if(!visible(trial.siteId))continue;
    const sites=world.locations.filter(row=>row.id===trial.siteId);
    if(sites.length!==1)continue;
    const site=sites[0],base={actorId:trial.actorId,siteId:site.id,x:site.x,y:site.y};
    const validEvent=(eventId:string)=>{
      const events=world.events.filter(row=>row.id===eventId&&row.tick===world.tick&&row.locationId===site.id);
      return events.length===1&&!!ascensionEventProof(world,events[0]);
    };
    if(trial.terminal?.status==='succeeded'&&trial.terminal.tick===world.tick){
      const actors=world.cultivators.filter(row=>row.id===trial.actorId);
      if(actors.length===1&&actors[0].alive&&actors[0].positionPlane==='immortal'&&
        actors[0].locationId===IMMORTAL_ASCENSION_ADDRESS&&validEvent(trial.terminal.eventId))marks.push({...base,kind:'gate'});
      continue;
    }
    const wave=trial.waves.at(-1);
    if(wave?.tick===world.tick&&validEvent(wave.eventId)){
      marks.push({...base,kind:'wave',wave:wave.wave});
    }else if(trial.startedTick===world.tick&&validEvent(ascensionEventId(trial.actorId,world.tick,'warning'))){
      marks.push({...base,kind:'warning'});
    }
  }
  return marks;
}

export function drawAscensionMapVfx(ctx:CanvasRenderingContext2D,marks:readonly AscensionMapMark[],elapsed:number,animate:boolean,pixel:number){
  const time=animate?Math.max(0,Math.min(1,elapsed/1150)):1;
  for(const mark of marks){
    ctx.save();ctx.translate(mark.x,mark.y);
    ctx.lineWidth=Math.max(1.3,2.25*pixel);
    ctx.strokeStyle=mark.kind==='gate'?'#ffe6a3':mark.kind==='wave'?'#c4e7ff':'#b2a6e2';
    ctx.globalAlpha=.52+.26*time;
    ctx.beginPath();
    if(mark.kind==='gate'){
      const h=48+22*time;
      ctx.moveTo(-24,10);ctx.lineTo(-24,-h*.6);ctx.quadraticCurveTo(-24,-h,0,-h);
      ctx.quadraticCurveTo(24,-h,24,-h*.6);ctx.lineTo(24,10);
      ctx.moveTo(-15,7);ctx.lineTo(-15,-h*.56);ctx.quadraticCurveTo(-15,-h*.86,0,-h*.86);
      ctx.quadraticCurveTo(15,-h*.86,15,-h*.56);ctx.lineTo(15,7);
      ctx.moveTo(-34,12);ctx.lineTo(34,12);
      for(let i=0;i<5;i++){
        const x=(i-2)*10;ctx.moveTo(x,-h-7);ctx.lineTo(x*1.24,-h-17);
      }
    }else if(mark.kind==='wave'){
      const depth=35+7*mark.wave;
      ctx.moveTo(-5,-depth);ctx.lineTo(3,-depth*.62);ctx.lineTo(-1,-depth*.55);ctx.lineTo(6,-14);ctx.lineTo(0,0);
      ctx.moveTo(-mark.wave*6,10);ctx.quadraticCurveTo(0,15+3*mark.wave,mark.wave*6,10);
    }else{
      ctx.moveTo(-22,-18);ctx.quadraticCurveTo(-19,-29,-8,-25);
      ctx.quadraticCurveTo(-1,-38,10,-28);ctx.quadraticCurveTo(22,-29,24,-18);
      ctx.moveTo(-17,-13);ctx.lineTo(18,-13);
    }
    ctx.stroke();ctx.restore();
  }
}
