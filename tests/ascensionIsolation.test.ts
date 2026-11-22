import { describe, expect, it } from 'vitest';
import { REALM_LIFESPAN } from '../src/data/initialWorld';
import {
  activeAvatar, availableAvatarHosts, maintainPlayerAvatar, possessAvatar, possessFrontierAvatar,
  possessUpperPassageAvatar, queueAvatarOrder,
} from '../src/engine/avatarEngine';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { projectProtagonistSuccession } from '../src/engine/protagonistSuccession';
import { availableLeadershipActions, rewardContribution } from '../src/engine/sectPoliticsEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { projectStoryHomepage } from '../src/engine/storyHomepage';
import { availableUpperPassageActions } from '../src/engine/upperPassageEngine';
import {
  actualAscensionWaves, ascentActor, ascentMonth, ascentOrder, ascentStart, genuineReversibleUpper, travelerId,
} from './ascensionNativeFixture';
import { earnedProtagonistStory, storyPayload, storyPerson, storyTurn } from './fixtures/protagonistSuccessionFixture';

describe('actual immortal departure isolates lower game roles without adding a death', () => {
  it('relieves only a real exited head and neither re-possesses nor re-offers lower/upper actions', () => {
    const { opening, passed } = actualAscensionWaves();
    const body = ascentActor(passed), original = ascentActor(opening), formerSect = original.sectId;
    expect(body).toMatchObject({ alive: true, positionPlane: 'immortal', sectId: '' });
    const current = passed.sects.find(row => row.id === formerSect)!;
    expect(current.leaderId).toBeTruthy();
    expect(current.leaderId).not.toBe(body.id);
    expect(current.succession).toMatchObject({ previousLeaderId: body.id, tick: passed.tick, method: 'election' });
    expect(current.succession?.supporterIds).not.toContain(body.id);
    expect(passed.events).toContainEqual(expect.objectContaining({
      id: `evt-${passed.tick}-${formerSect}-leadership-office-vacant`, category: 'diplomacy',
    }));
    expect(passed.events.some(event => event.category === 'death' && event.actorIds.includes(body.id))).toBe(false);
    expect(availableLeadershipActions(body, passed)).toEqual([]);
    const oldContribution = body.contribution;
    rewardContribution(body, passed, 100);
    expect(body.contribution).toBe(oldContribution);
    expect(modelDecisionCandidates(passed)).not.toContain(body);

    const essence = passed.playerAvatar.essence;
    expect(availableAvatarHosts(passed)).not.toContain(body);
    expect(availableUpperPassageActions(body, passed)).toEqual([]);
    expect(possessAvatar(passed, body.id)).toBe(false);
    expect(possessUpperPassageAvatar(passed, body.id)).toBe(false);
    expect(possessFrontierAvatar(passed, body.id)).toBe(false);
    expect(passed.playerAvatar.essence).toBe(essence);

    // Simulate a stale UI binding to the same exact body. It cannot enqueue a lower command.
    passed.playerAvatar.possessedId = body.id;
    passed.playerAvatar.possessionUntilTick = passed.tick + 3;
    expect(activeAvatar(passed)).toBeUndefined();
    expect(queueAvatarOrder(passed, 'REST')).toBe(false);
    maintainPlayerAvatar(passed);
    expect(passed.playerAvatar.possessedId).toBeUndefined();
    expect(passed.playerAvatar.essence).toBe(essence);
    expect(ascentActor(ascentMonth(passed)).alive).toBe(true);
  });

  it('keeps real reversible traveler possession and dedicated provider availability intact', () => {
    const { upper } = genuineReversibleUpper(), traveler = ascentActor(upper, travelerId);
    expect(modelDecisionCandidates(upper)).toContain(traveler);
    expect(possessUpperPassageAvatar(upper, traveler.id)).toBe(true);
    expect(activeAvatar(upper)).toBe(traveler);
    expect(availableAvatarHosts(upper)).not.toContain(traveler);
  });

  it('admits a real autonomous active trial and does not send an occupied body to the model', () => {
    const { initial, opening } = actualAscensionWaves();
    expect(modelDecisionCandidates(initial)).toContain(ascentActor(initial));
    expect(modelDecisionCandidates(opening)).toContain(ascentActor(opening));
    const held = structuredClone(opening);
    held.playerAvatar.possessedId = ascentActor(held).id;
    held.playerAvatar.possessionUntilTick = held.tick + 3;
    expect(modelDecisionCandidates(held)).not.toContain(ascentActor(held));
  });

  it('retires a verified still-living protagonist immediately, keeping the exact earlier reading and save', () => {
    const { world, leadId } = earnedProtagonistStory();
    const actor = storyPerson(world, leadId);
    const pre = world.tick;
    Object.assign(actor, { realm: '渡劫', realmStage: 9, qiProgress: 100, hp: actor.maxHp,
      lifespan: REALM_LIFESPAN.渡劫 });
    expect(projectProtagonistSuccession(world).active?.actorId).toBe(leadId);
    let branch = storyTurn(world, { [leadId]: ascentStart });
    const trial = branch.ascension!.trials.find(row => row.actorId === leadId)!;
    expect(trial.phase).toBe('warning');
    for (const approach of ['guard', 'advance', 'guard'] as const) {
      branch = storyTurn(branch, { [leadId]: ascentOrder(approach, trial.id) });
    }
    const terminal = branch.tick;
    expect(storyPerson(branch, leadId)).toMatchObject({ positionPlane: 'immortal', alive: true });
    expect(projectProtagonistSuccession(branch).active?.actorId).not.toBe(leadId);
    expect(projectStoryHomepage(branch).lead?.id).not.toBe(leadId);
    expect(projectProtagonistSuccession(branch, pre).active?.actorId).toBe(leadId);
    expect(projectProtagonistSuccession(world).active?.actorId).toBe(leadId);
    const closed = storyTurn(branch, { [leadId]: storyPayload('REST') });
    const archived = projectProtagonistSuccession(closed).archived.find(row => row.actorId === leadId);
    expect(archived).toMatchObject({ endedTick: terminal, closeReason: 'receded' });
    expect(archived?.death).toBeUndefined();
    expect(projectProtagonistSuccession(decodeEraWorldSave(encodeEraWorldSave(closed))).archived).toContainEqual(archived);
    const forged = structuredClone(closed);
    forged.protagonistSuccession.arcs.find(row => row.actorId === leadId)!.endedTick = terminal - 1;
    expect(() => encodeEraWorldSave(forged)).toThrow(/protagonistSuccession.arcs.timeline/);
  });
});
