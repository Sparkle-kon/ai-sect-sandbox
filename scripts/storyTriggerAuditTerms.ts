import type { WorldEvent, WorldState } from '../src/types/world';

export type AuditedStoryTask = `P${19 | 20 | 21 | 22}-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
export type StoryAuditMode = 'native' | 'player-triggered' | 'interface';

export interface StoryAuditTurn {
  readonly before: WorldState;
  readonly after: WorldState;
  readonly events: readonly WorldEvent[];
}

export interface StoryAuditProbe {
  readonly id: AuditedStoryTask;
  readonly title: string;
  readonly mode: StoryAuditMode;
  /** Describe the concrete event/transition this counter observes, not interpretation of a title. */
  readonly evidence: string;
  readonly observe?: (turn: StoryAuditTurn) => readonly string[];
}

export function currentEventIds({ after, events }: StoryAuditTurn, identity: RegExp): string[] {
  if (identity.global || identity.sticky) throw new Error('Story trigger identity must not depend on regex state');
  return events.filter(event => event.tick === after.tick && identity.test(event.id)).map(({ id }) => id);
}

export function enteredEpisodeIds<T>(
  before: readonly T[], after: readonly T[], resolve: (row: T) => string | undefined,
): string[] {
  const previous = new Set(before.flatMap(row => resolve(row) ?? []));
  return after.flatMap(row => {
    const key=resolve(row);
    return key&&!previous.has(key)?[key]:[];
  });
}
