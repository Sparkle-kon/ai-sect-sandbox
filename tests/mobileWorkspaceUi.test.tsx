import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { ACTOR_PAGE_SIZE, ActorRoster, getActorRosterPage } from '../src/components/ActorRoster';
import { SandboxWorkspace, WorkspaceSections } from '../src/components/SandboxWorkspace';
import { createInitialWorld } from '../src/data/initialWorld';

describe('mobile-first sandbox workspaces', () => {
  it('defaults exclusively to the map and selected character summary without mounting secondary stacks', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html.match(/role="tab"/g)).toHaveLength(5);
    expect(html.match(/role="tab"[^>]*aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/tab-map[^>]*role="tab" aria-selected="true"/);
    expect(html).toContain('aria-label="当前修士"');
    expect(html).toContain('单步推演');
    expect(html).toContain('自动推演');
    expect(html).toContain('在世 ');
    expect(html).toContain('已陨落 ');
    expect(html).not.toContain('存活修士');
    expect(html).not.toContain('天道观测与演化统计');
    expect(html).not.toContain('凡人村镇与赈济');
    expect(html).not.toContain('天气观测');
    expect(html).not.toContain('天道契书与宗门仲裁');
    expect(html).not.toContain('深层执念');
    expect(html).not.toContain('修士名册');
  });

  it('uses focusable tab semantics, keeps the map instance hidden and only renders the selected secondary workspace', () => {
    const html = renderToStaticMarkup(<SandboxWorkspace active="people" onChange={() => undefined}
      views={{ map: <b>保留地图状态</b>, people: <b>显示人物</b>, chronicle: <b>不挂载纪事</b>, sect: <b>不挂载宗门</b>, world: <b>不挂载世界</b> }} />);
    expect(html).toMatch(/tab-people[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(html).toMatch(/aria-labelledby="[^" ]*-tab-map" hidden=""[^>]*data-workspace="map"><b>保留地图状态/);
    expect(html).toContain('显示人物');
    expect(html).not.toContain('不挂载纪事');
    expect(html).not.toContain('不挂载世界');
    expect(html).toContain('min-h-11');
    expect(html).toContain('safe-area-inset-bottom');
    const groups = renderToStaticMarkup(<WorkspaceSections label="测试目录" initialOpen="two" sections={[
      { id: 'one', label: '条目甲', content: <p>不挂载甲内容</p> },
      { id: 'two', label: '条目乙', content: <p>挂载乙内容</p> },
    ]} />);
    expect(groups.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(groups).not.toContain('不挂载甲内容');
    expect(groups).toContain('挂载乙内容');
  });

  it('pages the full roster beyond 48 characters and can find and inspect late arrivals and fallen actors', () => {
    const world = createInitialWorld();
    world.cultivators = Array.from({ length: 229 }, (_, index) => ({
      ...world.cultivators[0], id: `r${index + 1}`, name: `新增修士${index + 1}`, alive: index % 2 === 0,
    }));
    const first = getActorRosterPage(world, '', 'all', 0);
    expect(first.actors).toHaveLength(ACTOR_PAGE_SIZE);
    expect(first.total).toBe(229);
    const last = getActorRosterPage(world, '', 'all', first.pages - 1);
    expect(last.actors.at(-1)?.name).toBe('新增修士229');
    expect(new Set(Array.from({ length: first.pages }, (_, page) => getActorRosterPage(world, '', 'all', page).actors.map(({ id }) => id)).flat()).size).toBe(229);
    expect(getActorRosterPage(world, ' 新增修士２２９ ', 'living', 0).actors[0]?.id).toBe('r229');
    expect(getActorRosterPage(world, '新增修士228', 'fallen', 0).actors[0]?.id).toBe('r228');
    const html = renderToStaticMarkup(<ActorRoster world={world} onSelect={() => undefined} />);
    expect(html).toContain('修士名册 · 229 位');
    expect(html).toContain('下一页');
    expect(html).not.toContain('新增修士229');
    expect(world.cultivators).toHaveLength(229);
  });

  it('keeps a safe way back when a focused target is no longer verified', () => {
    const html = renderToStaticMarkup(<SandboxWorkspace active="people" onChange={() => undefined} hideActiveContent
      panelLead={<button>返回原纪事</button>}
      views={{ map: <b>保留地图</b>, people: <b>不显示失效目标</b>, chronicle: null, sect: null, world: null }} />);
    expect(html).toContain('返回原纪事');
    expect(html).not.toContain('不显示失效目标');
    expect(html).toContain('保留地图');
    expect(html.match(/role="tab"/g)).toHaveLength(5);
  });
});
