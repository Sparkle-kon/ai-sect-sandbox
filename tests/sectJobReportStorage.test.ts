import { describe, expect, it } from 'vitest';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { SectJobReport } from '../src/types/sectJobs';
import type { LLMDecisionPayload } from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'这一回先歇着。'};
function testMeeting(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
  const state=world.sectManagement!;
  const [guard,cultivate]=state.foundingDiscipleIds;
  const old=encodeEraWorldSave(world);
  expect(decodeEraWorldSave(old).sectManagement?.latestReport).toBeUndefined();
  expect(encodeEraWorldSave(decodeEraWorldSave(old))).toBe(old);
  const orders=Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest]));
  const after=advanceWorldTick(world,orders,()=>.99,'utility',undefined,{
    sectJobAssignments:[{discipleId:guard,jobId:'guard'},{discipleId:cultivate,jobId:'cultivate'}],
  });
  const report=after.sectManagement!.latestReport;
  if(!report)throw Error('Expected live engine report after actual monthly assignments');
  return {world,after,report,guard,cultivate};
}

describe('portable native monthly report',()=>{
  it('roundtrips a native report, unchanged by normal share redaction or subsequent time',()=>{
    const {world,after,report,guard}=testMeeting();
    expect(report).toMatchObject({openedTick:world.tick,settledTick:after.tick,rows:[
      {discipleId:guard,phase:'performed',sourceEventId:`evt-${after.tick}-${guard}-management-guard`},
      {phase:'performed'},
    ]});
    const encoded=encodeEraWorldSave(after);
    expect(encodeEraWorldSave(decodeEraWorldSave(encoded))).toBe(encoded);
    const approval=prepareShareSavePrivacy(after);
    expect(approval.status).toBe('ready');
    const shared=buildConfirmedShareSave(after,approval);
    expect(shared&&decodeWorldSave(shared.json).sectManagement?.latestReport).toEqual(report);

    const later=advanceWorldTick(after,Object.fromEntries(after.cultivators.map(actor=>[actor.id,rest])),()=>.99);
    const leaving=later.cultivators.find(actor=>actor.id===guard)!;
    leaving.sectId='';leaving.sectRank='外门弟子';
    // A bounded raw event can have dropped out of the hot tail; the report does not need it.
    const receipt=report.rows[0].sourceEventId;
    later.events=later.events.filter(event=>event.id!==receipt);
    expect(decodeEraWorldSave(encodeEraWorldSave(later)).sectManagement?.latestReport).toEqual(report);
  });

  it('rejects false origin, unsupported effects, duplicate assigned actors and crossed retained receipts',()=>{
    const {after,report,cultivate}=testMeeting();
    for(const invalid of [
      {...report,settledTick:report.settledTick+1},
      {...report,leaderId:'npc-1'},
      {...report,rows:[report.rows[0],report.rows[0]]},
      {...report,rows:[{...report.rows[0],discipleId:cultivate}]},
      {...report,rows:[{...report.rows[0],phase:'on_route'}]},
      {...report,rows:[{...report.rows[0],tier:'disaster',effects:[{kind:'hp',stage:'follow_up',amount:-61}]}]},
      {...report,rows:[{...report.rows[0],tier:'success',effects:[{kind:'herb',herbId:'jade_leaf',stage:'native',amount:1}]}]},
    ] satisfies SectJobReport[]){
      const copy=structuredClone(after);
      copy.sectManagement!.latestReport=invalid;
      expect(()=>encodeEraWorldSave(copy)).toThrow(/sectManagement.latestReport/u);
    }
  });
});
