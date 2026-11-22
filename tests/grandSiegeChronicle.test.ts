import { describe, expect, it } from 'vitest';
import { actualGrandSiege, actualSiege, siegeActor, siegeTurn } from './grandSiegeNativeFixture';

describe('the grand siege chronicles only a genuine battlefield scene', () => {
  it('keeps the rendezvous quiet and names the exact fighters only after their native first clash', () => {
    const { arrived } = actualGrandSiege();
    const siege = actualSiege(arrived);
    expect(arrived.events.some(event => event.id.endsWith('-front-theatre'))).toBe(false);
    const fought = siegeTurn(arrived);
    const native = actualSiege(fought);
    const round = native.theatre?.rounds[0];
    const clash = round?.clash;
    if (!round || !clash) throw new Error('Expected a genuine first-round clash');
    const scenes = fought.events.filter(event => event.id === `evt-${fought.tick}-${siege.id}-front-theatre`);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({ locationId: siege.destinationId, category: 'combat',
      actorIds: [clash.attackerId, clash.defenderId] });
    expect(scenes[0].description).toContain(siegeActor(fought, clash.winnerId).name + '占得上风');
    expect(fought.events.find(event => event.id === round.sourceEventId)?.description)
      .toBe(`护山阵受损${round.wallBefore - round.wallAfter}，尚余${round.wallAfter}阵力。`);
  });
});
