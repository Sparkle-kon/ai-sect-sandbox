import {describe,it,expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {createEraDesignDraft,eraDesignCatalog} from '../src/engine/eraDesignDraft';
import {applyAuthoredEraDesign} from '../src/engine/authoredEraEngine';
const checks={baselineDigest:'a'.repeat(64),designDigest:'b'.repeat(64),rulesRevision:'native-rule-1'};
describe('actual authored future',()=>{
it('retains native history and real ages atomically',()=>{
  const start=createInitialWorld(2031,'spirit-bloom');
  const baseline=advanceWorldTick(start);
  const candidates=eraDesignCatalog(2031,'spirit-bloom').danxiaMembers;
  const chosen=candidates.filter(actor=>baseline.cultivators.some(person=>person.id===actor.id&&person.locationId==='loc-danxia')).slice(0,3).map(actor=>actor.id);
  const target={year:baseline.year,month:baseline.month};
  const anchor={year:start.year,month:start.month};
  const draft=createEraDesignDraft(2031,'spirit-bloom',anchor,target,[
    {kind:'jade_vein_depleted',siteId:'loc-vein-north',spiritQi:50,jadeCapacity:0},
    {kind:'danxia_branch_moves_north',destinationId:'loc-vein-north',memberIds:chosen,stones:100},
  ]);
  const frozen=structuredClone(baseline);
  const result=applyAuthoredEraDesign(draft,baseline,checks);
  expect(result).not.toBe(baseline);
  expect(baseline).toEqual(frozen);
  expect(result.events).toEqual(baseline.events);
  expect(result.cultivators.map(row=>[row.id,row.age,row.hp])).toEqual(baseline.cultivators.map(row=>[row.id,row.age,row.hp]));
  expect(result.authoredEraOrigin?.effects[1]).toMatchObject({kind:'danxia_branch_moves_north',memberIds:[...chosen].sort()});
  expect(advanceWorldTick(result).tick).toBe(result.tick+1);
  const unavailable=createEraDesignDraft(2031,"spirit-bloom",anchor,target,[draft.conditions[0],
    {kind:"danxia_branch_moves_north",destinationId:"loc-vein-north",memberIds:["npc-6",...chosen.slice(1)],stones:100}]);
  expect(()=>applyAuthoredEraDesign(unavailable,baseline,checks)).toThrow(/不自动补人/);
  expect(baseline).toEqual(frozen);
});
});
