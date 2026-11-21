import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChronicleFeed } from '../src/components/ChronicleFeed';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import {
  projectEarnedChronicleLead, projectProtagonistSuccession, PROTAGONIST_SUSTAIN_WINDOW,
} from '../src/engine/protagonistSuccession';
import type { WorldState } from '../src/types/world';
import { earnedProtagonistStory, fallenProtagonistStory, storyPerson, storyTurn } from './fixtures/protagonistSuccessionFixture';

const html = (world: WorldState, events = publicChronicleSceneEvents(world)) =>
  renderToStaticMarkup(<ChronicleFeed events={events} lead={projectEarnedChronicleLead(world, events, world.tick)}
    succession={projectProtagonistSuccession(world)} />);

describe('one authenticated current branch lead and actual archived arcs', () => {
  it('keeps the earned center only from authoritative native public scenes, even without retained hot entries', () => {
    const f = earnedProtagonistStory();
    const projection = projectProtagonistSuccession(f.world);
    const active = projection.active!;
    expect(active.actorId).toBe(f.leadId);
    const archiveOnly = html(f.world, []);
    expect(archiveOnly).toContain('这一卷，先随<strong');
    expect(archiveOnly).toContain(`>${active.name}</strong>`);
    const titles = active.evidence.flatMap(({ title }) => title ? [title] : []);
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expect(archiveOnly).toContain(`从〈${titles[0]}〉读到〈${titles.at(-1)}〉`);
    expect(archiveOnly).not.toContain('前卷主线');
    expect(archiveOnly).not.toContain(active.actorId);

    const withoutTitles = { ...projection, active: { ...active, evidence: active.evidence.map((proof) => ({ ...proof, title: undefined })) } };
    const noHotOrTitles = renderToStaticMarkup(<ChronicleFeed events={[]} succession={withoutTitles} />);
    expect(noHotOrTitles).toContain(`>${active.name}</strong>。`);
    expect(noHotOrTitles).not.toContain('读到〈');
  });

  it('preserves the real former arc and distinct same-name successor only after actual public loss', () => {
    const f = fallenProtagonistStory();
    const before = html(f.beforeArchive);
    expect(before).not.toContain('前卷主线');
    const good = html(f.world);
    const view = projectProtagonistSuccession(f.world);
    expect(view.active?.actorId).toBe(f.successorId);
    expect(view.active?.name).toBe(storyPerson(f.world, f.leadId).name);
    expect(good.match(/aria-label="这一卷的主线"/g)).toHaveLength(1);
    expect(good).toMatch(/<details class="[^"]+"><summary class="[^"]+">前卷主线/);
    expect(good).toContain('公开实录证实陨落，前卷收束');
    expect(good).toContain('陨落实录：〈');
    expect(good).toContain('两人同名，并非同一人');
    expect(good).not.toContain(f.leadId);
    expect(good).not.toContain(f.successorId);
    expect(good).not.toContain(f.deathId);
    const filtered = renderToStaticMarkup(<ChronicleFeed events={publicChronicleSceneEvents(f.world)} category="heavenly" succession={view} />);
    expect(filtered).not.toContain('前卷主线');
    expect(filtered).not.toContain('这一卷的主线');
  });

  it('does not manufacture a successor or turn missing public evidence into a death story', () => {
    const f = earnedProtagonistStory();
    const priorFacts = publicChronicleSceneEvents(f.world);
    const old = projectEarnedChronicleLead(f.world, priorFacts, f.world.tick);
    expect(old?.actorId).toBe(f.leadId);
    let quiet = f.world;
    for (let turn = 0; turn <= PROTAGONIST_SUSTAIN_WINDOW + 1; turn++) quiet = storyTurn(quiet, {}, .99);
    const ensemble = renderToStaticMarkup(<ChronicleFeed events={priorFacts} lead={old} succession={projectProtagonistSuccession(quiet)} />);
    expect(ensemble).toContain('前卷主线淡出');
    expect(ensemble).not.toContain('这一卷的主线');
    expect(ensemble).not.toContain('公开实录证实陨落');
    expect(ensemble).not.toContain('后来另从');

    const unseen = structuredClone(f.world);
    const opening = unseen.protagonistSuccession.arcs[0].opening[0];
    const source = unseen.chronicleArchive.anchors.find(({ id }) => id === opening.eventId)!;
    unseen.events.unshift({ ...source, witnessScope: 'participants', title: '私密场景不作主线' });
    const neutral = storyTurn(unseen, {}, .99);
    const without = html(neutral);
    expect(without).toContain('已有见证不足以继续支撑主线');
    expect(without).not.toContain('这一卷的主线');
    expect(without).not.toContain('公开实录证实陨落');
    expect(without).not.toContain('私密场景不作主线');
  });
});
