import type { Cultivator, WorldState } from '../types/world';
import type { WorkspaceId } from './SandboxWorkspace';

export interface WorkspaceFoldPreferences {
  sections: Partial<Record<Exclude<WorkspaceId, 'map'>, string | null>>;
  mapTools?: boolean;
}

export const WORKSPACE_FOLD_STORAGE_KEY = 'ai-sect:workspace-folds:v1';
const VERSION = 1;
const MAX_STORAGE_CHARS = 512;

// Only stable UI names belong here. Context-dependent visibility is checked against
// the rendered section list separately; nothing here stores actor or branch scope.
const SEMANTIC_SECTIONS = {
  people: ['profile', 'cultivation', 'mind', 'relationships', 'pilgrimage', 'trace', 'possession'],
  chronicle: ['feed', 'library', 'notebook', 'rank-season', 'timeline', 'witness', 'estate'],
  sect: ['governance', 'oaths', 'doctrine', 'relocation', 'ceasefire', 'research', 'sanctuary', 'credit', 'council'],
  world: ['weather', 'markets', 'villages', 'occasions', 'bounties', 'analytics', 'god', 'scenario', 'settings'],
} satisfies Record<Exclude<WorkspaceId, 'map'>, readonly string[]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safePrefs(value: unknown): WorkspaceFoldPreferences {
  const clean: WorkspaceFoldPreferences = { sections: {} };
  if (!isRecord(value)) return clean;
  if (Object.hasOwn(value, 'sections') && isRecord(value.sections)) {
    for (const workspace of Object.keys(SEMANTIC_SECTIONS) as Array<keyof typeof SEMANTIC_SECTIONS>) {
      if (!Object.hasOwn(value.sections, workspace)) continue;
      const section = value.sections[workspace];
      if (section === null || typeof section === 'string' && SEMANTIC_SECTIONS[workspace].includes(section)) {
        clean.sections[workspace] = section;
      }
    }
  }
  if (Object.hasOwn(value, 'mapTools') && typeof value.mapTools === 'boolean') clean.mapTools = value.mapTools;
  return clean;
}

export function readWorkspaceFoldPreferences(): WorkspaceFoldPreferences {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(WORKSPACE_FOLD_STORAGE_KEY);
      if (raw && raw.length <= MAX_STORAGE_CHARS) {
        const value: unknown = JSON.parse(raw);
        if (isRecord(value) && value.version === VERSION && isRecord(value.sections)) return safePrefs(value);
      }
    }
  } catch { /* Unavailable, blocked, or corrupt preference storage is optional. */ }
  return { sections: {} };
}

export function writeWorkspaceFoldPreferences(value: WorkspaceFoldPreferences): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WORKSPACE_FOLD_STORAGE_KEY, JSON.stringify({ version: VERSION, ...safePrefs(value) }));
    }
  } catch { /* The in-memory UI preference remains usable when persistence fails. */ }
}

export function chooseWorkspaceSection(
  validIds: readonly string[] | ReadonlySet<string>,
  defaultOpen?: string,
  remembered?: string | null,
  forced?: string,
): string | undefined {
  const valid = (id: string | undefined): id is string =>
    typeof id === 'string' && ('has' in validIds ? validIds.has(id) : validIds.includes(id));
  if (valid(forced)) return forced;
  if (remembered === null) return undefined;
  if (valid(remembered)) return remembered;
  return valid(defaultOpen) ? defaultOpen : undefined;
}

export function resolveWorkspaceActor(world: Pick<WorldState, 'cultivators'>, requestedId?: string | null): Cultivator | undefined {
  const requested = requestedId ? world.cultivators.find(({ id }) => id === requestedId) : undefined;
  return requested ?? world.cultivators.find(({ alive, hp }) => alive && hp > 0);
}
