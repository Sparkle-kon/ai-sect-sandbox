import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator } from '../src/types/world';

const noSelect = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [leader, previous, other, supporter] = world.cultivators;
  const [sect, different] = world.sects;
  leader.sectId = sect.id;
  previous.sectId = sect.id;
  supporter.sectId = sect.id;
  other.sectId = different.id;
  sect.leaderId = leader.id;
  sect.succession = {
    tick: 19,
    method: 'challenge',
    previousLeaderId: previous.id,
    leaderId: leader.id,
    supporterIds: [supporter.id],
  };
  different.leaderId = undefined;
  different.succession = undefined;
  leader.sectRank = '掌门';
  leader.contribution = 96;
  previous.sectRank = '长老';
  previous.contribution = 41;
  other.sectRank = '内门弟子';
  other.contribution = 13;
  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={noSelect} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={noSelect} />
  );
  return { leader, previous, supporter, other, sect, different, inspect, map };
}

describe('sect hierarchy UI', () => {
  it('shows selected member’s rank, contribution, leadership and latest succession evidence', () => {
    const { leader, previous, supporter, sect, inspect } = makeWorld();
    const html = inspect(previous);
    const panel = html.split('aria-label="宗门地位与传位"')[1]?.split('</section>')[0];
    expect(panel).toMatch(/宗门位阶<\/dt><dd[^>]*>长老<\/dd>/);
    expect(panel).toMatch(/宗门贡献<\/dt><dd[^>]*>41<\/dd>/);
    expect(panel).toContain(`${sect.name}掌门</dt><dd class="text-slate-200">${leader.name}</dd>`);
    expect(panel).toContain('位阶与继任记录');
    expect(panel).toContain('至少金丹 · 贡献 75');
    expect(panel).toContain('经传位产生，不按贡献自动晋升');
    expect(panel).toMatch(/<li aria-current="true"><span[^>]*>长老<\/span>/);
    expect(panel).toContain('挑战 · Tick #19');
    expect(panel).toContain(`前任：</dt><dd>${previous.name}</dd>`);
    expect(panel).toContain(`记录支持者：</dt><dd>${supporter.name}</dd>`);
    expect(panel?.indexOf('外门弟子')).toBeLessThan(panel?.indexOf('太上长老') ?? -1);
  });

  it('shows vacant and outsider cases without borrowing another sect’s succession record', () => {
    const { other, different, inspect, map } = makeWorld();
    const html = inspect(other);
    expect(html).toContain(`${different.name}掌门</dt><dd class="text-slate-200">空缺</dd>`);
    expect(html).toContain('尚无传位记录。');
    expect(html).not.toContain('挑战 · Tick #19');
    other.sectId = 'sect-missing';
    expect(inspect(other)).toContain('散修，无宗门位阶或宗门贡献。');
    expect(map(other.id)).not.toContain('宗门位阶：');
  });

  it('limits the map to public selected rank and marks a deceased member’s rank as an archive', () => {
    const { leader, previous, other, sect, different, inspect, map } = makeWorld();
    expect(map(leader.id)).toContain(`宗门位阶：${sect.name} · 掌门`);
    expect(map(leader.id)).not.toContain('挑战 · Tick #19');
    expect(map(other.id)).toContain(`宗门位阶：${different.name} · 内门弟子`);
    expect(map(null)).not.toContain('宗门位阶：');
    previous.alive = false;
    expect(inspect(previous)).toContain('长老（陨落留档）');
    expect(map(previous.id)).toContain(`宗门位阶：${sect.name} · 长老 · 留档`);
  });
});
