// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { StorytellerChoiceScene, StorytellerStyleSetting } from '../src/components/useStorytellerScene';
import { resolveGuidedStorytellerTurn, type GuidedStorytellerTurn } from '../src/controllers/guidedWorldTurn';
import { DEFAULT_PLAYABLE_STORYTELLER, useWorldSimulationController } from '../src/controllers/useWorldSimulationController';
import { createInitialWorld } from '../src/data/initialWorld';
import { configureStoryteller, projectStoryteller } from '../src/engine/storytellerDirector';
import { readTimelineHead } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { StorytellerOption } from '../src/types/storytellerDirector';

function directorOffer() {
  let world = createInitialWorld(98741);
  expect(configureStoryteller(world, DEFAULT_PLAYABLE_STORYTELLER)).toBe(true);
  for (let elapsed = 0; elapsed < 3 && !projectStoryteller(world); elapsed++) world = advanceWorldTick(world);
  const view = projectStoryteller(world);
  if (!view) throw new Error('Expected the default director to present an opportunity');
  return { world, view };
}

it('changes three story styles without a turn and respects an explicitly restored old save until chosen', () => {
  const imported = createInitialWorld(18);
  expect(imported.storyteller).toBeUndefined();
  let phase = 0;
  function Harness() {
    const sim = useWorldSimulationController({
      playbackEnabled: false, inspectCampaign: false, onPreviewContextChange: () => {},
      onHistoricalPreview: () => {}, onActivate: () => {},
    });
    const { world, timeline, saveContextVersion } = sim;
    if (phase === 0) {
      phase++;
      expect(world.storyteller?.style).toBe('wandering_jianghu');
      expect(sim.replaceWorld(imported, world, saveContextVersion.current)).toBe(true);
    } else if (phase === 1) {
      phase++;
      expect(world.storyteller).toBeUndefined();
      expect(world).toBe(imported);
      expect(sim.changeStorytellerStyle('still_water', world, timeline, saveContextVersion.current - 1)).toBe(false);
      expect(sim.changeStorytellerStyle('still_water', world, timeline, saveContextVersion.current)).toBe(true);
    } else if (phase === 2) {
      phase++;
      expect(world.tick).toBe(imported.tick);
      expect(world.storyteller?.style).toBe('still_water');
      expect(readTimelineHead(timeline)?.storyteller?.style).toBe('still_water');
      expect(imported.storyteller).toBeUndefined();
    }
    return <StorytellerStyleSetting style={world.storyteller?.style} onChange={() => false} />;
  }
  const html = renderToStaticMarkup(<Harness />);
  expect(phase).toBe(3);
  expect(html).toMatch(/value="still_water" selected="">静水流深/);
  expect(html).toContain('江湖风波');
  expect(html).toContain('天地大劫');
  expect(html).toContain('不会推进月份');
});

it('binds the ordinary focused person to the exact next monthly choice; forged actor, revision and branch are rejected', () => {
  const { world, view } = directorOffer();
  const option = view.options[0]?.decision;
  if (!option) throw new Error('Expected one possible step');
  const order: GuidedStorytellerTurn = { kind: 'storyteller-choice', world, branchId: 'main', revision: 0, actorId: view.actorId, option };
  const outsider = world.cultivators.find(actor => actor.id !== view.actorId);
  if (!outsider) throw new Error('Expected another person');
  expect(projectStoryteller(world, outsider)).toBeUndefined();
  expect(resolveGuidedStorytellerTurn(order, world, 'main', 0)).toMatchObject({ actorId: view.actorId, decision: option });
  expect(resolveGuidedStorytellerTurn(order, world, 'next-branch', 0)).toBeUndefined();
  expect(resolveGuidedStorytellerTurn(order, world, 'main', 1)).toBeUndefined();
  expect(resolveGuidedStorytellerTurn({ ...order, actorId: outsider.id }, world, 'main', 0)).toBeUndefined();
  const html = renderToStaticMarkup(<StorytellerChoiceScene view={view} onChoose={() => true}/>);
  expect(html).toContain(view.actorName);
  expect(html).toContain(view.title);
  expect(html).toContain('选定便翻到下个月');
  expect(html).not.toContain(option.storytellerOfferId);
});

it('has large choices, suppresses activation repeats, and permits a genuine failed round to retry', async () => {
  const { view } = directorOffer();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const choose = vi.fn((_decision: StorytellerOption, _focus: boolean) => true);
  const host = document.createElement('main');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<StorytellerChoiceScene view={view} onChoose={choose} />));
    const button = host.querySelector('button');
    if (!button) throw new Error('Expected a specific choice button');
    expect(button.className).toContain('min-h-[44px]');
    button.focus();
    const repeat = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
    button.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    });
    expect(choose.mock.calls).toEqual([[view.options[0].decision, true]]);
    await act(async () => root.render(<StorytellerChoiceScene view={view} retry={1} onChoose={choose} />));
    await act(async () => button.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true })));
    expect(choose).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
