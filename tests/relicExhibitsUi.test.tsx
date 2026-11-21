import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { RelicExhibitsPanel } from '../src/components/RelicExhibitsPanel';
import { SectEconomyPanel } from '../src/components/SectEconomyPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { RelicExhibit } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 16;
  const [host, originSect] = world.sects;
  host.facilities.scripture_pavilion = Math.max(1, host.facilities.scripture_pavilion);
  const signer = world.cultivators.find(({ id }) => id === host.leaderId)!;
  const owner = world.cultivators.find(({ id }) => id === originSect.leaderId)!;
  const visitor = world.cultivators.find(({ id }) => id !== signer.id && id !== owner.id)!;
  owner.name = '仅签署方可知的原持有人';
  const venue = world.locations.find(({ id }) => id === host.headquartersId)!;
  venue.name = '现场展出地点';
  signer.locationId = visitor.locationId = venue.id;
  owner.locationId = venue.id;
  const custody = {
    id: 'recorded-exhibit-item', name: '不公开法器原名', spiritRoot: '木' as const, durability: 83, maxDurability: 95,
    relicSetId: 'star-balance' as const, relicFragmentIds: ['fragment-x', 'fragment-y'] as [string, string],
  };
  world.relics.fragments = [
    { id: 'fragment-x', setId: 'star-balance', slot: 'frame', holder: { kind: 'consumed', id: custody.id },
      source: { kind: 'wild_cache', tick: 4, locationId: 'private-origin-coordinate-tile' } },
    { id: 'fragment-y', setId: 'star-balance', slot: 'core', holder: { kind: 'consumed', id: custody.id },
      source: { kind: 'expedition', tick: 6, locationId: 'hidden-expedition-id', eventId: 'hidden-expedition-event' } },
  ];
  const exhibit: RelicExhibit = {
    id: 'example-exhibit', artifactId: custody.id, setId: 'star-balance', ownerId: owner.id, hostSectId: host.id, hostLeaderId: signer.id,
    siteId: venue.id, offeredTick: 11, offerExpiresTick: 14, status: 'on_display', acceptedTick: 13, expiresTick: 19, custody,
  };
  world.relicExhibits.entries = [exhibit];
  const panel = (actor = owner) => renderToStaticMarkup(<RelicExhibitsPanel world={world} cultivator={actor} />);
  return { world, host, owner, signer, visitor, venue, exhibit, custody, panel };
}

describe('sanitized onsite relic exhibition and private participant ledger', () => {
  it('one closed fold in sect economy; onsite public sees only true set/source kinds and period', () => {
    const { world, host, visitor, panel } = fixture();
    const mount = renderToStaticMarkup(<SectEconomyPanel world={world} sect={host} cultivator={visitor} />);
    expect(mount).toMatch(/<details class="[^"]+"><summary class="[^"]+">法宝公展与公开溯源/);
    const observed = panel(visitor);
    expect(observed).toContain('星衡合璧 · 现场公开展出');
    expect(observed).toContain('现场展出地点 · 展期 Tick #13 至 #19 前');
    expect(observed).toContain('公开溯源类别：秘境远征、野外寻获');
    for (const secret of ['仅签署方可知的原持有人', '不公开法器原名', 'recorded-exhibit-item', 'private-origin-coordinate-tile', 'hidden-expedition-event', '83', '私人出展邀约']) {
      expect(observed).not.toContain(secret);
    }
    expect(renderToStaticMarkup(<App />)).not.toContain('法宝公展与公开溯源');
  });

  it('proposes privately with no false acceptance, then shows actual role consent for participants only', () => {
    const { world, exhibit, custody, owner, signer, visitor, panel } = fixture();
    world.tick = 12;
    exhibit.status = 'offered'; exhibit.acceptedTick = undefined; exhibit.expiresTick = undefined; exhibit.custody = undefined;
    owner.artifacts = [custody];
    expect(panel()).toContain('本人出展 · 等待主展方签署');
    expect(panel(signer)).toContain('本人主持签署 · 等待主展方签署');
    expect(panel(signer)).toContain('持有人 仅签署方可知的原持有人');
    expect(panel(signer)).not.toContain('主展方实际同意');
    expect(panel(visitor)).toBe('');
    world.tick = 13;
    exhibit.status = 'on_display'; exhibit.acceptedTick = 13; exhibit.expiresTick = 19; exhibit.custody = custody;
    owner.artifacts = [];
    expect(panel(signer)).toContain('主展方实际同意 Tick #13 · 展期截止 Tick #19');
    expect(panel(visitor)).toContain('现场公开展出');
  });

  it('does not display to an offsite visitor or after expiry, but keeps participant closure without assuming return', () => {
    const { world, exhibit, visitor, owner, panel, venue } = fixture();
    const remote = world.locations.find(({ x, y }) => Math.hypot(x - venue.x, y - venue.y) > 320)!;
    visitor.locationId = remote.id;
    expect(panel(visitor)).toBe('');
    visitor.locationId = venue.id;
    world.tick = 19;
    expect(panel(visitor)).toBe('');
    exhibit.status = 'closed'; exhibit.closedTick = 19; exhibit.closeReason = 'term_complete'; exhibit.custody = undefined;
    expect(panel(owner)).toContain('结案：展期届满 · Tick #19');
    expect(panel(owner)).not.toContain('已经返还');
    expect(panel(visitor)).toBe('');
  });
});
