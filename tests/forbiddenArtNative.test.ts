import {describe,expect,it} from 'vitest';
import { equippedArtifact } from '../src/engine/artifactEngine';
import { projectGuidedForbiddenDuel, queueGuidedForbiddenArt } from '../src/engine/forbiddenArtEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import { actualAwakenedArtifact, actualForbiddenContact, artActor, artDuel, artOwnerId, artTurn, strongRivalId } from './forbiddenArtNativeFixture';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),reopened=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(reopened)).toBe(raw);
  return reopened;
}

describe('native forbidden art through a genuinely built and awakened artifact',()=>{
  it('pays native forge, binding and awakening after three real fights, not a prefilled spirit',()=>{
    const {world,itemId,forgedTick}=actualAwakenedArtifact();
    expect(artActor(world).artifacts).toContainEqual(expect.objectContaining({id:itemId,soul:expect.any(Object)}));
    expect(world.tick).toBeGreaterThan(forgedTick+3);
    const healthy=artActor(world);
    expect(healthy.hp/healthy.maxHp).toBeGreaterThanOrEqual(.25);
    const ordinary=artTurn(world,{[strongRivalId]:artDuel(artOwnerId)});
    expect(ordinary.forbiddenDuels??[]).toHaveLength(0);
    expect(ordinary.events).toContainEqual(expect.objectContaining({tick:ordinary.tick,duelWinnerId:strongRivalId,
      actorIds:[strongRivalId,artOwnerId]}));
  });

  it('holds a legal contact without phantom damage, and settles an explicit refusal as the real original fatal duel',()=>{
    const {wounded,offered,contact}=actualForbiddenContact();
    const before=artActor(wounded),open=artActor(offered);
    expect([open.hp,open.lifespan,equippedArtifact(open)?.durability]).toEqual([before.hp,before.lifespan,equippedArtifact(before)?.durability]);
    expect(open.forbiddenScars).toBeUndefined();
    expect(offered.events.some(row=>row.tick===offered.tick&&row.duelWinnerId&&row.actorIds.includes(open.id))).toBe(false);
    expect(projectGuidedForbiddenDuel(offered)).toBeDefined();
    expect(queueGuidedForbiddenArt(offered,contact.attackerId,contact.id,'decline')).toBe(offered);
    expect(queueGuidedForbiddenArt(offered,contact.ownerId,'stale-contact','decline')).toBe(offered);
    const refused=queueGuidedForbiddenArt(strict(offered),contact.ownerId,contact.id,'decline');
    expect(refused.tick).toBe(offered.tick);
    expect(queueGuidedForbiddenArt(refused,contact.ownerId,contact.id,'decline')).toBe(refused);
    const lost=artTurn(refused);
    expect(encodeEraWorldSave(artTurn(strict(refused)))).toBe(encodeEraWorldSave(lost));
    expect(artActor(lost)).toMatchObject({hp:0,alive:false});
    expect(lost.events).toContainEqual(expect.objectContaining({tick:lost.tick,category:'death',duelWinnerId:strongRivalId,
      actorIds:[strongRivalId,artOwnerId],locationId:contact.siteId}));
    expect(artActor(lost).forbiddenScars).toBeUndefined();
    expect(lost.forbiddenDuels??[]).toHaveLength(0);
  });

  it('uses the identical genuine saved contact to pay for a real escape and keeps one durable exact scar',()=>{
    const {offered,contact,itemId}=actualForbiddenContact();
    const original=artActor(offered),rival=artActor(offered,strongRivalId);
    const current=strict(offered),choice='severed-shadow-flight';
    const ordered=queueGuidedForbiddenArt(current,contact.ownerId,contact.id,choice);
    expect(ordered).not.toBe(current);
    expect(artActor(ordered).hp).toBe(original.hp);
    const escaped=artTurn(ordered);
    const survived=artActor(escaped),opponent=artActor(escaped,strongRivalId),scar=survived.forbiddenScars?.[0]!;
    expect(survived.alive).toBe(true);
    expect(opponent.alive).toBe(true);
    expect(scar).toMatchObject({contactId:contact.id,artId:choice,ownerId:contact.ownerId,opponentId:rival.id,
      artifactId:itemId,siteId:contact.siteId,tick:escaped.tick,result:'escape',origin:'player'});
    expect(scar.paid).toEqual({hp:Math.round(original.maxHp*.062),lifespan:0,durability:10});
    expect(original.hp-survived.hp).toBe(scar.paid.hp);
    expect(original.lifespan-survived.lifespan).toBe(scar.paid.lifespan);
    expect(equippedArtifact(original)!.durability!-equippedArtifact(survived)!.durability!).toBe(scar.paid.durability);
    expect([survived.locationId,opponent.locationId]).toEqual([original.locationId,rival.locationId]);
    const publicRecord=escaped.events.find(row=>row.tick===escaped.tick&&row.forbiddenArt?.id===scar.id);
    expect(publicRecord).toMatchObject({category:'combat',locationId:contact.siteId,forbiddenArt:scar});
    expect(publicRecord?.duelWinnerId).toBeUndefined();
    expect(opponent.hp).toBe(rival.hp);
    expect(survived.forbiddenScars).toHaveLength(1);
    expect(artActor(strict(escaped)).forbiddenScars).toEqual([scar]);
    expect(artActor(artTurn(escaped)).forbiddenScars).toEqual([scar]);
    expect(queueGuidedForbiddenArt(escaped,contact.ownerId,contact.id,choice)).toBe(escaped);
  });

  it('spends a genuine four-year reserve to survive without inventing a victory over the stronger actor',()=>{
    const {offered,contact}=actualForbiddenContact();
    const prior=artActor(offered),choice='verdant-last-breath';
    const ordered=queueGuidedForbiddenArt(offered,contact.ownerId,contact.id,choice);
    expect(ordered).not.toBe(offered);
    const survived=artTurn(ordered),actor=artActor(survived),opponent=artActor(survived,strongRivalId);
    expect(actor).toMatchObject({alive:true,hp:1,lifespan:prior.lifespan-4,locationId:prior.locationId});
    expect(opponent.alive).toBe(true);
    expect(actor.forbiddenScars).toEqual([expect.objectContaining({contactId:contact.id,artId:choice,
      paid:{hp:0,lifespan:4,durability:9},result:'survived',origin:'player'})]);
    expect(survived.events).toContainEqual(expect.objectContaining({tick:survived.tick,duelWinnerId:opponent.id,
      actorIds:[opponent.id,actor.id],locationId:contact.siteId,description:expect.stringContaining('青木续息')}));
    expect(strict(survived).tick).toBe(survived.tick);
  });

  it('actually reverses the same native doomed duel against a higher realm without inventing a kill',()=>{
    const {offered,contact}=actualForbiddenContact(true,1000);
    const weaker=artActor(offered),stronger=artActor(offered,strongRivalId);
    expect([weaker.realm,stronger.realm]).toEqual(['金丹','元婴']);
    expect(weaker.combatPower).toBeLessThan(stronger.combatPower);
    const settle=(choice:'decline'|'falling-star-echo')=>{
      const source=strict(offered),sealed=queueGuidedForbiddenArt(source,contact.ownerId,contact.id,choice);
      expect(sealed).not.toBe(source);
      const result=artTurn(sealed);
      const scene=result.events.find(row=>row.tick===result.tick&&row.duelWinnerId&&row.actorIds.includes(stronger.id))!;
      return {result,scene};
    };
    const doomed=settle('decline'),reversed=settle('falling-star-echo');
    expect(doomed.scene.duelWinnerId).toBe(stronger.id);
    expect(artActor(doomed.result).alive).toBe(false);
    expect(reversed.scene.duelWinnerId).toBe(weaker.id);
    expect(artActor(reversed.result).alive).toBe(true);
    expect(artActor(reversed.result,stronger.id).alive).toBe(true);
    expect(reversed.scene.forbiddenArt).toMatchObject({contactId:contact.id,result:'reversal',paid:{lifespan:3},
      artId:'falling-star-echo',origin:'player'});
    expect(artActor(reversed.result).lifespan).toBe(weaker.lifespan-3);
    expect(strict(reversed.result).tick).toBe(reversed.result.tick);
  });
});
