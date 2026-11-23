import {afterEach,expect,it,vi} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
it('keeps the same sect and disciples when an authorized Cognitive reply settles in the first real month',async()=>{
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const management=world?.sectManagement;
  const actor=management&&world?.cultivators.find(person=>person.id===management.foundingDiscipleIds[0]);
  if(!world||!management||!actor)throw Error('Managed world missing an original disciple');
  const fake=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
    chosenAction:'REST',innerMonologue:'先在山门歇一歇。',
  })}}]})));
  vi.stubGlobal('fetch',fake);
  const order=await requestCultivatorLLMDecision(actor,world,{enabled:true,apiBaseUrl:'https://mock.invalid/v1',apiKey:'fixture',model:'mock'},world.tick+1);
  expect(fake).toHaveBeenCalledTimes(1);
  expect(order?.chosenAction).toBe('REST');
  if(!order)throw Error('Expected one exact legal mocked order');
  const requested={[actor.id]:order};
  const utility=advanceWorldTick(world,requested);
  const cognitive=advanceWorldTick(world,requested,undefined,'deferred',undefined,{modelActors:new Set([actor.id])});
  const {growth,comedy,recurring,chat,...continued}=cognitive.sectManagement!;
  expect(continued).toEqual(management);
  expect(world.sectManagement?.growth).toBeUndefined();
  expect(world.sectManagement?.comedy).toBeUndefined();
  expect(world.sectManagement?.recurring).toBeUndefined();
  expect(world.sectManagement?.chat).toBeUndefined();
  expect(chat?.months).toEqual([expect.objectContaining({tick:cognitive.tick,posts:expect.any(Array)})]);
  expect(recurring?.openedTick).toBe(cognitive.tick);
  expect(growth).toMatchObject({closing:{tick:cognitive.tick,overduePrincipal:0,negativeMonths:0,livingDisciples:3}});
  expect(comedy?.moments).toEqual([expect.objectContaining({tick:cognitive.tick,source:expect.objectContaining({phase:'ambient'}),effects:[]})]);
  expect(cognitive.sectManagement).toEqual(utility.sectManagement);
  expect(cognitive.cultivators.find(person=>person.id===actor.id)?.quirks).toEqual(actor.quirks);
  expect(cognitive.cultivators.find(person=>person.id===actor.id)?.currentAction).toBe('REST');
  expect(cognitive.playerAvatar.possessedId).toBeUndefined();
});
