import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {AgentInspector} from '../src/components/AgentInspector';
import {HeartDemonAftermathRead} from '../src/components/HeartDemonAftermathRead';
import {hasGuidedHeartDemonRecoveryReceipt,resolveGuidedHeartDemonRecoveryTurn,type GuidedHeartDemonRecoveryTurn} from '../src/controllers/guidedHeartDemonRecoveryTurn';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import {resolveHeartDemonRecovery} from '../src/engine/heartDemonAftermathEngine';

function fixture(){
  const world=createInitialWorld();
  const [actor,outsider]=world.cultivators;
  const trialId='private-trial-id';
  actor.qiProgress=35;
  actor.secretGoal='private-X-do-not-show';
  actor.innerMonologue='private-Y-do-not-show';
  actor.heartDemonAftermath={trialId,resultEventId:'private-source-id',siteId:actor.locationId,resolvedTick:world.tick,
    choice:'wrath',outcome:'failed',endsTick:world.tick+6};
  expect(possessAvatar(world,actor.id)).toBe(true);
  const request:GuidedHeartDemonRecoveryTurn={kind:'heart-demon-recovery',world,branchId:'current-branch',revision:42,
    actorId:actor.id,option:{action:'REST',targetHeartDemonAftermathId:trialId}};
  return {world,actor,outsider,request};
}

describe('private heart-demon aftermath',()=>{
  it('has one current-owner action for that real cost, no private source/memory, and no historical action',()=>{
    const {world,actor,outsider}=fixture();
    const guide=vi.fn(async()=>true),controls={busy:false,guide};
    const live=renderToStaticMarkup(<HeartDemonAftermathRead world={world} actor={actor} live controls={controls}/>);
    expect(live).toContain('仅本人可见');
    expect(live).toContain('余火未熄');
    expect(live).toContain('成时实耗 16 真气');
    expect(live.match(/<button\b/g)).toHaveLength(1);
    expect(live).not.toContain('private-');
    expect(guide).not.toHaveBeenCalled();
    const old=renderToStaticMarkup(<HeartDemonAftermathRead world={world} actor={actor} live={false} controls={controls}/>);
    expect(old).toContain('本人旧卷');
    expect(old).not.toContain('<button');
    expect(renderToStaticMarkup(<HeartDemonAftermathRead world={world} actor={outsider} live controls={controls}/>)).toBe('');
    expect(renderToStaticMarkup(<HeartDemonAftermathRead world={world} actor={{...actor}} live controls={controls}/>)).toBe('');
  });

  it('lives only in the existing owned mind panel without changing the inspector header',()=>{
    const {world,actor,outsider}=fixture();
    const controls={busy:false,guide:vi.fn(async()=>true)}, select=vi.fn();
    const render=(subject=actor,workspaceSection:'profile'|'mind'='mind',live=true)=>renderToStaticMarkup(
      <AgentInspector world={world} cultivator={subject} workspaceSection={workspaceSection} onSelectCultivator={select}
        allowPersonalThought={live} heartDemonRecoveryControls={controls}/>);
    const live=render();
    expect(live.match(/心魔余波/g)).toHaveLength(1);
    expect(live).toContain('静室收心');
    const former=render(actor,'mind',false);
    expect(former).toContain('本人旧卷');
    expect(former).not.toContain('>静室收心</button>');
    expect(render(outsider)).not.toContain('心魔余波');
    const profile=render(actor,'profile');
    expect(profile).toContain('当前：');
    expect(profile).not.toContain('心魔余波');
    expect(controls.guide).not.toHaveBeenCalled();
  });

  it('rejects a stale actor, branch, frame or trial instead of silently using ordinary REST',()=>{
    const {world,request,outsider}=fixture();
    const resolve=(order=request,current=world,branch='current-branch',revision=42)=>resolveGuidedHeartDemonRecoveryTurn(order,current,branch,revision);
    expect(resolve()).toMatchObject({actorId:request.actorId,decision:{chosenAction:'REST',targetHeartDemonAftermathId:'private-trial-id'}});
    expect(resolve({...request,actorId:outsider.id})).toBeUndefined();
    expect(resolve(request,structuredClone(world))).toBeUndefined();
    expect(resolve(request,world,'sibling')).toBeUndefined();
    expect(resolve(request,world,'current-branch',43)).toBeUndefined();
    expect(resolve({...request,option:{action:'REST',targetHeartDemonAftermathId:'wrong-trial'}})).toBeUndefined();
  });

  it('requires exact next-month private receipt and shows recovered without offering to pay twice',()=>{
    const {world,actor,request}=fixture();
    const result=structuredClone(world);
    const nativeBody=result.cultivators.find(row=>row.id===actor.id)!;
    result.tick++;
    const settled=resolveHeartDemonRecovery(result,nativeBody,request.option.targetHeartDemonAftermathId);
    expect(settled).not.toBeNull();
    expect(hasGuidedHeartDemonRecoveryReceipt(request,result)).toBe(false);
    if(!settled)throw new Error('missing native recovery fixture');
    result.events.push(settled);
    expect(hasGuidedHeartDemonRecoveryReceipt(request,result)).toBe(true);
    const html=renderToStaticMarkup(<HeartDemonAftermathRead world={result} actor={nativeBody} live
      controls={{busy:false,guide:vi.fn(async()=>true)}}/>);
    expect(html).toContain('已在静室收心');
    expect(html).not.toContain('<button');
    expect(html).not.toContain(settled.id);
  });
});
