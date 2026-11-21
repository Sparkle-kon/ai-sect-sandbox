import {renderToPipeableStream, renderToStaticMarkup} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {App} from '../src/App';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {HANDEDNESS_STORAGE_KEY} from '../src/components/handednessPreference';
import {createInitialWorld} from '../src/data/initialWorld';
import type {WorldState} from '../src/types/world';

const fixture = vi.hoisted(() => ({actorCount: 48}));
vi.mock('../src/data/initialWorld',async (load) => {
  const real = await load<typeof import('../src/data/initialWorld')>();
  return {...real,createInitialWorld:(...args:Parameters<typeof real.createInitialWorld>)=>{
    const world = real.createInitialWorld(...args);
    const original = world.cultivators[0];
    for(let n=world.cultivators.length+1;n<=fixture.actorCount;n++){
      const person = structuredClone(original);
      person.id = 'one-hand-person-'+n;
      person.name = '流名客 '+n;
      person.artifacts = [];
      if (n===fixture.actorCount){person.alive=false;person.hp=0;}
      world.cultivators.push(person);
    }
    return world;
  }};
});

afterEach(() => vi.unstubAllGlobals());
const noop = () => undefined;
const controls = (html:string) => Array.from(html.matchAll(/<button\b[^>]*>(.*?)<\/button>/g),
  match => match[1].replace(/<[^>]*>/g,'').trim());
const tabs = (html:string) => Array.from(html.matchAll(/<button\b[^>]*role="tab"[^>]*>(.*?)<\/button>/g),
  match => match[1].replace(/<[^>]*>/g,'').trim());
async function renderLoadedMap(): Promise<string> {
  // Real Node stream at runtime without introducing @types/node to the browser repo.
  const streamModule = 'node:stream';
  type TestOutput = { setEncoding(encoding: string): unknown; on(event: string, callback: (...args: string[]) => void): unknown };
  const {PassThrough} = await import(streamModule) as {PassThrough: new () => TestOutput};
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    let html = '';
    output.setEncoding('utf8');
    output.on('data', (part: string) => { html += part; });
    output.on('error', reject);
    output.on('end', () => resolve(html));
    const render = renderToPipeableStream(<App initialWorkspace="map" />, {
      onAllReady: () => render.pipe(output),
      onShellError: reject,
      onError: reject,
    });
  });
}
function localMode(value: string | null) {
  const read = vi.fn((key:string)=>key===HANDEDNESS_STORAGE_KEY?value:null);
  const write = vi.fn();
  const remove = vi.fn();
  vi.stubGlobal('localStorage', {getItem:read,setItem:write,removeItem:remove});
  return {read,write,remove};
}
const handle = (world:WorldState, selectedId:string) =>
  renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={selectedId} compact toolsOpen
    onSelectCultivator={noop} onBrushStroke={noop} />);

describe('local-only handedness uses existing semantic controls with large rosters', () => {
  it.each([48,526])('keeps existing App DOM action and workspace order with %i actual actor records', (count) => {
    fixture.actorCount = count;
    const world = createInitialWorld(173);
    const order = ['地图','人物','纪事','宗门','世界'];
    const modes = [[null,'default'],['left','left'],['right','right']] as const;
    const snapshots = modes.map(([saved,expected])=>{
      const local = localMode(saved);
      const page = renderToStaticMarkup(<App initialWorkspace="map" />);
      expect(page).toContain('data-controls-hand="'+expected+'"');
      expect(page).toContain('data-controls-workspace="map"');
      expect(page).toContain('在世 ' + (count-1));
      expect(page).toContain('已陨落 1');
      expect(page.match(/data-control-dock="repeat"/g)).toHaveLength(1);
      expect(page).not.toContain('data-control-dock="back"');
      expect(tabs(page)).toEqual(order);
      expect(page.match(/role="tab"[^>]*tabindex="0"/g)).toHaveLength(1);
      expect((page.match(/tabindex="[1-9]\d*"/g)??[])).toHaveLength(0);
      const buttons = controls(page.match(/<header\b[^>]*>.*?<\/header>/)?.[0] ?? '');
      // The header itself keeps the exact action sequence. The real top-level
      // lazy map duplicate is covered separately by streaming to onAllReady.
      expect(buttons.filter((name)=>name==='自动推演')).toHaveLength(1);
      expect(buttons.filter((name)=>name==='单步推演')).toHaveLength(1);
      expect(buttons.indexOf('自动推演')).toBeLessThan(buttons.indexOf('单步推演'));
      expect(local.read).toHaveBeenCalledWith(HANDEDNESS_STORAGE_KEY);
      expect(local.write).not.toHaveBeenCalled();
      expect(local.remove).not.toHaveBeenCalled();
      return buttons;
    });
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);

    // Verify the focused tail actor against the actual opened map tools, not an App suspense fallback.
    expect(world.cultivators).toHaveLength(count);
    const map = handle(world,world.cultivators.at(-1)!.id);
    expect(map.match(/data-control-dock="map-tools"/g)).toHaveLength(1);
    expect(map.match(/data-control-dock-body="map-tools"/g)).toHaveLength(1);
    expect(map.match(/aria-label="地图工具"/g)).toHaveLength(1);
    expect(map.match(/aria-label="放大地图"/g)).toHaveLength(1);
    expect(map.match(/aria-label="缩小地图"/g)).toHaveLength(1);
    expect(map.indexOf('<canvas')).toBeLessThan(map.indexOf('aria-label="地图工具"'));
    expect((map.match(/tabindex="[1-9]\d*"/g)??[])).toHaveLength(0);
    expect(world.cultivators).toHaveLength(count);
  });

  it('waits for the real lazy map in App and renders a single native autoplay button in both opt-ins', async () => {
    fixture.actorCount = 48;
    for (const [mode, expected] of [[null,2],['left',1],['right',1]] as const) {
      localMode(mode);
      const page = await renderLoadedMap();
      expect(page).toContain('<canvas');
      expect(page.match(/data-control-dock="map-tools"/g)).toHaveLength(1);
      expect(controls(page).filter(name=>name==='自动推演')).toHaveLength(expected);
      expect(controls(page).filter(name=>name==='单步推演')).toHaveLength(1);
    }
  });

  it('places one explicit selector in existing world settings and ignores stored actor/branch fields', () => {
    fixture.actorCount = 48;
    const local = localMode(JSON.stringify({hand:'left',actorId:'captured-actor-id',branchId:'captured-branch-id'}));
    const view = renderToStaticMarkup(<App initialWorkspace="world" initialSection="settings" />);
    expect(view).toContain('data-controls-hand="default"');
    expect(view.match(/id="one-hand-control"/g)).toHaveLength(1);
    expect(view).toContain('单手操作');
    const selector = view.match(/<select\b[^>]*id="one-hand-control"[^>]*>.*?<\/select>/)?.[0];
    expect(selector).toMatch(/value="default" selected=""/);
    expect(selector).toContain('value="left"');
    expect(selector).toContain('value="right"');
    expect(view).not.toMatch(/captured-actor-id|captured-branch-id/);
    expect(local.write).not.toHaveBeenCalled();
    expect(tabs(view)).toHaveLength(5);
  });
});
