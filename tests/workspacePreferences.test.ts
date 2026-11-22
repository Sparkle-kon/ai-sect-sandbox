import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  chooseWorkspaceSection, readWorkspaceFoldPreferences, resolveWorkspaceActor, WORKSPACE_FOLD_STORAGE_KEY,
  writeWorkspaceFoldPreferences,
} from '../src/components/workspacePreferences';
import type { WorkspaceFoldPreferences } from '../src/components/workspacePreferences';

function browser() {
  const store = new Map<string, string>();
  const getItem = vi.fn((key: string) => store.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => { store.set(key, value); });
  vi.stubGlobal('window', { localStorage: { getItem, setItem } });
  return { store, getItem, setItem };
}

afterEach(() => vi.unstubAllGlobals());

describe('device-local workspace folds', () => {
  it('preserves explicit collapse, absent preference and false as three separate states', () => {
    const { store, setItem } = browser();
    expect(readWorkspaceFoldPreferences()).toEqual({ sections: {} });
    writeWorkspaceFoldPreferences({ sections: { people: 'mind', chronicle: null }, mapTools: false });
    expect(readWorkspaceFoldPreferences()).toEqual({ sections: { people: 'mind', chronicle: null }, mapTools: false });
    expect(JSON.parse(store.get(WORKSPACE_FOLD_STORAGE_KEY)!)).toEqual({
      version: 1, sections: { people: 'mind', chronicle: null }, mapTools: false,
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    writeWorkspaceFoldPreferences({ sections: { people: 'profile', world: 'settings' } });
    expect(readWorkspaceFoldPreferences()).toEqual({ sections: { people: 'profile', world: 'settings' } });
  });

  it('persists only the explicit desktop roster boolean, independently of other workspace folds',()=>{
    const {store}=browser();
    writeWorkspaceFoldPreferences({sections:{people:'profile'},rosterDesktop:false});
    expect(readWorkspaceFoldPreferences()).toEqual({sections:{people:'profile'},rosterDesktop:false});
    writeWorkspaceFoldPreferences({sections:{people:null},rosterDesktop:true});
    expect(readWorkspaceFoldPreferences()).toEqual({sections:{people:null},rosterDesktop:true});
    store.set(WORKSPACE_FOLD_STORAGE_KEY,'{"version":1,"sections":{},"rosterDesktop":"closed","rosterMobile":true}');
    expect(readWorkspaceFoldPreferences()).toEqual({sections:{}});
  });

  it('never serializes identifiers, arbitrary strings or unrelated contextual/device state', () => {
    const { store } = browser();
    writeWorkspaceFoldPreferences({
      sections: { map: 'map', people: 'npc-2', chronicle: 'feed', sect: 'mind', world: 'settings', branch: 'private-branch' },
      mapTools: 1, worldId: 'hidden-world', apiKey: 'private-secret', url: 'https://fixture.invalid/',
    } as unknown as WorkspaceFoldPreferences);
    expect(store.size).toBe(1);
    expect(store.get(WORKSPACE_FOLD_STORAGE_KEY)).toBe(
      '{"version":1,"sections":{"chronicle":"feed","world":"settings"}}',
    );
    store.set(WORKSPACE_FOLD_STORAGE_KEY, '{"version":1,"sections":{"people":"profile","world":null,"__proto__":{"council":true},"other":42},"mapTools":true,"url":"private"}');
    expect(readWorkspaceFoldPreferences()).toEqual({ sections: { people: 'profile', world: null }, mapTools: true });
  });

  it('ignores disabled storage, oversized, malformed, and different wire versions', () => {
    const { store, getItem, setItem } = browser();
    for (const raw of ['{', '{"version":2,"sections":{"people":"profile"}}',
      '{"version":1,"sections":[],"mapTools":true}', '{"version":1,"mapTools":true}',
      '{"version":1,"sections":{"people":"profile"},"junk":"' + 'x'.repeat(513) + '"}']) {
      store.set(WORKSPACE_FOLD_STORAGE_KEY, raw);
      expect(readWorkspaceFoldPreferences()).toEqual({ sections: {} });
    }
    getItem.mockImplementation(() => { throw new Error('Disabled'); });
    setItem.mockImplementation(() => { throw new Error('Quota denied'); });
    expect(readWorkspaceFoldPreferences()).toEqual({ sections: {} });
    expect(() => writeWorkspaceFoldPreferences({ sections: { people: 'profile' } })).not.toThrow();
    vi.stubGlobal('window', Object.defineProperty({}, 'localStorage', { get() { throw new Error('Blocked'); } }));
    expect(readWorkspaceFoldPreferences()).toEqual({ sections: {} });
    expect(() => writeWorkspaceFoldPreferences({ sections: {} })).not.toThrow();
    vi.stubGlobal('window', undefined);
    expect(readWorkspaceFoldPreferences()).toEqual({ sections: {} });
  });
});

describe('current workspace context resolution', () => {
  it('uses only valid forced/remembered/default folds while honoring explicit close', () => {
    const active = ['profile', 'cultivation', 'trace'];
    expect(chooseWorkspaceSection(active, 'profile', 'cultivation', 'trace')).toBe('trace');
    expect(chooseWorkspaceSection(active, 'profile', 'cultivation', 'possession')).toBe('cultivation');
    expect(chooseWorkspaceSection(active, 'profile', null, 'trace')).toBe('trace');
    expect(chooseWorkspaceSection(active, 'profile', null, 'possession')).toBeUndefined();
    expect(chooseWorkspaceSection(new Set(active), 'profile', 'possession')).toBe('profile');
    expect(chooseWorkspaceSection(active, 'possession')).toBeUndefined();
    expect(chooseWorkspaceSection([], 'profile', 'profile', 'profile')).toBeUndefined();
  });

  it('uses only actors from the shown world, permits explicit fallen selection but does not default to fallen', () => {
    const world = createInitialWorld(13);
    const [first, living] = world.cultivators;
    first.alive = false;
    first.hp = 0;
    expect(resolveWorkspaceActor(world, first.id)).toBe(first);
    expect(resolveWorkspaceActor(world, 'not-available-in-this-world')).toBe(living);
    expect(resolveWorkspaceActor(world, null)).toBe(living);
    expect(resolveWorkspaceActor({ cultivators: [first] }, undefined)).toBeUndefined();
    expect(resolveWorkspaceActor({ cultivators: [] }, first.id)).toBeUndefined();
  });
});
