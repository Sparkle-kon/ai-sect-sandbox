import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {projectStoryHomepage} from '../src/engine/storyHomepage';
import {enterStoryLead,orderStoryAvatar,projectStoryPlayerRole,storyOrderOutcome} from '../src/components/storyPlayerController';
import {possessAvatar} from '../src/engine/avatarEngine';

const findDefaultLead=()=>{
  let world=createInitialWorld();
  for(let i=0;i<4;i++)world=advanceWorldTick(world);
  const lead=projectStoryHomepage(world).lead;
  if(!lead)throw Error('默认场景未产生有据主角。');
  return {world,lead};
};

describe('player choices from the story home use the exact native avatar',()=>{
  it('does not offer an invented protagonist before any evidence',()=>{
    const world=createInitialWorld();
    expect(projectStoryPlayerRole(world)).toEqual({kind:'ensemble'});
    expect(orderStoryAvatar(world,'REST')).toBe(world);
    expect(enterStoryLead(world,world.cultivators[0])).toBe(world);
  });

  it('proves exact identity, charges native costs once and leaves the actual turn for Continue',()=>{
    const {world,lead}=findDefaultLead();
    const before=JSON.stringify(world),sameName=world.cultivators.find(actor=>actor.id!==lead.id)!;
    expect(enterStoryLead(world,{id:sameName.id,name:lead.name})).toBe(world);
    expect(projectStoryPlayerRole(world,lead)).toMatchObject({kind:'observer',name:lead.name,canEnter:true});
    const entered=enterStoryLead(world,lead);
    expect(entered.playerAvatar).toMatchObject({essence:76,possessedId:lead.id});
    expect(entered.playerAvatar.pendingOrder).toBeUndefined();
    expect(entered.tick).toBe(world.tick);
    expect(projectStoryPlayerRole(entered,lead)).toMatchObject({kind:'playing',isLead:true,canOrder:true});
    expect(enterStoryLead(entered,lead)).toBe(entered);
    const queued=orderStoryAvatar(entered,'REST');
    expect(queued.tick).toBe(world.tick);
    expect(queued.playerAvatar).toMatchObject({essence:71,pendingOrder:{actorId:lead.id,action:'REST',queuedTick:world.tick}});
    expect(projectStoryPlayerRole(queued,lead)).toMatchObject({queued:'REST',canOrder:false});
    expect(orderStoryAvatar(queued,'CULTIVATE')).toBe(queued);
    const next=advanceWorldTick(queued);
    expect(next.tick).toBe(world.tick+1);
    expect(next.cultivators.find(person=>person.id===lead.id)?.currentAction).toBe('REST');
    expect(next.playerAvatar.pendingOrder).toBeUndefined();
    expect(storyOrderOutcome(queued,next)).toBe('这月，叶连翘依你的安排调息了。');
    expect(storyOrderOutcome(queued,entered)).toBeUndefined();
    const row=next.decisionTrace.records.find(trace=>trace.actorId===lead.id&&trace.tick===next.tick)!;
    row.source='utility';
    expect(storyOrderOutcome(queued,next)).toBe('已到下个月，未能确认叶连翘按安排调息。');
    expect(JSON.stringify(world)).toBe(before);
  });

  it('keeps a current different role and reserved order, even if the proven lead has the same display name',()=>{
    const {world,lead}=findDefaultLead();
    const other=world.cultivators.find(actor=>actor.id!==lead.id&&actor.alive)!;
    other.name=lead.name;
    expect(possessAvatar(world,other.id)).toBe(true);
    const queued=orderStoryAvatar(world,'CULTIVATE');
    expect(projectStoryPlayerRole(queued,lead)).toMatchObject({kind:'playing',name:lead.name,isLead:false,queued:'CULTIVATE'});
    expect(enterStoryLead(queued,lead)).toBe(queued);
  });

  it('never charges for a body unavailable for a first actual turn',()=>{
    const {world,lead}=findDefaultLead();
    world.playerAvatar.essence=28;
    expect(projectStoryPlayerRole(world,lead)).toMatchObject({kind:'observer',canEnter:false});
    expect(enterStoryLead(world,lead)).toBe(world);
    world.playerAvatar.essence=100;
    world.cultivators.find(person=>person.id===lead.id)!.alive=false;
    expect(enterStoryLead(world,lead)).toBe(world);
  });
});
