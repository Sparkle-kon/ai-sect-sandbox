import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { buildCausalChronicleChain } from '../src/engine/chronicleCausalityEngine';
import { maintainSectPolitics } from '../src/engine/sectPoliticsEngine';
import { resolveServiceRetirementAction } from '../src/engine/serviceRetirementEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';

function fixture() {
  const world = createInitialWorld(621);
  const sect = world.sects[0];
  const previous = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const viewer = world.cultivators.find(({ id, sectId }) => sectId === sect.id && id !== previous.id)!;
  previous.locationId = sect.headquartersId;
  viewer.locationId = sect.headquartersId;
  return { world, sect, previous, viewer };
}

describe('recorded political causality and world-save validation', () => {
  it('records the real same-turn vacancy before election without turning private retirement into public evidence', () => {
    const { world, sect, previous, viewer } = fixture();
    const retired = resolveServiceRetirementAction(world, previous, {
      chosenAction: 'SECT_SERVICE', serviceMove: 'retire', innerMonologue: '我的个人原因未向山门公布。',
    });
    expect(retired?.witnessScope).toBe('participants');
    if (!retired) throw Error('Expected a valid retirement');
    world.events.unshift(retired);
    const events = maintainSectPolitics(world);
    world.events.unshift(...events);
    expect(sect.succession).toMatchObject({ method: 'election', previousLeaderId: previous.id });
    const vacancy = events.find(({ id }) => id === `evt-${world.tick}-${sect.id}-leadership-office-vacant`)!;
    const election = events.find(({ id }) => id === `evt-${world.tick}-${sect.id}-leadership-vacancy-${sect.leaderId}`)!;
    expect(vacancy.actorIds).toEqual([]);
    expect(vacancy.description).not.toContain(previous.name);
    const expected = { entry: { eventId: election.id, tick: world.tick, kind: 'sect_election', outcome: 'elected' }, previous: [{
      relation: 'filled_vacancy', node: { entry: { eventId: vacancy.id, tick: world.tick, kind: 'sect_vacancy' }, previous: [] },
    }] };
    expect(buildCausalChronicleChain(world, election.id, viewer.id)).toEqual(expected);
    expect(buildCausalChronicleChain(world, retired.id, viewer.id)).toBeUndefined();
    expect(maintainSectPolitics(world)).toEqual([]);
    const imported = decodeWorldSave(encodeWorldSave(world));
    expect(buildCausalChronicleChain(imported, election.id, viewer.id)).toEqual(expected);
    const conflicting = structuredClone(imported);
    conflicting.events.push({ ...vacancy, witnessScope: 'participants' });
    expect(() => encodeWorldSave(conflicting)).toThrow('chronicleCausality.events.source');
    const wrongRole = structuredClone(imported);
    wrongRole.chronicleCausality.nodes.at(-1)!.predecessors[0].relation = 'matched_sell_order';
    expect(() => encodeWorldSave(wrongRole)).toThrow('chronicleCausality.predecessors.reference');
  });

  it('does not invent a predecessor on a previously unknown vacancy or a legacy save', () => {
    const { world, sect, viewer } = fixture();
    delete sect.leaderId;
    const events = maintainSectPolitics(world);
    world.events.unshift(...events);
    const election = events.find(({ id }) => id === `evt-${world.tick}-${sect.id}-leadership-vacancy-${sect.leaderId}`)!;
    expect(buildCausalChronicleChain(world, election.id, viewer.id)?.previous).toEqual([]);
    const legacy = JSON.parse(encodeWorldSave(world));
    delete legacy.world.chronicleCausality;
    const imported = decodeWorldSave(JSON.stringify(legacy));
    expect(imported.chronicleCausality).toEqual({ nodes: [], nextSequence: 1 });
    expect(buildCausalChronicleChain(imported, election.id, viewer.id)).toBeUndefined();
  });

  it('keeps an actual unfilled vacancy bound to the office between turns', () => {
    const { world, sect, previous, viewer } = fixture();
    for (const actor of world.cultivators) if (actor.id !== previous.id && actor.sectId === sect.id) {
      actor.sectId = '';
      actor.sectRank = '外门弟子';
    }
    expect(resolveServiceRetirementAction(world, previous, {
      chosenAction: 'SECT_SERVICE', serviceMove: 'retire', innerMonologue: '本人退任。',
    })).not.toBeNull();
    const [vacancy] = maintainSectPolitics(world);
    world.events.unshift(vacancy);
    expect(sect.leaderId).toBeUndefined();
    expect(sect.officeVacancy).toEqual({ eventId: vacancy.id, tick: world.tick });
    expect(maintainSectPolitics(world)).toEqual([]);
    world.tick += 2;
    viewer.sectId = sect.id;
    const [election] = maintainSectPolitics(world);
    world.events.unshift(election);
    expect(sect.leaderId).toBe(viewer.id);
    expect(sect.officeVacancy).toBeUndefined();
    expect(buildCausalChronicleChain(world, election.id, viewer.id)?.previous[0]?.node.entry)
      .toMatchObject({ eventId: vacancy.id, tick: vacancy.tick, kind: 'sect_vacancy' });
  });
});
