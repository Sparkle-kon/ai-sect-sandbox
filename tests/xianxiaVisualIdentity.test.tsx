// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { SandboxWorkspace, type WorkspaceId } from '../src/components/SandboxWorkspace';
import { StoryFirstHome } from '../src/components/StoryFirstHome';
import { projectSceneStage } from '../src/components/sceneStageModel';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectStoryHomepage } from '../src/engine/storyHomepage';
import { actualCommonBond, actualDefenderWinsLethally, bondActor, secondId } from './dramaticBondNativeFixture';

const variants = { map: 'map', people: 'people', chronicle: 'chronicle', sect: 'sect', world: 'civic' } satisfies Record<WorkspaceId, string>;
const workspaces = Object.keys(variants) as WorkspaceId[];
const labels = ['地图', '人物', '纪事', '宗门', '世界'];
const noOp = () => undefined;
const motifSelector = '[data-ink-scene]';
const controls = 'button, a[href], input, select, textarea, [role="button"], [tabindex], [contenteditable="true"]';

function markup(html: string) {
  const node = document.createElement('div');
  node.innerHTML = html;
  return node;
}
function art(root: ParentNode) {
  return [...root.querySelectorAll<SVGSVGElement>(motifSelector)];
}
function focusableArt(svg: SVGSVGElement) {
  expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(svg.getAttribute('focusable')).toBe('false');
  expect(svg.getAttribute('pointer-events')).toBe('none');
  expect(svg.matches(controls)).toBe(false);
  expect(svg.querySelector(controls)).toBeNull();
  expect(svg.querySelector('image, foreignObject, animate, animateTransform, script')).toBeNull();
  expect(svg.getAttribute('viewBox')).toBeTruthy();
  expect(svg.querySelector('path')).not.toBeNull();
}
function assertWorkspace(node: ParentNode, selected: WorkspaceId) {
  const tabs = Array.from(node.querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
  const panels = Array.from(node.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  const selectedTab = tabs.find(button => button.getAttribute('aria-selected') === 'true')!;
  const activePanel = panels.find(panel => panel.dataset.workspace === selected)!;
  expect(tabs.map(button => button.textContent?.trim())).toEqual(labels);
  expect(tabs.map(button => button.tabIndex)).toEqual(workspaces.map(id => id === selected ? 0 : -1));
  expect(tabs.filter(button => button.getAttribute('aria-selected') === 'true')).toEqual([selectedTab]);
  expect(panels.filter(panel => !panel.hidden)).toEqual([activePanel]);
  expect(selectedTab.getAttribute('aria-controls')).toBe(activePanel.id);
  expect(activePanel.getAttribute('aria-labelledby')).toBe(selectedTab.id);
  expect(art(node)).toHaveLength(1);
  const [scene] = art(activePanel);
  expect(scene?.dataset.inkScene).toBe(variants[selected]);
  focusableArt(scene);
  return { activePanel, selectedTab };
}

describe('native ink treatment without replacing interaction or character ownership', () => {
  it('mounts only the active artwork in each real App workspace, with five distinct drawn compositions', () => {
    const artwork = workspaces.map(workspace => {
      const root = markup(renderToStaticMarkup(<App initialWorkspace={workspace} />));
      const { activePanel } = assertWorkspace(root, workspace);
      const svg = art(activePanel)[0];
      return { subject: svg.querySelector('[data-ink-subject]')?.getAttribute('data-ink-subject'),
        paths: [...svg.querySelectorAll('path')].map(path => path.getAttribute('d')).join(';') };
    });
    expect(artwork.map(({ subject }) => subject)).toEqual(['river-valley', 'courtyard', 'open-manuscript', 'mountain-temple', 'market-bridge']);
    expect(new Set(artwork.map(({ paths }) => paths)).size).toBe(5);
  });

  it('shows no cover art over the genuine default Canvas, retains the known portrait and both story actions', () => {
    const world = createInitialWorld();
    const reading = projectStoryHomepage(world);
    const frame = projectSceneStage(world, { eventId: reading.scene?.eventId, leadId: reading.lead?.id });
    expect(frame?.portrait?.name).toBeTruthy();
    const root = markup(renderToStaticMarkup(<App />));
    const home = root.querySelector('[data-story-home]')!;
    expect(home.querySelectorAll('canvas[data-scene-stage]')).toHaveLength(1);
    expect(home.querySelectorAll('[data-stage-portrait] svg[data-cultivator-portrait]')).toHaveLength(1);
    expect(home.querySelector('[data-stage-portrait] figcaption')?.textContent).toContain(frame?.portrait?.name);
    expect(home.querySelector('h2')?.textContent).toBe('主角未定');
    expect(home.querySelector('[data-chronicle-reader-heading]')?.textContent).toBe(reading.scene?.title);
    expect(art(root)).toHaveLength(0);
    const actions = Array.from(root.querySelectorAll('button'));
    expect(actions).toHaveLength(3);
    expect(actions.filter(button => !button.hasAttribute('aria-pressed')).map(button => button.textContent?.trim())).toEqual(['走进故事', '看下个月']);
    expect(root.querySelector('button[aria-label="启用仙乐"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('uses one decorative stand-in only with no scene frame; a real duel and the cockpit keep their native artwork', () => {
    const fallback = markup(renderToStaticMarkup(<StoryFirstHome onContinue={noOp} onMore={noOp} />));
    expect(fallback.querySelector('canvas,[data-visual-duel-arena]')).toBeNull();
    const [scene] = art(fallback);
    expect(art(fallback)).toHaveLength(1);
    expect(scene.dataset.inkScene).toBe('story');
    focusableArt(scene);
    expect([...fallback.querySelectorAll('button')].map(button => button.textContent?.trim())).toEqual(['走进故事', '看下个月']);

    const { world, death } = actualDefenderWinsLethally(actualCommonBond().clash);
    const duel = markup(renderToStaticMarkup(<StoryFirstHome stageWorld={world} stageViewer={bondActor(world, secondId)}
      scene={{ eventId: death.id, title: death.title, paragraph: death.description }} onContinue={noOp} onMore={noOp} />));
    expect(duel.querySelectorAll('[data-visual-duel-arena]')).toHaveLength(1);
    expect(duel.querySelector('canvas[data-scene-stage]')).toBeNull();
    expect(art(duel)).toHaveLength(0);

    const cockpit = markup(renderToStaticMarkup(<App initialCockpit />));
    expect(cockpit.querySelector('[data-panoramic-cockpit] canvas[data-scene-stage]')).not.toBeNull();
    expect(art(cockpit)).toHaveLength(0);
  });

  it.each([360, 390])('keeps keyboard and focus semantics at %ipx simulated DOM width', async width => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('innerWidth', width);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const views = Object.fromEntries(workspaces.map(id => [id, <p data-real-content={id}>{id}</p>])) as Record<WorkspaceId, React.ReactNode>;
    function Workspace({ hideActiveContent = false }: { hideActiveContent?: boolean }) {
      const [active, setActive] = useState<WorkspaceId>('map');
      return <SandboxWorkspace active={active} onChange={setActive} views={views} hideActiveContent={hideActiveContent} />;
    }
    try {
      await act(async () => root.render(<Workspace />));
      const { selectedTab: mapTab } = assertWorkspace(host, 'map');
      const mapView = host.querySelector('[data-real-content="map"]');
      mapTab.focus();
      await act(async () => mapTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
      const { selectedTab: peopleTab } = assertWorkspace(host, 'people');
      expect(document.activeElement).toBe(peopleTab);
      expect(host.querySelector('[data-real-content="map"]')).toBe(mapView);
      expect(mapView?.closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(true);
      await act(async () => peopleTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })));
      const { selectedTab: worldTab } = assertWorkspace(host, 'world');
      expect(document.activeElement).toBe(worldTab);
      expect([...host.querySelectorAll('button[role="tab"]')].every(button => button.classList.contains('min-h-11'))).toBe(true);
      await act(async () => root.render(<Workspace hideActiveContent />));
      expect(art(host)).toHaveLength(0);
      expect(host.querySelector('[data-real-content="world"]')).toBeNull();
      expect(document.activeElement).toBe(worldTab);

      const advance = vi.fn(), enter = vi.fn();
      await act(async () => root.render(<StoryFirstHome onContinue={advance} onMore={enter} />));
      const [more, next] = host.querySelectorAll('button');
      expect([more.textContent?.trim(), next.textContent?.trim()]).toEqual(['走进故事', '看下个月']);
      next.focus();
      expect(document.activeElement).toBe(next);
      await act(async () => {
        art(host)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        next.click();
        more.click();
      });
      expect(advance).toHaveBeenCalledTimes(1);
      expect(enter).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });
});
