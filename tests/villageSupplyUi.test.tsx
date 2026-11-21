import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MortalVillagesPanel } from '../src/components/MortalVillagesPanel';
import { VillageGranaryPanel } from '../src/components/VillageGranaryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { resolveVillageGranaryAction } from '../src/engine/villageGranaryEngine';
import { advanceVillageSupply, resolveVillageSupplyAction } from '../src/engine/villageSupplyEngine';
import type { WorldState } from '../src/types/world';

const actorAt = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id)!;
const villages = (world: WorldState, id: string) => renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={actorAt(world, id)} />);
const supplyFold = (markup: string) => markup.split('村镇互助与实运')[1]?.split('</details>')[0] ?? '';

function fixture() {
  const world = createInitialWorld(725);
  world.tick = 24;
  const a = world.settlements.villages[0];
  const b = world.settlements.villages.find(({ locationId }) => world.locations.some(({ id, type }) => id === locationId && type === 'spirit_vein'))!;
  a.name = '同名川村'; b.name = '起初不该显示的远村';
  const [aSite, bSite] = [a, b].map(({ locationId }) => world.locations.find(({ id }) => id === locationId)!);
  Object.assign(aSite, { x: 220, y: 220 });
  Object.assign(bSite, { x: 500, y: 220 });
  const [proposer, acceptor, outsider] = world.cultivators;
  for (const actor of [proposer, acceptor, outsider]) Object.assign(actor, {
    realm: '练气', age: 35, hp: actor.maxHp, spiritStones: 150, tribulation: undefined,
    exploredTileIds: world.terrain.tiles.map(({ id }) => id),
  });
  proposer.locationId = aSite.id;
  acceptor.locationId = bSite.id;
  outsider.locationId = aSite.id;
  proposer.herbs.earth_root = acceptor.herbs.earth_root = 30;
  for (let i = 0; i < 2; i++) {
    expect(resolveVillageGranaryAction(world, proposer, { chosenAction: 'VILLAGE_GRANARY',
      innerMonologue: '', granaryMove: 'donate_roots', targetSettlementId: a.id })).not.toBeNull();
    expect(resolveVillageGranaryAction(world, acceptor, { chosenAction: 'VILLAGE_GRANARY',
      innerMonologue: '', granaryMove: 'donate_stones', targetSettlementId: b.id })).not.toBeNull();
    ++world.tick;
  }
  const offer = resolveVillageSupplyAction(world, proposer, { chosenAction: 'VILLAGE_SUPPLY', innerMonologue: '',
    villageSupplyMove: 'offer', targetSettlementId: b.id });
  expect(offer?.witnessScope).toBe('participants');
  const row = world.villageSupply.agreements[0];
  const accept = () => {
    ++world.tick;
    expect(resolveVillageSupplyAction(world, acceptor, { chosenAction: 'VILLAGE_SUPPLY', innerMonologue: '',
      villageSupplyMove: 'accept', targetVillageSupplyId: row.id })).not.toBeNull();
  };
  const brush = (kind: 'beast_tide' | 'cursed_miasma', count: number) => {
    const tile = world.terrain.tiles.find(({ id }) => id === row.path![1])!;
    const point = { x: (tile.col + .5) * 1000 / world.terrain.columns, y: (tile.row + .5) * 600 / world.terrain.rows };
    let next = world;
    for (let i = 0; i < count; i++) next = applyMapBrush(next, kind, [point]);
    return { next, tile };
  };
  return { world, a, b, proposer, acceptor, outsider, row, accept, brush };
}

describe('known village supply, exact two legs and single-asset receipts', () => {
  it('shows only a default-closed authorized current village slip, never guesses the unobserved remote village name', () => {
    const { world, proposer, acceptor, outsider, row } = fixture();
    proposer.exploredTileIds = [];
    const text = villages(world, proposer.id);
    const local = supplyFold(text);
    expect(text).toMatch(/<details[^>]*><summary class="min-h-11[^"]*">村镇互助与实运<\/summary>/);
    expect(local).toContain('本村「同名川村」与未观测对村');
    expect(local).toContain('邀约待同意（未发货）');
    expect(local).toContain('现场本仓实存：玄土根 4 株、灵石 0；不含在途物资');
    expect(local).toContain('本村拟出 玄土根 2 株、拟收 灵石 8');
    expect(local).not.toMatch(/<button|已确认并从原仓实拨|起初不该显示的远村/);
    expect(text).not.toContain(row.id);
    expect(supplyFold(villages(world, acceptor.id))).toContain('本村拟出 灵石 8、拟收 玄土根 2 株');
    expect(supplyFold(villages(world, outsider.id))).toBe('');
    proposer.locationId = world.locations[0].id;
    expect(supplyFold(villages(world, proposer.id))).toBe('');
  });

  it('separates same-name villages by fixed direction and real returns from the opposite leg’s actual landing', () => {
    const { world, a, b, proposer, acceptor, row, accept, brush } = fixture();
    b.name = a.name;
    accept();
    const local = supplyFold(villages(world, proposer.id));
    expect(local).toContain('本村「同名川村」与对村「同名川村」');
    expect(local).toContain('本村发出 · 玄土根 2 株');
    expect(local).toContain('本村应收 · 灵石 8');
    expect(supplyFold(villages(world, acceptor.id))).toContain('本村发出 · 灵石 8');
    expect(local).toContain('双方经办各实际付运费 4 灵石');
    expect(local).toContain(`距发货仓的已核查进度 0/${row.path!.length - 1} 段`);
    expect(local).not.toContain('已实收进目的仓');
    const { next, tile } = brush('cursed_miasma', 2);
    ++next.tick;
    advanceVillageSupply(next);
    const halfway = supplyFold(villages(next, proposer.id));
    expect(halfway).toContain('实货已退回原仓');
    expect(halfway).toContain('下一段不安全，未向前继续');
    expect(halfway).toContain('在途，尚未抵仓');
    while (next.tick < world.tick + row.path!.length + 2) { ++next.tick; advanceVillageSupply(next); }
    const done = supplyFold(villages(next, proposer.id));
    expect(done).toContain('两路均已结案');
    expect(done).toContain('结案不表示两路都已送达');
    expect(done).toContain('实货已退回原仓');
    expect(done).toContain('已实收进目的仓');
    expect(done).not.toContain(tile.id);
  });

  it('only shows proven loss and separately itemizes actual single-good granary donations', () => {
    const { world, a, b, proposer, acceptor, accept, brush } = fixture();
    const granary = (id: string, local: string) => renderToStaticMarkup(<VillageGranaryPanel world={world}
      cultivator={actorAt(world, id)} settlementId={local} />).split('仍保留的收支实录')[1] ?? '';
    const rootReceipt = granary(proposer.id, a.id);
    const stoneReceipt = granary(acceptor.id, b.id);
    expect(rootReceipt).toContain('本人实捐 玄土根 2 株');
    expect(rootReceipt).not.toContain('灵石 8');
    expect(stoneReceipt).toContain('本人实捐 灵石 8');
    expect(stoneReceipt).not.toContain('玄土根 2 株');
    accept();
    const { next, tile } = brush('beast_tide', 3);
    const hazard = next.mapHazards.find((row) => row.tileId === tile.id && row.kind === 'beast_tide')!;
    ++next.tick;
    advanceVillageSupply(next);
    const lost = supplyFold(villages(next, proposer.id));
    expect(lost).toContain('核实途中货损，不入仓');
    expect(lost).toContain('途经严重兽潮（强度 3）时核实全批损失');
    expect(lost).not.toContain(hazard.id);
    expect(lost).not.toContain(tile.id);
  });
});
