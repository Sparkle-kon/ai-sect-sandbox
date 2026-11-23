import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {readTimelineSnapshot} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload} from '../src/types/world';

const noop=()=>{};
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'这一月且歇。'};

it('朋友圈互动只写回当前分支的一张旧照片，不推进月份或重写已经结下的差事',async()=>{
  const born=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!born?.sectManagement)throw new Error('Expected managed world');
  const cookId=born.sectManagement.foundingDiscipleIds[0];
  const cook=born.cultivators.find(actor=>actor.id===cookId);
  if(!cook)throw new Error('Expected native cook');
  cook.herbs.jade_leaf=2;
  const finished=advanceWorldTick(born,Object.fromEntries(born.cultivators.map(actor=>[actor.id,rest])),
    ()=>.12,'utility',undefined,{sectJobAssignments:[{discipleId:cookId,jobId:'kitchen'}],capturePresentation:false});
  const meal=finished.sectManagement?.moments?.posts.find(post=>post.kind==='food');
  if(!meal)throw new Error('Expected the actual shared meal photo');
  let stage=0;
  let controls:ReturnType<typeof useWorldSimulationController>|undefined;
  function Harness(){
    const current=useWorldSimulationController({
      playbackEnabled:false,inspectCampaign:false,onActivate:noop,onHistoricalPreview:noop,onPreviewContextChange:noop,
    });
    controls=current;
    if(stage===0){
      stage++;
      if(!current.replaceWorld(finished,current.authority.current,current.saveContextVersion.current))
        throw new Error('Expected the real finished month to become active');
    }
    return <output data-month={current.world.tick}/>;
  }
  renderToStaticMarkup(<Harness/>);
  const controller=controls;
  if(!controller)throw new Error('Expected mounted controller');
  const originalTimeline=controller.history.current,revision=controller.saveContextVersion.current;
  const command={kind:'like',postId:meal.id} as const;
  const [accepted,stale]=await Promise.all([
    controller.manageSectMoment(finished,originalTimeline,revision,command),
    controller.manageSectMoment(finished,originalTimeline,revision,command),
  ]);
  expect([accepted,stale]).toEqual([true,false]);
  const actual=controller.authority.current;
  expect(actual).not.toBe(finished);
  expect(actual.sectManagement?.moments?.posts.find(post=>post.id===meal.id)?.playerLiked).toBe(true);
  expect(finished.sectManagement?.moments?.posts.find(post=>post.id===meal.id)?.playerLiked).toBeUndefined();
  expect(actual.tick).toBe(finished.tick);
  expect(actual.random).toEqual(finished.random);
  expect(actual.events).toEqual(finished.events);
  expect(actual.sectManagement?.latestReport).toEqual(finished.sectManagement?.latestReport);
  expect(readTimelineSnapshot(controller.history.current,actual.tick)?.sectManagement?.moments).toEqual(actual.sectManagement?.moments);
  expect(await controller.manageSectMoment(actual,originalTimeline,revision,command)).toBe(false);
});
