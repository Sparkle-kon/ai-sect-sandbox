import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VillageGranaryPanel } from '../src/components/VillageGranaryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { VillageGranary } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(78);
  world.tick = 20;
  const [donor, local, distant] = world.cultivators;
  const village = world.settlements.villages[0];
  const site = world.locations.find(({ id }) => id === village.locationId)!;
  const far = world.locations.find(({ id }) => id !== site.id)!;
  donor.locationId = local.locationId = site.id;
  distant.locationId = far.id;
  distant.exploredTileIds = [terrainTileAt(world, site.x, site.y)!.id];
  donor.name = '外人不得知悉的捐赠者';
  village.lastDisasterTick = 18;
  world.settlements.records.push({
    id: 'real-current-disaster', tick: 18, settlementId: village.id, kind: 'disaster', people: 1, stones: 0, herbs: 0, description: '',
  });
  village.stress = 45;
  const granary: VillageGranary = {
    settlementId: village.id, roots: 1, stones: 4, donatedRoots: 2, donatedStones: 8, spentRoots: 1, spentStones: 4,
    lastDrawTick: 19, receipts: [
      { tick: 18, actorId: donor.id, kind: 'donate' },
      { tick: 19, actorId: local.id, kind: 'draw', stressBefore: 53, stressAfter: 45, disasterTick: 18 },
    ],
  };
  world.villageGranaries = { granaries: [granary] };
  const view = (actor = local) => renderToStaticMarkup(<VillageGranaryPanel world={world} cultivator={actor} settlementId={village.id} />);
  return { world, donor, local, distant, village, granary, view };
}

describe('actual local granary reserves and draw receipts', () => {
  it('displays independently accounted stocks and shortage rules, with no money, residents, or authority implied', () => {
    const { donor, distant, view } = fixture();
    const local = view();
    expect(local).toMatch(/<details class="[^"]+"><summary class="[^"]+">义仓库存与短缺支取/);
    expect(local).toContain('单笔实捐 玄土根 2 株、灵石 8');
    expect(local).toContain('压力至少 35 且仍有幸存者');
    expect(local).toContain('相隔至少 2 回合');
    expect(local).toContain('不向个人发款、不增加人口或形成债务');
    expect(local).toContain('实存玄土根</dt><dd>1/20 株');
    expect(local).toContain('实存灵石</dt><dd>4/80');
    expect(local).toContain('累计实捐：玄土根 2 株、灵石 8');
    expect(local).toContain('累计实用：玄土根 1 株、灵石 4');
    expect(local).toContain('最近实灾 Tick #18');
    expect(local).toContain('本次实灾 Tick #18 · 压力 53 → 45');
    expect(local).not.toMatch(/外人不得知悉的捐赠者|本人实捐|<button/);
    expect(view(donor)).toContain('本人实捐');
    expect(view(distant)).toBe('');
  });

  it('shows actual zero balance and no event when no stock record exists; omits receipt dates beyond snapshot', () => {
    const { world, local, village, granary, view } = fixture();
    granary.receipts.push({ tick: world.tick + 1, actorId: local.id, kind: 'donate' });
    expect(view()).not.toContain('Tick #21 ·');
    world.villageGranaries.granaries = [];
    const empty = view();
    expect(empty).toContain('实存玄土根</dt><dd>0/20 株');
    expect(empty).toContain('未保留捐入或支取凭证');
    expect(empty).not.toContain('实际支取');
    expect(renderToStaticMarkup(<VillageGranaryPanel world={world} settlementId={village.id} />)).toBe('');
  });
});
