// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { StorytellerPulseStrip } from '../src/components/StorytellerPulseStrip';
import { WorldPulseBar } from '../src/components/WorldPulseBar';
import type { WorldPulseView } from '../src/components/worldPulseModel';
import { createInitialWorld } from '../src/data/initialWorld';
import { configureStoryteller, projectStorytellerPulse } from '../src/engine/storytellerDirector';
import { advanceWorldTick } from '../src/engine/worldEngine';

const realm: WorldPulseView = {
  season:'春',righteous:{count:0},demonic:{count:0},risks:[],additionalRisks:0,coverage:'world',
};

function actualMonths(seed: number) {
  let world = createInitialWorld(seed);
  expect(configureStoryteller(world, 'wandering_jianghu')).toBe(true);
  for (let count = 0; count < 26; count++) world = advanceWorldTick(world);
  const view = projectStorytellerPulse(world);
  if (!view) throw new Error('A played world should have a pace curve');
  return {world,view};
}

it('keeps classic top bar when history is absent, with no extra action or layout column', () => {
  const html = renderToStaticMarkup(<WorldPulseBar view={realm} onFocusAlert={() => {}} />);
  expect(html).toContain('天地气运');
  expect(html).not.toMatch(/<details|>天势</);
  expect(html).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(0,.85fr)_minmax(0,1fr)] lg:items-center');
});

it('shows one expandable cockpit strip with current actual date, reason and only recent recorded months', () => {
  const { world, view } = actualMonths(2147);
  const section = new DOMParser().parseFromString(renderToStaticMarkup(
    <WorldPulseBar view={realm} storyteller={view} onFocusAlert={() => {}} />,
  ), 'text/html');
  const disclosure = section.querySelector('details');
  if (!disclosure) throw new Error('Expected the native compact disclosure');
  expect(section.querySelectorAll('details')).toHaveLength(1);
  expect(disclosure.open).toBe(false);
  expect(disclosure.firstElementChild?.tagName).toBe('SUMMARY');
  expect(disclosure.firstElementChild?.className).toContain('min-h-[44px]');
  expect(disclosure.firstElementChild?.className).toContain('grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
  expect(disclosure.firstElementChild?.textContent).toContain('天势');
  expect(disclosure.firstElementChild?.textContent).toContain(`仙历 ${world.year} 年 ${world.month} 月`);
  expect(disclosure.firstElementChild?.textContent).toContain(`${view.current.tension} / 100`);
  const summary = disclosure.querySelector('summary');
  if (!summary) throw new Error('Expected a keyboard-operable summary');
  summary.click();
  expect(disclosure.open).toBe(true);
  const rows = [...disclosure.querySelectorAll('ol > li')];
  expect(rows).toHaveLength(24);
  expect(rows[0]?.textContent).toContain(view.current.beatLabel);
  const oldest = view.points[0];
  expect(rows.at(-1)?.textContent).toContain(`仙历 ${oldest.year} 年 ${oldest.month} 月`);
  expect(disclosure.textContent).toContain(view.current.reasonLabel ?? '这一月没有新抉择。');
  const svg = disclosure.querySelector('svg');
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.getAttribute('viewBox')).toBe('0 0 144 32');
  expect(svg?.outerHTML).not.toMatch(/animate|transition|NaN|Infinity/);
  expect(disclosure.querySelector('button')).toBeNull();
});

it('leaves a visible gap instead of drawing fictional values for unrecorded months', () => {
  const { view } = actualMonths(9);
  const [oldest, next] = view.points;
  expect(view.current.tick - next.tick).toBeGreaterThan(1);
  const html = renderToStaticMarkup(<StorytellerPulseStrip view={{...view,points:[oldest,next,view.current]}} />);
  const dom = new DOMParser().parseFromString(html,'text/html');
  const curve = dom.querySelectorAll('path')[1]?.getAttribute('d');
  expect(curve?.match(/M/g)).toHaveLength(2);
  expect(curve?.match(/L/g)).toHaveLength(1);
  expect(dom.querySelectorAll('ol > li')).toHaveLength(3);
});
