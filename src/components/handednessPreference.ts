export type HandednessPreference = 'default' | 'left' | 'right';

export const HANDEDNESS_STORAGE_KEY = 'ai-sect-sandbox:control-handedness:v1';

/** This is a display control only, never a world, actor, source, or keyboard-order preference. */
export function readHandednessPreference(storage?: Pick<Storage, 'getItem'>): HandednessPreference {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(HANDEDNESS_STORAGE_KEY);
    return value === 'left' || value === 'right' ? value : 'default';
  } catch {
    // In a denied/unsupported browser the page still has its original control layout.
    return 'default';
  }
}

export function writeHandednessPreference(value: HandednessPreference,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>): boolean {
  if (value !== 'default' && value !== 'left' && value !== 'right') return false;
  try {
    const backend = storage ?? globalThis.localStorage;
    if (!backend) return false;
    if (value === 'default') backend.removeItem(HANDEDNESS_STORAGE_KEY);
    else backend.setItem(HANDEDNESS_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}
