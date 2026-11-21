import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ACTOR_PAGE_SIZE, ActorRoster, getActorRosterPage } from '../src/components/ActorRoster';
import { SandboxWorkspace, WorkspaceSections } from '../src/components/SandboxWorkspace';
import { resolveWorkspaceActor } from '../src/components/workspacePreferences';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator, WorldState } from '../src/types/world';

function populated(size: 48 | 526): WorldState {
  const world = createInitialWorld(137);
  const base = world.cultivators[0];
  for (let n = world.cultivators.length + 1; n <= size; n++) {
    const newActor: Cultivator = {
      ...structuredClone(base),
      id: `fold-fixture-person-${n}`,
      name: `名册试修${String(n).padStart(3, '0')}`,
      alive: n !== size,
      hp: n === size ? 0 : base.hp,
      artifacts: [],
    };
    world.cultivators.push(newActor);
  }
  return world;
}

describe('mobile workspace focus with complete rosters', () => {
  it.each([48, 526] as const)('keeps %i real person records selectable, including the last fallen actor', (size) => {
    const world = populated(size);
    const first = getActorRosterPage(world, '', 'all', 0);
    expect(first.total).toBe(size);
    expect(first.actors).toHaveLength(ACTOR_PAGE_SIZE);
    const pages = Array.from({ length: first.pages }, (_, page) => getActorRosterPage(world, '', 'all', page));
    expect(pages.flatMap(({ actors }) => actors.map(({ id }) => id))).toEqual(world.cultivators.map(({ id }) => id));
    const tail = world.cultivators.at(-1)!;
    const found = getActorRosterPage(world, tail.name, 'fallen', 123);
    expect(found).toMatchObject({ page: 0, pages: 1, total: 1 });
    expect(found.actors).toEqual([tail]);
    expect(getActorRosterPage(world, tail.name, 'living', 0).total).toBe(0);
    const selected = resolveWorkspaceActor(world, found.actors[0].id)!;
    expect(selected).toBe(tail);
    const archive = <WorkspaceSections label={`${selected.name} · 人物档案`} initialOpen="profile" sections={[
      { id: 'profile', label: '人物概况', content: <p data-actor-id={selected.id}>已选定：{selected.name} · 已陨落</p> },
      { id: 'mind', label: '心声与记忆', content: <p>不打开另一面板</p> },
    ]} />;
    const markup = renderToStaticMarkup(<SandboxWorkspace active="people" onChange={() => undefined}
      views={{ map: null, people: <>{archive}<ActorRoster world={world} selected={selected} onSelect={() => undefined} /></>,
        chronicle: null, sect: null, world: null }} />);
    expect(markup).toContain(`data-actor-id="${tail.id}"`);
    expect(markup).toContain(`已选定：${tail.name} · 已陨落`);
    expect(markup).toContain(`修士名册 · ${size} 位`);
    expect(markup.match(/role="tab"/g)).toHaveLength(5);
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(markup).not.toContain('不打开另一面板');
    // Searching and navigation are UI projections; an arbitrarily large roster remains untouched.
    expect(world.cultivators).toHaveLength(size);
  });

  it('switches to a present living actor on an older branch and never silently substitutes another fallen record', () => {
    const present = populated(526);
    const selected = present.cultivators.at(-1)!;
    expect(resolveWorkspaceActor(present, selected.id)).toBe(selected);
    const historical = structuredClone(present);
    historical.cultivators = historical.cultivators.slice(1, 48);
    historical.cultivators[0].alive = false;
    historical.cultivators[0].hp = 0;
    const fallback = historical.cultivators[1];
    expect(resolveWorkspaceActor(historical, selected.id)).toBe(fallback);
    expect(resolveWorkspaceActor({ cultivators: [historical.cultivators[0]] }, selected.id)).toBeUndefined();
    expect(resolveWorkspaceActor({ cultivators: [historical.cultivators[0]] }, historical.cultivators[0].id)).toBe(historical.cultivators[0]);

    // A newly imported world starts a new focus request; coincidental ids are not transferable context.
    const imported = createInitialWorld(9987);
    const namedOther = imported.cultivators[1];
    namedOther.id = selected.id;
    namedOther.name = '不同导入世界的同编号修士';
    expect(resolveWorkspaceActor(imported, null)).toBe(imported.cultivators[0]);
    expect(resolveWorkspaceActor(imported, null)).not.toBe(namedOther);
  });

  it('honors an explicitly saved collapse but never mounts a stale branch-conditional section', () => {
    const sections = [
      { id: 'profile', label: '人物概况', content: <p>本分支当前资料</p> },
      { id: 'mind', label: '心声与记忆', content: <p>可用偏好资料</p> },
    ];
    const render = (rememberedOpen: string | null, forcedOpen?: string) =>
      renderToStaticMarkup(<WorkspaceSections label="人物档案" sections={sections} initialOpen="profile"
        rememberedOpen={rememberedOpen} forcedOpen={forcedOpen} />);
    const closed = render(null);
    expect(closed).toContain('更多内容');
    expect(closed).not.toContain('本分支当前资料');
    expect(closed).not.toContain('可用偏好资料');
    expect(closed).not.toContain('aria-expanded="true"');
    expect(render(null, 'profile')).toContain('本分支当前资料');
    expect(render(null)).not.toContain('本分支当前资料');
    const restored = render('mind', 'possession');
    expect(restored).toContain('可用偏好资料');
    expect(restored).not.toContain('本分支当前资料');
    const fallback = render('pilgrimage', 'possession');
    expect(fallback).toContain('本分支当前资料');
    expect(fallback).not.toContain('可用偏好资料');
    expect(fallback.match(/aria-expanded="true"/g)).toHaveLength(1);
  });
});
