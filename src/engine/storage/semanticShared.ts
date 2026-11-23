import { fail } from './primitives';

export function unique<T>(items: T[], key: (item: T) => string, path: string): Set<string> {
  const keys = new Set(items.map(key));
  if (keys.size !== items.length) fail(path);
  return keys;
}
