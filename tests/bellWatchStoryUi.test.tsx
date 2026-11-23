// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { BellWatchStory } from '../src/components/useBellWatchStory';
import { ChronicleLibraryPanel } from '../src/components/ChronicleLibraryPanel';
import { marketTurningChapter, turningPerson } from './fixtures/chapterTurningPointsFixture';
import type { BellWatchOption, BellWatchView } from '../src/types/bellWatch';

const inspect: BellWatchOption = { chosenAction: 'BELL_WATCH', bellWatchMove: 'inspect', targetBellWatchId: 'private-bell' };
const follow: BellWatchOption = { ...inspect, bellWatchMove: 'reroute' };
const watch: BellWatchView = {
  title: '山钟停了一夜', siteId: 'private-tower', phase: 'pending',
  body: '轮到你报平安。旧信未出山。', options: [inspect, follow],
};
const waiting: BellWatchView = {
  title: '候到夜深', siteId: 'private-listener-site', phase: 'not_received',
  body: '一盏灯候到换更，无人送信来。', options: [],
};
const heard: BellWatchView = {
  title: '有人带话来了', siteId: 'private-destination', phase: 'received',
  body: '此话由来人当面带到。', options: [],
};

it('renders only the authorized individual passage, with no metadata or dead choices for listeners', () => {
  const waitingHtml = renderToStaticMarkup(<BellWatchStory view={waiting} onChoose={() => true} />);
  const heardHtml = renderToStaticMarkup(<BellWatchStory view={heard} onChoose={() => true} />);
  expect(waitingHtml).toContain('无人送信来');
  expect(waitingHtml).not.toMatch(/当面带到|山钟停了一夜|private-|<button/);
  expect(heardHtml).toContain('当面带到');
  expect(heardHtml).not.toMatch(/无人送信来|private-|<button/);
  expect(renderToStaticMarkup(<BellWatchStory view={watch} />)).not.toContain('<button');
  expect(renderToStaticMarkup(<BellWatchStory view={watch} onChoose={() => true} />)
    .match(/min-h-\[44px\]/g)).toHaveLength(2);
});

it('accepts one bounded touch or keyboard choice and moves focus to the passage when choices disappear', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('main');
  document.body.append(host);
  const root = createRoot(host);
  const choose = vi.fn((_option: BellWatchOption) => true);
  try {
    await act(async () => root.render(<BellWatchStory view={watch} onChoose={choose} />));
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.map(button => button.textContent)).toEqual(['亲自查楼', '沿旧信路报平安']);
    buttons[1].focus();
    const repeated = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
    buttons[1].dispatchEvent(repeated);
    expect(repeated.defaultPrevented).toBe(true);
    await act(async () => {
      buttons[1].dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
      buttons[0].dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    });
    expect(choose.mock.calls).toEqual([[follow]]);
    await act(async () => root.render(<BellWatchStory view={heard} onChoose={choose} />));
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(document.activeElement).toBe(host.querySelector('h3'));
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});


it('renders one in-window participant side note without altering public book prose', () => {
  const { world, chapter, viewerId, outsiderId } = marketTurningChapter();
  const viewer = turningPerson(world, viewerId);
  const outsider = turningPerson(world, outsiderId);
  const tower = world.locations.find(location => location.id === 'loc-taixu');
  const sect = world.sects.find(row => row.headquartersId === tower?.id);
  const watcher = world.cultivators.find(row => row.sectId === sect?.id && row.id !== viewerId);
  if (!tower || !sect || !watcher) throw new Error('Missing expected book-reader fixture');
  const read = () => renderToStaticMarkup(<ChronicleLibraryPanel world={world} cultivator={viewer} />);
  const noNote = read();
  const tick = chapter.endTick;
  tower.bellWatch = {
    id: 'bell-book-fixture-receipt', sectId: sect.id, openedTick: tick - 6, watcherId: watcher.id,
    listeners: [{ actorId: viewer.id, siteId: viewer.locationId }],
    damage: { hazard: { id: 'bell-book-fixture-hazard', tileId: 'fixture-tile', kind: 'beast_tide',
      createdTick: tick - 5, expiresTick: tick - 2, intensity: 2 },
    tick: tick - 4, integrityBefore: 100, integrityAfter: 60 },
    choice: { move: 'reroute', tick: tick - 3, pathTileIds: [], pathIndex: 0, destinationId: viewer.locationId,
      endedTick: tick, outcome: 'arrived' },
    receipts: [{ actorId: viewer.id, siteId: viewer.locationId, tick }],
  };
  const noted = read();
  const publicPassages = (html: string) => [...html.matchAll(/<span[^>]*data-chronicle-paragraph-text[^>]*>([\s\S]*?)<\/span>/g)]
    .map(([, text]) => text);
  expect(noted.match(/aria-label="当事人侧记，不随公开章节分享"/g)).toHaveLength(1);
  expect(noted).toContain('你这才知道缘故');
  expect(publicPassages(noted).length).toBeGreaterThan(0);
  expect(publicPassages(noted)).toEqual(publicPassages(noNote));
  expect(renderToStaticMarkup(<ChronicleLibraryPanel world={world} cultivator={outsider} />))
    .not.toContain('当事人侧记');
  expect(renderToStaticMarkup(<ChronicleLibraryPanel world={world} />)).not.toContain('当事人侧记');
});
