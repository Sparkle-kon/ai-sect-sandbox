import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {readTimelineSnapshot} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload} from '../src/types/world';

const noop=()=>{};
it('只向当前分支本月原场扣一次赏钱；迟到的同样请求无效',async()=>{
  const born=createManagedSectWorld(13071,'classic','drunken-sword-hermitage',0);
  if(!born?.sectManagement)throw new Error('Expected managed world');
  const {leaderId,sectId}=born.sectManagement,leader=born.cultivators.find(actor=>actor.id===leaderId);
  if(!leader)throw new Error('Expected native leader');
  leader.realm='筑基';leader.realmStage=9;leader.qiProgress=100;
  const decisions:Record<string,LLMDecisionPayload>=Object.fromEntries(born.cultivators.map(actor=>[actor.id,
    actor.id===leaderId?{chosenAction:'BREAKTHROUGH',innerMonologue:'且依法引雷。'}:
      {chosenAction:'REST',innerMonologue:'在此处候着。'}]));
  const finished=advanceWorldTick(born,decisions,()=>.2,'utility',undefined,{capturePresentation:false});
  const show=finished.sectManagement?.live?.shows.find(row=>row.kind==='tribulation');
  const original=finished.sects.find(row=>row.id===sectId);
  if(!show||!original)throw new Error('Expected actual native broadcast and treasury');
  let stage=0,controls:ReturnType<typeof useWorldSimulationController>|undefined;
  function Harness(){
    const current=useWorldSimulationController({
      playbackEnabled:false,inspectCampaign:false,onActivate:noop,onHistoricalPreview:noop,onPreviewContextChange:noop,
    });
    controls=current;
    if(stage===0){
      stage++;
      if(!current.replaceWorld(finished,current.authority.current,current.saveContextVersion.current))
        throw new Error('Expected current game branch only');
    }
    return <output data-month={current.world.tick}/>;
  }
  renderToStaticMarkup(<Harness/>);
  const controller=controls;
  if(!controller)throw new Error('Expected mounted controller');
  const timeline=controller.history.current,revision=controller.saveContextVersion.current;
  const command={kind:'gift',showId:show.id} as const;
  expect(controller.manageSectLive(finished,timeline,revision,command)).toBe(true);
  expect(controller.manageSectLive(finished,timeline,revision,command)).toBe(false);
  const actual=controller.authority.current;
  expect(actual.tick).toBe(finished.tick);
  expect(actual.random).toEqual(finished.random);
  expect(actual.events).toEqual(finished.events);
  expect(actual.sects.find(row=>row.id===sectId)?.spiritStones).toBe(original.spiritStones-3);
  expect(actual.sects.find(row=>row.id===sectId)?.reputation).toBe(original.reputation+1);
  expect(finished.sectManagement?.live?.shows[0].gift).toBeUndefined();
  expect(readTimelineSnapshot(controller.history.current,actual.tick)?.sectManagement?.live)
    .toEqual(actual.sectManagement?.live);
  expect(controller.manageSectLive(actual,controller.history.current,revision,command)).toBe(false);
});
