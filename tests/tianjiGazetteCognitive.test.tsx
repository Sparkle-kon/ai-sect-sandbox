import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TianjiGazettePaper } from '../src/components/TianjiGazetteRead';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { chooseGrandSiegeHeroDecision } from '../src/engine/grandSiegeTheatreEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { projectTianjiGazette, publishTianjiGazette } from '../src/engine/tianjiGazetteEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';
import { actualGrandSiege, actualSiege, location, patriarch, siegeActor, siegeTurn } from './grandSiegeNativeFixture';
import { actualGazetteCampaign } from './tianjiGazetteNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://gazette-offline.invalid/v1', apiKey: 'mock', model: 'mock' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '此刻调息，不另报市面传闻。' };
const secretId = 'npc-7', otherId = 'npc-8';
const secretThought = '深匣甲七：其实我从未向天下透露这一句。';
const fakeDeath = '墨哨919：假称掌门早已被杀，战场由我称王。';
const response = (item: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(item) } }] }));
const choices = (world: WorldState, extra: Record<string, LLMDecisionPayload> = {}) =>
  Object.fromEntries(world.cultivators.map(actor => [actor.id, extra[actor.id] ?? rest]));
function watchScope(world: WorldState, viewerId: string, throughTick = world.tick) {
  const viewer = siegeActor(world, viewerId), view = createTerrainMapView(world, viewer, true);
  return { viewerId, throughTick, currentVisibleSiteIds: new Set(view.seenLocations.filter(site => view.isCurrentLocation(site.id)).map(site => site.id)) };
}
afterEach(() => {
  vi.unstubAllGlobals();
  llmScheduler.resetTickBudget();
});

