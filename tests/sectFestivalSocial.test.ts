import {expect,it} from 'vitest';
import {marketClosureReason} from '../src/engine/marketEngine';
import {quoteSectJob} from '../src/engine/sectJobs';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {SectJobObservation} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const resting:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'守静。'};
const rest=(world:WorldState)=>Object.fromEntries(world.cultivators.map(actor=>[actor.id,resting]));

it('联谊只在开市坊间与真实外门道友当面论道，无人同席或过季时不报交谈',()=>{
  let world=createManagedSectWorld(13071,'classic','drunken-sword-hermitage',0)!;
  while(world.month!==4)world=advanceWorldTick(world,rest(world),()=>.35);
  const disciple=world.cultivators.find(actor=>actor.id===world.sectManagement!.foundingDiscipleIds[0])!;
  const market=world.locations.find(site=>site.type==='market'&&!marketClosureReason(world,site.id)&&
    !marketClosureReason({...world,tick:world.tick+1},site.id))!;
  const neighbors=world.cultivators.filter(actor=>actor.id!==disciple.id&&actor.sectId!==disciple.sectId&&actor.alive&&actor.hp>0&&!actor.positionPlane).slice(0,3);
  expect(neighbors).toHaveLength(3);
  disciple.locationId=market.id;
  for(const actor of world.cultivators){
    if(actor!==disciple&&actor.locationId===market.id)actor.locationId=world.sectManagement!.homeSiteId;
  }
  expect(quoteSectJob(world,disciple,'festival-social').kind).toBe('blocked');
  for(const actor of neighbors)actor.locationId=market.id;
  const planned=quoteSectJob(world,disciple,'festival-social');
  expect(planned).toMatchObject({kind:'native',phase:'performed',decision:{chosenAction:'SOCIALIZE'}});
  if(planned.kind!=='native')throw new Error('The fixture needs a real speaker');
  expect(neighbors.map(actor=>actor.id)).toContain(planned.decision.targetCultivatorId);

  let observations:readonly SectJobObservation[]|undefined;
  const settled=advanceWorldTick(world,rest(world),()=>.35,'utility',undefined,{
    sectJobAssignments:[{discipleId:disciple.id,jobId:'festival-social'}],
    onSectJobsSettled:rows=>{observations=rows;},
  });
  expect(settled.month).toBe(5);
  expect(observations?.[0]).toMatchObject({phase:'performed',siteId:market.id,
    line:'和在场道友说过几句。'});
  const receipt=settled.events.find(event=>event.id===observations?.[0].sourceEventId);
  expect(receipt).toMatchObject({tick:settled.tick,locationId:market.id,
    actorIds:[disciple.id,planned.decision.targetCultivatorId]});
  expect(quoteSectJob(settled,settled.cultivators.find(actor=>actor.id===disciple.id)!,'festival-social').kind).toBe('blocked');
});
