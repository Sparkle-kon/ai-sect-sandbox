import {describe,expect,it} from 'vitest';
import {decodeEraDesignDraft} from '../src/engine/eraDesignDraft';
import {decodeScenarioFixture,encodeScenarioFixture,replayScenario} from '../src/engine/scenarioEngine';

const v1='{"format":"ai-sect-scenario","version":1,"ruleset":1,"seed":2031,"profileId":"classic","endTick":3,"commands":[{"tick":2,"command":{"type":"SPAWN_TREASURE","targetLocationId":"loc-danxia"}}]}';
const v2='{"format":"ai-sect-scenario","version":2,"ruleset":1,"seed":2031,"profileId":"classic","endTick":3,"commands":[{"tick":2,"command":{"type":"SPAWN_TREASURE","targetLocationId":"loc-danxia"}}],"objectives":[{"kind":"cultivator_survives","actorId":"npc-6"},{"kind":"living_population","minimum":1},{"kind":"site_qi","locationId":"loc-danxia","minimum":75},{"kind":"sect_treasury","sectId":"sect-danxia","minimum":1}]}';
const v3='{"format":"ai-sect-scenario","version":3,"ruleset":1,"seed":2031,"profileId":"classic","endTick":3,"commands":[],"objectives":[{"kind":"danxia_medicine_outcome","actorId":"npc-6","settlementId":"village-loc-market","required":"delivered"}]}';

describe('legacy replay documents are not future authoring drafts',()=>{
  it.each([
    [1,v1,'scenario-be71de3aa4911ca1fbf73f15ca6459b9'],
    [2,v2,'scenario-8dba7104096a0bd6506da56bd170a168'],
    [3,v3,'scenario-5d27b85cb052d911d048530ecb4f02bd'],
  ] as const)('preserves V%s bytes, native replay identity and existing outcome type', (version,raw,id)=>{
    expect(()=>decodeEraDesignDraft(raw)).toThrow(expect.objectContaining({code:'schema'}));
    const portable=decodeScenarioFixture(raw);
    expect(encodeScenarioFixture(portable)).toBe(raw);
    const played=replayScenario(portable);
    expect(played.scenarioOrigin).toEqual({version,id,ruleset:1,endTick:3});
    expect(played.tick).toBe(3);
    if(version===1)expect(played.scenarioAudit).toBeUndefined();
    else if(version===2)expect(played.scenarioAudit?.cards).toHaveLength(4);
    else expect(played.scenarioAudit?.cards[0]).toMatchObject({objective:{kind:'danxia_medicine_outcome'},passed:false,
      evidence:{kind:'danxia_medicine_outcome',verified:false}});
  });
});