describe('Tianji Gazette is published from actual documented native facts, not model narration', () => {
  it('records the same verified fought result after a deferred accepted model choice and an exact offline Utility choice', async () => {
    const { arrived } = actualGrandSiege();
    // Neutral npcs travel by real native movement; their private encounter is unrelated to the battle site.
    const prepared = siegeTurn(arrived, { [secretId]: { chosenAction: 'EXPLORE', targetLocationId: 'loc-tianji', innerMonologue: '回到亲去过的观星台。' } });
    expect(siegeActor(prepared, secretId).locationId).toBe(siegeActor(prepared, otherId).locationId);
    const actor = siegeActor(prepared, patriarch), pendingSiege = actualSiege(prepared);
    expect(pendingSiege.theatre?.rounds[0].clash).toBeDefined();
    expect(prepared.tianjiGazette?.issues.some(issue => issue.trigger === 'battle')).not.toBe(true);
    siegeActor(prepared, secretId).secretGoal = secretThought;
    const lawful = { chosenAction: 'GRAND_SIEGE_HERO', targetGrandSiegeId: pendingSiege.id,
      grandSiegeHeroMove: 'leader-last-stand' } as const;
    let answer: unknown = { ...lawful, newspaperTitle: fakeDeath, duelWinnerId: secretId };
    const outbound: string[] = [];
    const mockedProvider = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      outbound.push(String(init?.body));
      return response(answer);
    });
    vi.stubGlobal('fetch', mockedProvider);
    llmScheduler.resetTickBudget();
    await expect(requestCultivatorLLMDecision(actor, prepared, config, prepared.tick + 1)).resolves.toBeUndefined();
    answer = lawful;
    llmScheduler.resetTickBudget();
    const proposal = await requestCultivatorLLMDecision(actor, prepared, config, prepared.tick + 1);
    expect(proposal).toMatchObject(lawful);
    const offline = chooseGrandSiegeHeroDecision(prepared, actor);
    expect(offline).toMatchObject(lawful);
    for (const raw of outbound) {
      expect(raw).toContain(pendingSiege.id);
      expect(raw).not.toContain(secretThought);
      expect(raw).not.toContain(fakeDeath);
      expect(raw).not.toContain('tianjiGazette');
      expect(raw).not.toContain('winnerId');
    }

    const unrelatedPrivate = { [secretId]: { chosenAction: 'SCHEMING', targetCultivatorId: otherId, innerMonologue: secretThought } } satisfies Record<string, LLMDecisionPayload>;
    const callback = vi.fn<(actorId: string, applied: boolean) => void>();
    let recorded: readonly WorldEvent[] = [];
    const completed = (events: readonly WorldEvent[]) => { recorded = events; };
    let modelWorld = advanceWorldTick(prepared, choices(prepared, { ...unrelatedPrivate, [patriarch]: proposal! }), () => .5, 'deferred', callback,
      { modelActors: new Set([patriarch]), onCompletedEvents: completed });
    let offlineWorld = advanceWorldTick(prepared, choices(prepared, unrelatedPrivate), () => .5, 'utility');
    expect(callback).toHaveBeenCalledWith(patriarch, true);
    expect(actualSiege(modelWorld).theatre?.rounds.at(-1)?.hero?.origin).toBe('model');
    expect(actualSiege(offlineWorld).theatre?.rounds.at(-1)?.hero?.origin).toBe('utility');
    const scheme = modelWorld.events.find(event => event.id === `evt-${modelWorld.tick}-${secretId}-scheme`);
    expect(scheme).toMatchObject({ witnessScope: 'participants', actorIds: [secretId, otherId] });
    expect(modelWorld.tianjiGazette?.issues.some(issue => issue.trigger === 'battle')).not.toBe(true);

    for (let step = 0; step < 8 && actualSiege(modelWorld).status === 'sieging'; step++) {
      modelWorld = advanceWorldTick(modelWorld, choices(modelWorld), () => .5, 'deferred', undefined, { onCompletedEvents: completed });
      offlineWorld = advanceWorldTick(offlineWorld, choices(offlineWorld), () => .5, 'utility');
    }

    const terminal = actualSiege(modelWorld).theatre?.terminal;
    expect(terminal).toMatchObject({ status: 'victory', battlefield: true, tick: modelWorld.tick });
    expect(modelWorld.tick).toBe(offlineWorld.tick);
    expect(recorded).toContainEqual(expect.objectContaining({ id: terminal!.sourceEventId, tick: modelWorld.tick, locationId: location }));
    expect(modelWorld.tianjiGazette).toEqual(offlineWorld.tianjiGazette);
    const issue = modelWorld.tianjiGazette?.issues.find(row => row.tick === modelWorld.tick);
    expect(issue).toMatchObject({ trigger: 'battle', year: modelWorld.year, month: modelWorld.month });
    const headline = issue?.entries.find(row => row.kind === 'headline');
    expect(headline).toEqual(expect.objectContaining({ kind: 'headline', story: 'siege', siteId: location, outcome: 'victory',
      sourceEventId: terminal!.sourceEventId, siegeId: pendingSiege.id }));
    expect(headline).not.toHaveProperty('winnerId');
    expect(headline).not.toHaveProperty('death');

    const scope = watchScope(modelWorld, patriarch);
    expect(scope.currentVisibleSiteIds.has(location)).toBe(true);
    const paper = projectTianjiGazette(modelWorld, scope).find(row => row.id === issue?.id);
    expect(paper).toEqual(projectTianjiGazette(offlineWorld, watchScope(offlineWorld, patriarch)).find(row => row.id === issue?.id));
    expect(paper?.entries.some(row => row.kind === 'headline')).toBe(true);
    const html = renderToStaticMarkup(<TianjiGazettePaper issue={paper!} />);
    expect(html).toContain('天机风云报');
    expect(html).toContain('头版头条');
    for (const unauthorized of [scheme!.id, scheme!.description, secretThought, fakeDeath, 'duelWinnerId', 'innerMonologue', '被杀', '屠尽'])
      expect(JSON.stringify([issue, paper, html])).not.toContain(unauthorized);
    const far = watchScope(modelWorld, secretId);
    expect(far.currentVisibleSiteIds.has(location)).toBe(false);
    expect(projectTianjiGazette(modelWorld, far).find(row => row.id === issue?.id)?.entries.some(row => row.kind === 'headline')).not.toBe(true);
    expect(projectTianjiGazette(modelWorld, { ...scope, throughTick: modelWorld.tick - 1 }).some(row => row.id === issue?.id)).toBe(false);
    expect(mockedProvider).toHaveBeenCalledTimes(2); // The only requests are explicit actor inputs, never Gazette publication.
  });

  it('does not turn a forecast, unsupported death wording or a private same-ID substitution into a published battle', () => {
    const { arrived, reports, closed, source } = actualGazetteCampaign();
    const poised = structuredClone(reports[0]);
    const round = actualSiege(poised).theatre?.rounds[0];
    const original = poised.events.find(event => event.id === round?.sourceEventId)!;
    expect(actualSiege(poised).theatre?.terminal).toBeUndefined();
    const forged: WorldEvent = { ...original, title: '攻山告捷', description: fakeDeath, duelWinnerId: secretId };
    poised.events = poised.events.map(event => event.id === forged.id ? forged : event);
    publishTianjiGazette(arrived, poised, [forged]);
    expect(poised.tianjiGazette?.issues.some(row => row.trigger === 'battle')).not.toBe(true);

    const cover = closed.tianjiGazette?.issues.find(row => row.tick === closed.tick)!;
    expect(cover).toBeDefined();
    const privateCopy = structuredClone(closed);
    const disputed: WorldEvent = { ...source, witnessScope: 'participants', description: secretThought };
    privateCopy.events = privateCopy.events.map(event => event.id === disputed.id ? disputed : event);
    expect(projectTianjiGazette(privateCopy, watchScope(privateCopy, patriarch)).some(row => row.id === cover.id)).toBe(false);
    delete privateCopy.tianjiGazette;
    publishTianjiGazette(reports.at(-2)!, privateCopy, [source, disputed]);
    expect(privateCopy.tianjiGazette).toBeUndefined();
  });
});
