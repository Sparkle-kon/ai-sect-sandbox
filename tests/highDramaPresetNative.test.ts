import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { buildHighDramaPreset } from '../src/engine/highDramaPresetEngine';
import { projectProtagonistSuccession,qualifiesProtagonistOpening } from '../src/engine/protagonistSuccession';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import { createTimeline,recordTimelineWorld } from '../src/engine/timelineEngine';
import { availableWaterVeinActions } from '../src/engine/waterVeinEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'依原处静候。'};
const step=(world:WorldState,choices:Readonly<Record<string,LLMDecisionPayload>>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??rest])),undefined,'utility');
function strict(world:WorldState){
  const input=encodeEraWorldSave(world),result=decodeEraWorldSave(input);
  expect(encodeEraWorldSave(result)).toBe(input);
  return result;
}
const storms='storm-at-blood-moon', cups='tournament-eve', mines='cold-jade-disciple';
const pick=(id:typeof storms|typeof cups|typeof mines)=>{
  const candidate=buildHighDramaPreset(id);
  if(!candidate)throw Error(`Native authored prefix did not produce ${id}`);
  return candidate;
};

describe('native playable high-drama openings',()=>{
  it('starts during genuine opposing siege arrival and the next ordinary turn actually damages the array',()=>{
    const {world,focusActorId,focusLocationId}=pick(storms);
    expect([world.tick,focusActorId,focusLocationId]).toEqual([7,'npc-3','loc-blood']);
    const siege=world.sieges.find(row=>row.status==='sieging')!;
    expect(siege).toMatchObject({startedTick:5,rounds:0,destinationId:focusLocationId,
      theatre:{arrivedTick:world.tick,rounds:[]}});
    const previous=world.sects.find(row=>row.id===siege.defenderSectId)!.arrayHp;
    expect(previous).toBe(200);
    const fought=step(strict(world)),updated=fought.sieges.find(row=>row.id===siege.id)!;
    expect(updated.theatre?.rounds[0]).toMatchObject({round:1,tick:world.tick+1,wallBefore:200});
    expect(updated.theatre!.rounds[0].wallAfter).toBeLessThan(previous);
    expect(fought.events).toContainEqual(expect.objectContaining({id:`evt-${fought.tick}-dip-${siege.id}`,locationId:focusLocationId}));
    expect(world.sieges.find(row=>row.id===siege.id)?.rounds).toBe(0);
  });

  it('starts on the actual eve of a registered tournament and the two next real months commence then play a bout',()=>{
    const {world,focusActorId,focusLocationId}=pick(cups);
    expect([world.tick,focusActorId,focusLocationId]).toEqual([62,'npc-2','loc-market']);
    const standings=world.occasions.find(row=>row.kind==='tournament')!;
    expect(standings).toMatchObject({startedTick:60,status:'registration',registrationClosesTick:63,bouts:[]});
    expect(new Set(standings.participantIds)).toEqual(new Set(['npc-2','npc-4','npc-6']));
    const start=step(strict(world)),competition=start.occasions.find(row=>row.id===standings.id)!;
    expect(competition.status).toBe('running');
    expect(competition.remainingIds).toHaveLength(3);
    expect(competition.remainingIds.every(id=>start.cultivators.find(row=>row.id===id)?.locationId===focusLocationId)).toBe(true);
    const advanced=step(start),first=advanced.occasions.find(row=>row.id===standings.id)!;
    const duel=first.bouts.find(row=>row.secondId!==undefined)!;
    expect(duel.round).toBe(1);
    expect([duel.firstId,duel.secondId]).toContain(duel.winnerId);
    expect([duel.firstId,duel.secondId].every(id=>id&&standings.participantIds.includes(id))).toBe(true);
  });

  it('lets the real low-realm recruit with an existing household take the first mine action independently',()=>{
    const {world,focusActorId,focusLocationId}=pick(mines);
    expect([world.tick,focusActorId,focusLocationId]).toEqual([3,'recruit-village-loc-vein-north-vol-1','loc-vein-north']);
    const actor=world.cultivators.find(row=>row.id===focusActorId)!;
    expect(actor).toMatchObject({locationId:focusLocationId,realm:'练气',spiritStones:25});
    expect(world.settlements.records).toContainEqual(expect.objectContaining({
      kind:'recruitment',cultivatorId:actor.id,people:1,tick:world.tick,
    }));
    expect(world.coldWaterVein?.mining.some(row=>row.actorId===actor.id)??false).toBe(false);
    const mine=availableWaterVeinActions(actor,world,world.tick+1).find(row=>row.waterVeinMove==='mine')!;
    expect(mine).toBeDefined();
    const continued=step(strict(world),{[actor.id]:{chosenAction:mine.action,waterVeinMove:mine.waterVeinMove,
      targetLocationId:mine.targetLocationId,innerMonologue:'只采可下手的原矿。'}});
    expect(continued.coldWaterVein?.mining).toContainEqual(expect.objectContaining({actorId:actor.id,tick:continued.tick}));
    expect(continued.cultivators.find(row=>row.id===actor.id)!.spiritStones).toBeGreaterThan(actor.spiritStones);
  });

  it('separates ordinary and the three genuine lineages, without binding the recommended POV as an earned hero',()=>{
    const ordinary=createInitialWorld(1,'spirit-bloom'),presets=[pick(storms),pick(cups),pick(mines)];
    expect(new Set(presets.map(row=>row.focusActorId)).size).toBe(3);
    const timeline=createTimeline(ordinary);
    for(const [index,preset] of presets.entries()){
      expect(preset.world.random.seed).toBe(ordinary.random.seed);
      expect(preset.world.worldgen?.profileId).toBe(ordinary.worldgen?.profileId);
      expect(sameGeneratedWorld(ordinary,preset.world)).toBe(false);
      expect(recordTimelineWorld(timeline,preset.world)).toBe(timeline);
      expect(sameGeneratedWorld(preset.world,strict(preset.world))).toBe(true);
      expect(preset.world.playerAvatar.possessedId).toBeUndefined();
      const lead=projectProtagonistSuccession(preset.world).active;
      if(lead)expect(qualifiesProtagonistOpening(preset.world.protagonistSuccession.arcs.find(row=>row.id===lead.id)!.opening)).toBe(true);
      for(const other of presets.slice(index+1))expect(sameGeneratedWorld(preset.world,other.world)).toBe(false);
    }
    expect(projectProtagonistSuccession(presets[2].world).active?.actorId).not.toBe(presets[2].focusActorId);
  });
});
