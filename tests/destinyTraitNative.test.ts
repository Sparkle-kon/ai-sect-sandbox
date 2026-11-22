import { describe, expect, it } from 'vitest';
import { activeAvatar, possessAvatar } from '../src/engine/avatarEngine';
import { activeDestinyTraitOffer, chooseDestinyTraitDecision, destinyCultivationMultiplier, destinyDuelDamageMultiplier, resolveGuidedDestinyTrait } from '../src/engine/destinyTraitEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { DESTINY_TRAIT_CATALOG } from '../src/engine/destinyTraitCatalog';
import { DESTINY_TRAIT_IDS } from '../src/types/destinyTrait';
import type { WorldState } from '../src/types/world';
import { actualDestinyOrdinary, actualDestinyTrial, destinyActor, destinyMonth } from './destinyTraitNativeFixture';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world);
  const reopened=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(reopened)).toBe(raw);
  return reopened;
}

describe('destiny awakening after real native breakthroughs',()=>{
  it('waits until an actual major trial passes, then the very same NPC makes one independent later choice',()=>{
    const {initial,opening,last,passed}=actualDestinyTrial();
    for(const world of [initial,opening,last])expect(activeDestinyTraitOffer(world,destinyActor(world))).toBeUndefined();
    const actor=destinyActor(passed);
    const offer=activeDestinyTraitOffer(passed,actor)!;
    expect(offer).toMatchObject({actorId:actor.id,fromRealm:'筑基',realm:'金丹',openedTick:passed.tick,
      sourceEventId:`evt-${passed.tick}-${actor.id}-tribulation-passed`});
    expect(passed.events).toContainEqual(expect.objectContaining({
      id:offer.sourceEventId,category:'breakthrough',actorIds:[actor.id],locationId:actor.locationId,
    }));
    expect(new Set(offer.options).size).toBe(3);
    expect(offer.options.every(option=>DESTINY_TRAIT_IDS.includes(option))).toBe(true);
    expect(destinyActor(actualDestinyTrial().passed).destinyTraits).toEqual(actor.destinyTraits);
    expect(resolveGuidedDestinyTrait(passed,offer.id,offer.options[0])).toBe(passed);
    const control=destinyMonth(passed), reopened=destinyMonth(strict(passed));
    expect(encodeEraWorldSave(control)).toBe(encodeEraWorldSave(reopened));
    const awakened=destinyActor(control);
    expect(awakened.destinyTraits?.earned).toHaveLength(1);
    expect(awakened.destinyTraits?.pending).toBeUndefined();
    const entry=awakened.destinyTraits!.earned[0];
    expect(entry).toMatchObject({id:offer.id,chosenTick:control.tick,realm:'金丹'});
    expect(offer.options).toContain(entry.traitId);
    expect(destinyActor(destinyMonth(control,chooseDestinyTraitDecision(passed,actor))).destinyTraits)
      .toEqual(awakened.destinyTraits);
  });

  it('lets the live possessed body choose one specific same-month trait on actual 化神 to 炼虚',()=>{
    const {initial,advanced}=actualDestinyOrdinary();
    const actor=destinyActor(advanced),offer=activeDestinyTraitOffer(advanced,actor)!;
    expect(activeAvatar(advanced)?.id).toBe(actor.id);
    expect(offer).toMatchObject({actorId:actor.id,fromRealm:'化神',realm:'炼虚',openedTick:advanced.tick,
      sourceEventId:`evt-${advanced.tick}-${actor.id}-break`});
    expect(destinyActor(initial).destinyTraits).toBeUndefined();
    const unoffered=DESTINY_TRAIT_IDS.find(id=>!offer.options.includes(id))!;
    expect(resolveGuidedDestinyTrait(advanced,offer.id,unoffered)).toBe(advanced);
    expect(resolveGuidedDestinyTrait(advanced,'same-date-another-id',offer.options[0])).toBe(advanced);
    const released=strict(advanced);
    expect(possessAvatar(released,null)).toBe(true);
    expect(resolveGuidedDestinyTrait(released,offer.id,offer.options[0])).toBe(released);
    for(const option of offer.options){
      const current=strict(advanced),result=resolveGuidedDestinyTrait(current,offer.id,option);
      expect(result).not.toBe(current);
      expect([result.tick,result.year,result.month]).toEqual([current.tick,current.year,current.month]);
      const actual=destinyActor(result);
      expect(actual).toMatchObject({realm:'炼虚',realmStage:1,combatPower:actor.combatPower});
      expect(actual.destinyTraits?.earned).toEqual([expect.objectContaining({
        id:offer.id,traitId:option,chosenTick:current.tick,sourceEventId:offer.sourceEventId,
      })]);
      expect(actual.destinyTraits?.pending).toBeUndefined();
      expect(resolveGuidedDestinyTrait(result,offer.id,option)).toBe(result);
      expect(encodeEraWorldSave(destinyMonth(strict(result)))).toBe(encodeEraWorldSave(destinyMonth(result)));
    }
  });

  it('changes the qi actually credited by identical native cultivation after distinct legitimate traits',()=>{
    const {advanced}=actualDestinyOrdinary();
    const offer=activeDestinyTraitOffer(advanced,destinyActor(advanced))!;
    const possibilities=offer.options.map(option=>{
      const world=resolveGuidedDestinyTrait(advanced,offer.id,option);
      return {world,option,bonus:destinyCultivationMultiplier(destinyActor(world))};
    }).sort((a,b)=>b.bonus-a.bonus);
    const high=possibilities[0],low=possibilities.at(-1)!;
    expect(high.option).not.toBe(low.option);
    expect(high.bonus).toBeGreaterThan(low.bonus);
    const practice=(world:WorldState)=>destinyMonth(world,{chosenAction:'CULTIVATE',innerMonologue:'等量照常修炼。'});
    const afterHigh=destinyActor(practice(high.world)),afterLow=destinyActor(practice(low.world));
    expect([afterHigh.currentAction,afterLow.currentAction]).toEqual(['CULTIVATE','CULTIVATE']);
    expect(afterHigh.qiProgress).toBeGreaterThan(afterLow.qiProgress);
    expect(afterHigh.combatPower).toBe(afterLow.combatPower);
  });

  it('lets rash and cautious uncontrolled NPCs choose differently from exactly the same rolled options',()=>{
    const rash=actualDestinyOrdinary(1,false,'狂傲').advanced;
    const cautious=actualDestinyOrdinary(1,false,'苟道').advanced;
    const offer=(world:WorldState)=>activeDestinyTraitOffer(world,destinyActor(world))!;
    expect(offer(rash)).toEqual(offer(cautious));
    const chosen=(world:WorldState)=>destinyActor(destinyMonth(world)).destinyTraits?.earned[0]?.traitId;
    expect(offer(rash).options).toContain(chosen(rash));
    expect(offer(cautious).options).toContain(chosen(cautious));
    expect(chosen(rash)).not.toBe(chosen(cautious));
  });

  it('realises an earned guard and identifies its exact signature art in a native same-site duel',()=>{
    const {advanced}=actualDestinyOrdinary();
    const actor=destinyActor(advanced),offer=activeDestinyTraitOffer(advanced,actor)!;
    const defender=advanced.cultivators.find(row=>row.id==='elder-taixu-1')!;
    expect(actor.locationId).toBe(defender.locationId);
    const siblings=offer.options.map(option=>{
      const world=resolveGuidedDestinyTrait(advanced,offer.id,option);
      expect(destinyActor(world).destinyTraits?.earned[0]?.traitId).toBe(option);
      return {world,option,ratio:destinyDuelDamageMultiplier(destinyActor(world),defender)};
    }).sort((a,b)=>a.ratio-b.ratio);
    const guarded=siblings[0],comparison=siblings.at(-1)!;
    expect(guarded.option).not.toBe(comparison.option);
    expect(guarded.ratio).toBeLessThan(comparison.ratio);
    const strike=(world:WorldState)=>{
      const next=destinyMonth(world,{chosenAction:'DUEL',targetCultivatorId:defender.id,innerMonologue:'与在场者交锋。'},()=>.2);
      const event=next.events.find(row=>row.tick===next.tick&&row.duelWinnerId&&row.actorIds.includes(defender.id))!;
      expect(event).toMatchObject({duelWinnerId:actor.id,actorIds:[actor.id,defender.id],locationId:actor.locationId});
      const applied=event.damage?.find(row=>row.cultivatorId===actor.id)?.amount!;
      expect(applied).toBe(actor.hp-destinyActor(next).hp);
      return {event,applied};
    };
    const realGuard=strike(guarded.world), realComparison=strike(comparison.world);
    expect(realGuard.applied).toBeLessThan(realComparison.applied);
    expect(realGuard.event.description).toContain(DESTINY_TRAIT_CATALOG[guarded.option].artName);
    expect(realComparison.event.description).not.toContain(DESTINY_TRAIT_CATALOG[guarded.option].artName);
  });
});
