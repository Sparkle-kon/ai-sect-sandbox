import { describe, expect, it, vi } from 'vitest';
import { HANDEDNESS_STORAGE_KEY, readHandednessPreference, writeHandednessPreference,
  type HandednessPreference } from '../src/components/handednessPreference';

function storage(raw = new Map<string, string>()) {
  return { raw,
    getItem: (key: string) => raw.get(key) ?? null,
    setItem: (key: string, value: string) => { raw.set(key, value); },
    removeItem: (key: string) => { raw.delete(key); },
  };
}

describe('local one-handed layout preference', () => {
  it('persists only the exact semantic enum under its own key, and reset removes only that key', () => {
    const browser = storage(new Map([
      ['other.local.setting', 'existing'], ['saved.current.actor-id', 'should-not-touch'],
    ]));
    expect(readHandednessPreference(browser)).toBe('default');
    expect(writeHandednessPreference('left', browser)).toBe(true);
    expect(browser.raw.get(HANDEDNESS_STORAGE_KEY)).toBe('left');
    expect(readHandednessPreference(browser)).toBe('left');
    expect(writeHandednessPreference('right', browser)).toBe(true);
    expect(readHandednessPreference(browser)).toBe('right');
    expect([...browser.raw.entries()]).toEqual([
      ['other.local.setting', 'existing'], ['saved.current.actor-id', 'should-not-touch'],
      [HANDEDNESS_STORAGE_KEY, 'right'],
    ]);
    expect(writeHandednessPreference('default', browser)).toBe(true);
    expect(readHandednessPreference(browser)).toBe('default');
    expect([...browser.raw.entries()]).toEqual([
      ['other.local.setting', 'existing'], ['saved.current.actor-id', 'should-not-touch'],
    ]);
  });

  it('rejects malformed raw content without writing or reading branch, timeline or actor metadata', () => {
    const getItem = vi.fn(() => JSON.stringify({ mode: 'left', actorId: 'captured', branchId: 'other', timelineId: 'secret' }));
    expect(readHandednessPreference({ getItem })).toBe('default');
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenCalledWith(HANDEDNESS_STORAGE_KEY);
    for (const value of ['LEFT', ' left ', 'nul', '0', 'default', '']) {
      expect(readHandednessPreference(storage(new Map([[HANDEDNESS_STORAGE_KEY, value]])))).toBe('default');
    }
    const writes = { setItem: vi.fn(), removeItem: vi.fn() };
    const forged = 'actor-999' as HandednessPreference;
    expect(writeHandednessPreference(forged, writes)).toBe(false);
    expect(writes.setItem).not.toHaveBeenCalled();
    expect(writes.removeItem).not.toHaveBeenCalled();
  });

  it('degrades safely when storage or its accessors are denied; no browser state is required for default', () => {
    const denied = () => { throw new DOMException('blocked', 'SecurityError'); };
    expect(readHandednessPreference({ getItem: denied })).toBe('default');
    expect(writeHandednessPreference('left', { setItem: denied, removeItem: denied })).toBe(false);
    expect(writeHandednessPreference('default', { setItem: denied, removeItem: denied })).toBe(false);
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: denied });
    try {
      expect(readHandednessPreference()).toBe('default');
      expect(writeHandednessPreference('right')).toBe(false);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
