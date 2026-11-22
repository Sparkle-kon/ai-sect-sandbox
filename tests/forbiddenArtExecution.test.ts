import { describe, expect, it } from 'vitest';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { queueGuidedForbiddenArt } from '../src/engine/forbiddenArtEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { executeGodIntervention } from '../src/engine/worldEngine';
import { actualForbiddenContact, actualThreatenedDuel, artActor, artDuel, artOwnerId, artTurn, strongRivalId } from './forbiddenArtNativeFixture';

describe('the native lethal tail of a genuine forbidden art', () => {
  it('cancels a contact struck down in the current frame without paying the queued art', () => {
    const { offered, contact } = actualForbiddenContact();
    const site = offered.locations.find(row => row.id === contact.siteId);
    if (!site) throw new Error('Expected the real battle site');
    const queued = queueGuidedForbiddenArt(offered, contact.ownerId, contact.id, 'falling-star-echo');
    const prior = artActor(queued);
    const changed = applyMapBrush(queued, 'meteor', [{ x: site.x, y: site.y }]);
    expect(changed.tick).toBe(offered.tick);
    expect(artActor(changed)).toMatchObject({ alive: false, hp: 0, lifespan: prior.lifespan });
    expect(changed.forbiddenDuels).toBeUndefined();
    expect(artActor(changed).forbiddenScars).toBeUndefined();
    expect(changed.events.every(event => !event.forbiddenArt)).toBe(true);
    const bytes = encodeEraWorldSave(changed);
    expect(encodeEraWorldSave(decodeEraWorldSave(bytes))).toBe(bytes);
  });

  it('can turn a doomed defender into the actual winner without duplicating death or relic custody', () => {
    const { wounded } = actualThreatenedDuel(true, 1000);
    const first = executeGodIntervention(wounded, { type: 'TRIBULATION_STRIKE', targetCultivatorId: strongRivalId });
    const bothWounded = executeGodIntervention(first, { type: 'TRIBULATION_STRIKE', targetCultivatorId: strongRivalId });
    const owner = artActor(bothWounded), opponent = artActor(bothWounded, strongRivalId);
    expect([owner.realm, opponent.realm]).toEqual(['金丹', '元婴']);
    expect(owner.combatPower).toBeLessThan(opponent.combatPower);
    expect(opponent.hp).toBeGreaterThan(0);
    const contactWorld = artTurn(bothWounded, { [strongRivalId]: artDuel(artOwnerId) });
    const contact = contactWorld.forbiddenDuels?.[0];
    if (!contact) throw new Error('Expected genuine threatened contact');
    const paid = queueGuidedForbiddenArt(contactWorld, owner.id, contact.id, 'falling-star-echo');
    const done = artTurn(paid);
    expect(artActor(done).alive).toBe(true);
    expect(artActor(done, opponent.id)).toMatchObject({ alive: false, hp: 0 });
    const id = `evt-${done.tick}-${opponent.id}-kill`;
    const events = done.events.filter(event => event.id === id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: 'death', duelWinnerId: owner.id, actorIds: [opponent.id, owner.id],
      forbiddenArt: { result: 'reversal', paid: { lifespan: 3 }, contactId: contact.id } });
    const bytes = encodeEraWorldSave(done);
    expect(encodeEraWorldSave(decodeEraWorldSave(bytes))).toBe(bytes);
    expect(artTurn(done).events.filter(event => event.id === id)).toHaveLength(1);
  });
});
