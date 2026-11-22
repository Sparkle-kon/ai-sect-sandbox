import type { DungeonMember, DungeonRoom, DungeonStep } from '../types/expeditionDungeon';
import type { WorldEvent, WorldState } from '../types/world';
import { SHARE_SAVE_REDACTED_TEXT } from './shareSaveRedactionText';

type Fail=(path:string)=>never;
const path='occasions.dungeon';
const dungeonEvent=/^evt-\d+-occasion-\d+-expedition-dungeon-/u;
const bossMax=100;
const nativeHotCap=120;
const unique=(ids:readonly string[])=>new Set(ids).size===ids.length;

export function validateExpeditionDungeonHistory(world:WorldState,fail:Fail):void{
  const privateSource=(id:string)=>dungeonEvent.test(id);
  const shows=world.occasions.filter(row=>row.dungeon!==undefined);
  const hot=world.events.filter(row=>privateSource(row.id));
  const leaked=(rows:readonly {id:string}[])=>rows.some(row=>privateSource(row.id));
  if(leaked(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(row=>leaked(row.anchors))||
    world.coldHistory.chapters.some(row=>leaked(row.anchors))||
    world.chronicleCausality.nodes.some(row=>privateSource(row.eventId))||
    world.chronicleErrata.sources.some(row=>privateSource(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>privateSource(row.source.sourceEventId)))return fail(path+'.publicArchive');
  if(!shows.length&&!hot.length)return;
  const people=new Map(world.cultivators.map(row=>[row.id,row]));
  const locations=new Map(world.locations.map(row=>[row.id,row]));
  const events=new Map<string,WorldEvent>();
  for(const event of hot){
    if(events.has(event.id)||event.witnessScope!=='participants'||event.tick>world.tick||event.category!=='heavenly'||
      event.duelWinnerId!==undefined||event.dialogue!==undefined||event.damage!==undefined||
      !unique(event.actorIds)||event.actorIds.some(id=>!people.has(id)))return fail(path+'.event');
    events.set(event.id,event);
  }
  const used=new Set<string>();
  const rescueRows=new Map<string,typeof world.expeditionRescues.requests>();
  for(const rescue of world.expeditionRescues.requests){
    const index=rescueRows.get(rescue.occasionId);
    if(index)index.push(rescue);
    else rescueRows.set(rescue.occasionId,[rescue]);
  }
  const retainedRescues=world.expeditionRescues.requests.flatMap(row=>row.finishedTick===undefined?[]:[row.finishedTick]);
  const rescueRetentionBoundary=retainedRescues.length>=96?retainedRescues.reduce((earliest,tick)=>Math.min(earliest,tick),Infinity):undefined;
  const exactEvent=(id:string,tick:number,siteId:string)=>{
    const event=events.get(id);
    if(event&&(event.tick!==tick||event.locationId!==siteId))return fail(path+'.event');
    if(!event&&tick===world.tick&&(world.events.length<nativeHotCap||world.events.some(row=>row.tick<tick)))
      return fail(path+'.event');
    return event;
  };
  const artifacts=new Map<string,{name:string;tier?:string}[]>();
  for(const actor of world.cultivators){
    for(const item of actor.artifacts){
      if(!item.id?.startsWith('dungeon-loot-'))continue;
      const matches=artifacts.get(item.id);
      if(matches)matches.push(item);
      else artifacts.set(item.id,[item]);
    }
  }
  for(const show of shows){
    const run=show.dungeon!,members=new Map<string,DungeonMember>();
    const phaseOpen=run.closedTick===undefined;
    const anchor=locations.get(show.anchorSiteId??'');
    const gate=locations.get(show.locationId);
    if(show.kind!=='expedition'||!show.omenId||!anchor||anchor.type==='secret_realm'||anchor.type==='abyss'||anchor.expeditionOmenId!==undefined||
      show.id!==`occasion-${show.startedTick}-expedition`||show.locationId!==`${show.id}-gate`||
      run.openedTick<=show.registrationClosesTick||run.openedTick>=show.expiresTick||run.openedTick>world.tick||
      phaseOpen!==(run.outcome===undefined)||phaseOpen&&(show.status!=='running'||gate?.type!=='secret_realm'||gate.expeditionOmenId!==show.omenId)||
      (!phaseOpen&&(run.closedTick!<run.openedTick||run.closedTick!>show.expiresTick||run.closedTick!>world.tick))||
      !run.members.length||!run.steps.length) return fail(path+'.opening');
    for(const member of run.members){
      const actor=people.get(member.actorId),left=member.leftTick!==undefined;
      if(!actor||members.has(member.actorId)||!show.participantIds.includes(member.actorId)||
        member.enteredTick<run.openedTick||member.enteredTick>=show.expiresTick||member.enteredTick>world.tick||
        left!==(member.exit!==undefined)||left&&(member.leftTick!<member.enteredTick||
          member.leftTick!>world.tick||member.leftTick!>(run.closedTick??show.expiresTick))||
        !left&&!phaseOpen||!left&&(actor.locationId!==show.locationId||actor.positionPlane!==undefined||
          !show.remainingIds.includes(actor.id))||
        left&&show.remainingIds.includes(actor.id)||
        (member.hpLost!==undefined)!==(member.exit==='collapse')||(member.hpLost??0)>180_000_000||
        member.exit==='collapse'&&(member.leftTick!==run.closedTick||show.status==='running')||
        member.exit==='lost'&&actor.alive&&actor.hp>0&&(member.leftTick!==run.closedTick||show.status==='running'))
        return fail(path+'.member');
      if(member.exit==='rescued'){
        const asks=rescueRows.get(show.id)?.filter(row=>row.arrivedIds?.includes(actor.id))??[];
        if(!asks.some(row=>row.finishedTick===member.leftTick)&&
          (asks.length>0||rescueRetentionBoundary===undefined||member.leftTick!>rescueRetentionBoundary))
          return fail(path+'.member');
      }
      members.set(member.actorId,member);
    }
    if(phaseOpen&&run.members.every(row=>row.leftTick!==undefined))return fail(path+'.closing');
    const admitted=new Set<string>(),retreated=new Set<string>();
    let currentRoom:DungeonRoom='garden',currentBoss=bossMax,lastTick=run.openedTick,lastShared=-1;
    let actorsNow=new Set<string>(),claim:Extract<DungeonStep,{move:'claim'}>|undefined;
    let nextMember=0;
    for(const step of run.steps){
      const member=members.get(step.actorId);
      const id=`evt-${step.tick}-${show.id}-dungeon-${step.move}-${step.actorId}`;
      if(!member||step.eventId!==id||used.has(id)||step.tick<lastTick||step.tick>=show.expiresTick||
        step.tick>world.tick||step.tick>(run.closedTick??Infinity)||step.tick<member.enteredTick||
        step.tick>(member.leftTick??Infinity))return fail(path+'.step');
      if(step.tick!==lastTick)actorsNow=new Set<string>();
      lastTick=step.tick;
      if(actorsNow.has(step.actorId))return fail(path+'.step');
      actorsNow.add(step.actorId);used.add(id);
      if(step.move==='enter'){
        if(currentRoom!=='garden'||admitted.has(step.actorId)||member.enteredTick!==step.tick||
          run.members[nextMember++]?.actorId!==step.actorId)return fail(path+'.member');
        admitted.add(step.actorId);
      }else{
        if(!admitted.has(step.actorId)||retreated.has(step.actorId)||member.enteredTick>=step.tick)return fail(path+'.step');
        if(step.move==='retreat'){
          if(member.exit!==(claim?'escaped':'retreated')||member.leftTick!==step.tick)return fail(path+'.member');
          retreated.add(step.actorId);
        }else{
          if(lastShared===step.tick)return fail(path+'.step');
          lastShared=step.tick;
          if(step.move==='gather'){
            if(currentRoom!=='garden')return fail(path+'.room');
            currentRoom='hall';
          }else if(step.move==='break_array'){
            if(currentRoom!=='hall')return fail(path+'.room');
            currentRoom='sanctum';
          }else if(step.move==='strike'){
            if(currentRoom!=='sanctum'||currentBoss<=0||step.bossBefore!==currentBoss||
              !Number.isInteger(step.bossAfter)||step.bossAfter<Math.max(0,currentBoss-45)||
              step.bossAfter>Math.max(0,currentBoss-20)||step.hpLost>100_000_000||
              step.bossAfter===0&&step.hpLost!==0)return fail(path+'.boss');
            currentBoss=step.bossAfter;
          }else if(step.move==='claim'){
            if(currentRoom!=='sanctum'||currentBoss!==0||claim||step.artifactId!==`dungeon-loot-${show.id}`)
              return fail(path+'.claim');
            const copies=artifacts.get(step.artifactId)??[];
            if(copies.length>1||copies.some(item=>item.name!=='藏星古钥'||item.tier!=='法宝'))return fail(path+'.claim');
            claim=step;
          }
        }
      }
      const event=exactEvent(id,step.tick,show.locationId);
      if(event&&step.move==='strike'&&event.description!==SHARE_SAVE_REDACTED_TEXT&&
        event.description!==(step.bossAfter>0?`亲身出战者损失${step.hpLost}点气血；妖王尚有${step.bossAfter}点气血。`:
          '此招落定，妖王确已伏倒，宝物仍须亲取。'))return fail(path+'.boss');
      if(event&&(event.actorIds[0]!==step.actorId||event.actorIds.slice(1).some(id=>
        !admitted.has(id)||retreated.has(id)||members.get(id)!.leftTick!==undefined&&members.get(id)!.leftTick!<step.tick)||
        step.move==='enter'&&event.actorIds.length!==(nextMember===1?1:2)||
        (step.move!=='enter'&&step.move!=='retreat')&&event.actorIds.slice(1).some(id=>
          run.members.findIndex(row=>row.actorId===id)<run.members.indexOf(member))))return fail(path+'.event');
    }
    if(nextMember!==run.members.length||run.steps[0].tick!==run.openedTick||
      run.members.some(row=>(row.exit==='retreated'||row.exit==='escaped')!==retreated.has(row.actorId)))
      return fail(path+'.member');
    if(run.room!==currentRoom||run.bossHp!==currentBoss)return fail(path+'.room');
    const collapsed=run.members.filter(row=>row.exit==='collapse');
    if(!phaseOpen){
      const expected=collapsed.length?'collapsed':claim?'claimed':
        run.members.some(row=>row.exit==='retreated'||row.exit==='rescued')?'retreated':'lost';
      if(run.outcome!==expected||run.closedTick!==Math.max(...run.members.map(row=>row.leftTick!)))return fail(path+'.closing');
    }
    if(collapsed.length){
      const tick=run.closedTick!,id=`evt-${tick}-${show.id}-dungeon-collapse`;
      used.add(id);
      const event=exactEvent(id,tick,show.locationId);
      if(event&&(event.actorIds.length!==collapsed.length||event.actorIds.some((id,index)=>id!==collapsed[index].actorId)))
        return fail(path+'.event');
    }
  }
  if(hot.some(row=>!used.has(row.id)))return fail(path+'.event');
}
