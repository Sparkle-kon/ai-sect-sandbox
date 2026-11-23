import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { effectiveSectQuirks, ensureManagedSectQuirks } from '../src/engine/sectQuirkAssignment';
import { availableSettlementActions } from '../src/engine/settlementEngine';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { SECT_QUIRK_IDS } from '../src/types/sectManagement';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const seed = 9;
const start = () => createManagedSectWorld(seed,'classic','qingyun-odd-jobs',0)!;
const rest: LLMDecisionPayload = { chosenAction:'REST',innerMonologue:'这个月留在原地。' };
function month(world:WorldState, choices:Readonly<Record<string,LLMDecisionPayload>>={}, mode:'utility'|'deferred'='utility') {
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??rest])),()=>.99,mode);
}

describe('stable NPC quirks in genuine managed worlds',()=>{
  it('assigns bounded repeatable selections only to real sect NPCs, never alters legacy bytes or RNG',()=>{
    const classic=createInitialWorld(seed,'classic');
    const legacy=encodeEraWorldSave(classic);
    ensureManagedSectQuirks(classic);
    expect(encodeEraWorldSave(classic)).toBe(legacy);
    const world=start(),clone=start();
    expect(world.random).toEqual(classic.random);
    const founder=world.sectManagement!.leaderId;
    const leaders=new Set(world.sects.flatMap(sect=>sect.leaderId??[]));
    const shouldHave=world.cultivators.filter(row=>row.alive&&row.hp>0&&row.sectId&&row.id!==founder&&!leaders.has(row.id)&&
      row.positionPlane!=='immortal'&&row.sectRank!=='掌门');
    expect(shouldHave.length).toBeGreaterThan(world.sectManagement!.foundingDiscipleIds.length);
    for(const actor of world.cultivators){
      const quirks=actor.quirks;
      if(!shouldHave.includes(actor)){ expect(quirks).toBeUndefined(); continue; }
      expect(quirks?.length).toBeGreaterThanOrEqual(1);
      expect(quirks?.length).toBeLessThanOrEqual(2);
      expect(new Set(quirks).size).toBe(quirks?.length);
      expect(quirks?.every(quirk=>SECT_QUIRK_IDS.includes(quirk))).toBe(true);
      expect(quirks).toEqual(clone.cultivators.find(row=>row.id===actor.id)?.quirks);
    }
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(world)))).toBe(encodeEraWorldSave(world));
  });

  it('does not rewrite an H1-1 save, uses the same projected trait on the next month, and never redraws it',()=>{
    const world=start(),state=world.sectManagement!;
    for(const actor of world.cultivators)if(!state.foundingDiscipleIds.includes(actor.id))delete actor.quirks;
    const oldBytes=encodeEraWorldSave(world);
    const reopened=decodeEraWorldSave(oldBytes);
    const known=reopened.cultivators.find(row=>row.sectId&&row.id!==state.leaderId&&row.sectRank!=='掌门'&&
      !state.foundingDiscipleIds.includes(row.id))!;
    expect(known.quirks).toBeUndefined();
    const predicted=effectiveSectQuirks(reopened,known);
    expect(predicted.length).toBeGreaterThan(0);
    expect(known.quirks).toBeUndefined();
    expect(effectiveSectQuirks(reopened,{...known})).toEqual([]);
    expect(encodeEraWorldSave(reopened)).toBe(oldBytes);
    for(const mode of ['utility','deferred'] as const){
      const next=month(reopened,{},mode);
      const progressed=next.cultivators.find(row=>row.id===known.id)!;
      expect(progressed.quirks).toEqual(predicted);
      progressed.sectId=state.sectId;
      progressed.sectRank='掌门';
      ensureManagedSectQuirks(next);
      expect(progressed.quirks).toEqual(predicted);
    }
  });

  it('assigns the real recruit during the same stored native month without a new roster actor right to act',()=>{
    const world=start();
    world.tick=8; world.month=8;
    const recruiter=world.cultivators[0];
    recruiter.locationId='loc-market';
    recruiter.qiProgress=20;
    const option=availableSettlementActions(recruiter,world).find(row=>row.action==='RECRUIT_SETTLER');
    if(!option||option.action!=='RECRUIT_SETTLER')throw Error('Expected actual consenting settler');
    const id=`recruit-${option.targetVolunteerId}`;
    expect(world.cultivators.some(row=>row.id===id)).toBe(false);
    const result=month(world,{[recruiter.id]:{chosenAction:option.action,targetSettlementId:option.targetSettlementId,
      targetVolunteerId:option.targetVolunteerId,innerMonologue:'接引愿意入门之人。'}});
    const recruit=result.cultivators.find(row=>row.id===id);
    expect(recruit?.quirks?.length).toBeGreaterThan(0);
    expect(recruit).toMatchObject({currentAction:'REST',qiProgress:0,sectId:recruiter.sectId});
    const saved=decodeEraWorldSave(encodeEraWorldSave(result));
    expect(saved.cultivators.find(row=>row.id===id)?.quirks).toEqual(recruit?.quirks);
  });
});
