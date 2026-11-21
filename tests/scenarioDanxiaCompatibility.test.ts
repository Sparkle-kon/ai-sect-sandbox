import {describe,expect,it} from 'vitest';
import {createScenarioFixture,decodeScenarioFixture,encodeScenarioFixture,replayScenario,scenarioInitialTargets} from '../src/engine/scenarioEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';

const PRE_V3_ONE='{"format":"ai-sect-scenario","version":1,"ruleset":1,"seed":2031,"profileId":"classic","endTick":3,"commands":[{"tick":2,"command":{"type":"SPAWN_TREASURE","targetLocationId":"loc-danxia"}}]}';
const PRE_V3_TWO='{"format":"ai-sect-scenario","version":2,"ruleset":1,"seed":2031,"profileId":"classic","endTick":3,"commands":[{"tick":2,"command":{"type":"SPAWN_TREASURE","targetLocationId":"loc-danxia"}}],"objectives":[{"kind":"cultivator_survives","actorId":"npc-6"},{"kind":"living_population","minimum":1},{"kind":"site_qi","locationId":"loc-danxia","minimum":75},{"kind":"sect_treasury","sectId":"sect-danxia","minimum":1}]}';
const REQUIRED={kind:'danxia_medicine_outcome',actorId:'npc-6',settlementId:'village-loc-market',required:'delivered'} as const;

describe('portable Danxia process objectives and past endpoint-only formats',()=>{
  it('keeps exact old files and stable digest, including all native old endpoint objectives',()=>{
    const v1=replayScenario(decodeScenarioFixture(PRE_V3_ONE)),v2=replayScenario(decodeScenarioFixture(PRE_V3_TWO));
    expect(encodeScenarioFixture(decodeScenarioFixture(PRE_V3_ONE))).toBe(PRE_V3_ONE);
    expect(encodeScenarioFixture(decodeScenarioFixture(PRE_V3_TWO))).toBe(PRE_V3_TWO);
    expect(v1.scenarioOrigin).toEqual({version:1,ruleset:1,id:'scenario-be71de3aa4911ca1fbf73f15ca6459b9',endTick:3});
    expect(v1.scenarioAudit).toBeUndefined();
    expect(v2.scenarioOrigin).toEqual({version:2,ruleset:1,id:'scenario-8dba7104096a0bd6506da56bd170a168',endTick:3});
    const oldObjectiveKinds=['cultivator_survives','living_population','site_qi','sect_treasury'];
    expect(v2.scenarioAudit?.cards.map(card=>card.objective.kind)).toEqual(oldObjectiveKinds);
    expect(decodeWorldSave(encodeWorldSave(v2)).scenarioAudit).toEqual(v2.scenarioAudit);
  });

  it('adds only v3 typed initial actor/settlement references; an old horizon or a forged positive merits no credit',()=>{
    expect(scenarioInitialTargets(2031,'classic').settlements.map(item=>item.id)).toContain(REQUIRED.settlementId);
    const goal=createScenarioFixture(2031,'classic',3,[],[{kind:'living_population',minimum:1},REQUIRED]);
    expect(goal.version).toBe(3);
    expect(decodeScenarioFixture(encodeScenarioFixture(goal))).toEqual(goal);
    expect(()=>encodeScenarioFixture({...goal,version:2})).toThrow(expect.objectContaining({code:'schema'}));
    expect(()=>encodeScenarioFixture({...goal,objectives:[{kind:'living_population',minimum:1}]})).toThrow(expect.objectContaining({code:'schema'}));
    for(const patch of [{actorId:'npc-6-same-name'},{settlementId:'loc-market'},{required:'arrived'}, {patientId:'manual-hidden-patient'}]){
      expect(()=>encodeScenarioFixture({...goal,objectives:[{...REQUIRED,...patch}]})).toThrow();
    }
    const resolved=replayScenario(goal);
    const card=resolved.scenarioAudit!.cards[1];
    expect(card).toEqual({id:'objective-2',objective:REQUIRED,passed:false,evidence:{kind:REQUIRED.kind,verified:false}});
    expect(decodeWorldSave(encodeWorldSave(resolved)).scenarioAudit).toEqual(resolved.scenarioAudit);
    Object.assign(card,{passed:true,evidence:{kind:REQUIRED.kind,verified:true}});
    expect(()=>encodeWorldSave(resolved)).toThrow(/danxiaProof/);
  });
});
