import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { RelicSetPanel } from '../src/components/RelicSetPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeRelicResonance } from '../src/engine/artifactEngine';
import type { Artifact, RelicFragment } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 8;
  const [actor, outsider] = world.cultivators;
  const local = world.locations.find(({ id }) => id === actor.locationId)!;
  const concealed = world.locations.find(({ id, type }) => id !== local.id && type === 'secret_realm')!;
  local.name = '已知重铸炉址';
  concealed.name = '不可透露的埋藏地';
  actor.artifacts = [];
  actor.spiritStones = 200;
  actor.herbs.earth_root = 5;
  local.furnaceGrade = 2;
  const frame: RelicFragment = { id: 'private-fragment-frame-id', setId: 'star-balance', slot: 'frame',
    holder: { kind: 'actor', id: actor.id }, source: { kind: 'wild_cache', locationId: local.id, tick: 3 } };
  const core: RelicFragment = { id: 'private-fragment-core-id', setId: 'star-balance', slot: 'core',
    holder: { kind: 'site', id: concealed.id }, source: { kind: 'expedition', locationId: concealed.id,
      tick: 4, eventId: 'do-not-display-raw-source-event-id', occasionId: 'do-not-display-raw-occasion-id' } };
  world.relics.fragments = [frame, core];
  const html = (person = actor) => renderToStaticMarkup(<RelicSetPanel world={world} actor={person} />);
  return { world, actor, outsider, local, frame, core, html };
}

describe('relic fragments and actual resonance presentation', () => {
  it('lists only held pieces and their safe provenance, not hidden unheld cache or record IDs', () => {
    const { html, outsider } = fixture();
    const output = html();
    expect(output).toContain('星衡合璧 · 持有碎片 1 件');
    expect(output).toContain('星衡外环 · 野外寻得 · Tick #3 · 已知重铸炉址');
    expect(output).toContain('缺少：灵纹内芯');
    expect(output).toContain('当前不符合重铸条件');
    expect(output).not.toContain('秘境远征所获');
    expect(output).not.toContain('不可透露的埋藏地');
    expect(output).not.toMatch(/private-fragment|do-not-display/);
    expect(html(outsider)).toBe('');
  });

  it('uses the actual legal assembly gate with source, needed materials, and forge grade', () => {
    const { actor, local, core, html } = fixture();
    core.holder = { kind: 'actor', id: actor.id };
    expect(html()).toContain('秘境远征所获 · Tick #4');
    expect(html()).toContain('当前符合重铸条件');
    expect(html()).toContain('已持有全部所需碎片');
    expect(html()).toContain('需 120 灵石与玄土根 2 株，至少 2 阶丹炉');
    local.furnaceGrade = 1;
    expect(html()).toContain('当前不符合重铸条件');
    expect(html()).toContain('当前地点丹炉 1 阶');
    core.holder = { kind: 'estate', id: 'private-estate-id' };
    expect(html()).toContain('缺少：灵纹内芯');
    expect(html()).not.toContain('private-estate-id');
  });

  it('keeps owned expedition provenance useful after the temporary gate disappears', () => {
    const { world, actor, core, html } = fixture();
    core.holder = { kind: 'actor', id: actor.id };
    world.locations = world.locations.filter(({ id }) => id !== core.source.locationId);
    expect(html()).toContain('秘境远征所获 · Tick #4 · 已关闭秘境');
    world.occasions.push({ id: core.source.occasionId!, kind: 'expedition', title: '已记载的远征', locationId: core.source.locationId,
      startedTick: 1, registrationClosesTick: 2, expiresTick: 5, status: 'completed', participantIds: [actor.id], remainingIds: [],
      bouts: [], expeditions: [], round: 1, lastResolvedTick: 4 });
    expect(html()).toContain('秘境远征所获 · Tick #4 · 已记载的远征');
    expect(html()).not.toContain('do-not-display-raw');
  });

  it('displays one real active effect only when equipped and functional', () => {
    const { actor, outsider, frame, core, html } = fixture();
    const relic: Artifact = { id: 'crafted-star-set', name: '新铸星衡', tier: '法宝', spiritRoot: '土',
      boundTo: actor.id, durability: 60, relicSetId: 'star-balance', relicFragmentIds: [frame.id, core.id] };
    frame.holder = core.holder = { kind: 'consumed', id: relic.id! };
    actor.artifacts = [relic, { ...relic, id: 'another-carry', name: '另一件备用法宝' }];
    const output = html();
    expect(activeRelicResonance(actor)).toBe(.12);
    expect(output).toContain('套装共鸣已生效');
    expect(output.match(/当前战斗倍率额外 \+12%/g)).toHaveLength(1);
    expect(output).toContain('只生效一次，不叠加');
    expect(output).toContain('参与重铸的组件不再单独持有');
    actor.artifacts[0].durability = 0;
    actor.artifacts[1].boundTo = outsider.id;
    expect(html()).toContain('套装共鸣未生效');
    expect(html()).not.toContain('+12%');
  });

  it('does not add a homepage or unrelated character-pane feature', () => {
    const { world, actor, outsider } = fixture();
    const inspect = (person: typeof actor, workspaceSection: 'profile' | 'cultivation') => renderToStaticMarkup(
      <AgentInspector world={world} cultivator={person} onSelectCultivator={() => undefined} workspaceSection={workspaceSection} />);
    expect(renderToStaticMarkup(<App />)).not.toContain('套装记录');
    expect(inspect(actor, 'profile')).not.toContain('套装记录');
    expect(inspect(outsider, 'cultivation')).not.toContain('套装记录');
    expect(inspect(actor, 'cultivation')).toContain('载入套装记录');
  });
});
