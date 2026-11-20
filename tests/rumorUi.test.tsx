import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator } from '../src/types/world';

const ignoreSelection = () => undefined;
const hearsay = '剑冢里藏有失落的剑谱。';

function makeWorld() {
  const world = createInitialWorld();
  const [witness, recipient, inventor] = world.cultivators;
  const place = world.locations[0];
  witness.rumors = [{
    id: 'observed',
    subject: '山门外曾起异光。',
    locationId: place.id,
    originTick: 3,
    learnedTick: 3,
    provenance: 'witness',
    confidence: 100,
    hops: 0,
  }];
  recipient.rumors = [{
    id: 'invented',
    subject: hearsay,
    originTick: 5,
    learnedTick: 6,
    provenance: 'conversation',
    confidence: 62,
    hops: 1,
    sourceCultivatorId: inventor.id,
  }, {
    id: 'relayed',
    subject: '<灵符>已到',
    locationId: place.id,
    originTick: 3,
    learnedTick: 7,
    provenance: 'flying_sword',
    confidence: 79,
    hops: 2,
    sourceCultivatorId: witness.id,
  }];
  inventor.rumors = [{
    id: 'invented',
    subject: hearsay,
    originTick: 5,
    learnedTick: 5,
    provenance: 'fabricated',
    confidence: 10,
    hops: 0,
  }];
  world.tick = 7;
  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={ignoreSelection} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={ignoreSelection} />
  );
  return { witness, recipient, inventor, place, inspect, map };
}

describe('cultivator rumor UI', () => {
  it('reveals only the selected cultivator’s provenance, not the hidden origin of a secondhand story', () => {
    const { witness, recipient, inventor, place, inspect } = makeWorld();
    const witnessed = inspect(witness);
    expect(witnessed).toContain('亲历见闻');
    expect(witnessed).toContain(`地点：${place.name}`);
    expect(witnessed).not.toContain(hearsay);

    const invented = inspect(inventor);
    expect(invented).toContain(hearsay);
    expect(invented).toContain('自己编造');

    const heard = inspect(recipient);
    expect(heard).toContain(hearsay);
    expect(heard).toContain('当面转述');
    expect(heard).toContain('飞剑传书');
    expect(heard).toContain('传闻不等于事实');
    expect(heard).not.toContain('自己编造');
    expect(heard).not.toContain('山门外曾起异光。');
    expect(heard).toContain(`传自：${inventor.name}`);
    expect(heard).toContain('信任度 62/100');
    expect(heard).toContain('经手 1 次');
    expect(heard).toContain('获知 Tick #6 · 消息起始 Tick #5');
    expect(heard).toContain('地点：未详');
    expect(heard).toContain('&lt;灵符&gt;已到');
    expect(heard.indexOf('&lt;灵符&gt;已到')).toBeLessThan(heard.indexOf(hearsay));
  });

  it('summarizes only counts for the selected map target, not any rumor text', () => {
    const { witness, recipient, inventor, map } = makeWorld();
    expect(map(witness.id)).toContain('见闻与流言 1 条 · 转述 0 条');
    const received = map(recipient.id);
    expect(received).toContain('见闻与流言 2 条 · 转述 2 条');
    expect(received).not.toContain(hearsay);
    expect(map(inventor.id)).toContain('见闻与流言 1 条 · 转述 0 条');
    expect(map(null)).not.toContain('见闻与流言');
  });

  it('handles an empty archive without asserting that missing news never occurred', () => {
    const { recipient, inspect } = makeWorld();
    recipient.rumors = [];
    recipient.alive = false;
    const archive = inspect(recipient);
    expect(archive).toContain('此处保留修士陨落时获知的消息。');
    expect(archive).toContain('暂无见闻或流言。');
    expect(archive).not.toContain('当面转述');
  });
});
