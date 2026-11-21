import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import { advanceOccasions, availableOccasionJoins, joinOccasion } from '../src/engine/occasionEngine';
import { canSeeOccasion, canSeeOccasionLocation, projectExpeditionOmens } from '../src/engine/expeditionOmenEngine';
import { localQiWeather } from '../src/engine/weatherEngine';
import type { Cultivator, FieldObservatoryRun, WorldState } from '../src/types/world';

const stepTo = (world: WorldState, tick: number) => {
  const birthOrdinal = 12 * world.year + world.month - 1 - world.tick;
  world.tick = tick;
  world.year = Math.floor((birthOrdinal + tick) / 12);
  world.month = (birthOrdinal + tick) % 12 + 1;
};
const act = (world: WorldState, actor: Cultivator, move: 'fund'|'measure'|'relay', opened?: number, recipient?: Cultivator) =>
  resolveObservatoryAction(world, actor, { chosenAction:'FIELD_OBSERVATORY', observatoryMove:move,
    targetObservatoryTick: opened, targetCultivatorId:recipient?.id, innerMonologue:'' });
const reportRun = (world: WorldState, actor: Cultivator): FieldObservatoryRun => world.fieldObservatories.byActor[actor.id].runs[0];
function nativeFixture() {
  const world = createInitialWorld();
  const sites = world.locations.filter(l => l.type === 'spirit_vein' && l.spiritQi >= 70);
  const selected = Array.from({length:55}, (_,i) => i + 3).flatMap(tick => sites.map(site => ({ tick, site }))).find(({tick,site}) => {
    const a=localQiWeather(world,site,tick), b=localQiWeather(world,site,tick + 1);
    return a.kind === '灵潮' && a.intensity >= .35 && b.kind === '灵潮' && b.intensity >= .30;
  });
  if (!selected) throw new Error('Fixture needs actual consecutive native tide at a spirit vein');
  const { tick,site } = selected;
  const [operator, relay, outsider] = world.cultivators;
  for (const actor of [operator, relay, outsider]) actor.locationId = site.id;
  stepTo(world, tick - 2);
  return {world, operator, relay, outsider, site, tick};
}
describe('actual local expedition omens', () => {
  it('requires a spent real paid local measurement, then permits only actually learned onsite enrollment', () => {
    const {world,operator,relay,outsider,site,tick} = nativeFixture();
    expect(act(world,operator,'fund')).toBeTruthy();
    expect(reportRun(world,operator).status).toBe('pending');
    stepTo(world,tick);
    expect(world.expeditionOmens.rows).toEqual([]);
    expect(advanceOccasions(world,()=>0)).toEqual([]);
    expect(act(world,operator,'measure',tick - 2)).toBeTruthy();
    expect(reportRun(world,operator).status).toBe('measured');
    expect(projectExpeditionOmens(world,operator)[0]).toMatchObject({ status:'watching', learnedTick:tick });
    expect(projectExpeditionOmens(world,relay)).toEqual([]);
    stepTo(world,tick+1);
    expect(act(world,operator,'relay',tick - 2,relay)).toBeTruthy();
    expect(advanceOccasions(world,()=>.99)[0].witnessScope).toBe('participants');
    const [occasion] = world.occasions;
    expect(occasion).toMatchObject({ kind:'expedition', anchorSiteId:site.id, startedTick:tick+1 });
    expect(projectExpeditionOmens(world,relay)[0]).toMatchObject({ status:'open', learnedTick:tick+1 });
    expect(availableOccasionJoins(outsider,world)).toEqual([]);
    expect(canSeeOccasion(world,outsider,occasion)).toBe(false);
    expect(canSeeOccasionLocation(world,outsider,occasion.locationId)).toBe(false);
    expect(canSeeOccasionLocation(world,operator,occasion.locationId)).toBe(true);
    const choose = { chosenAction:'JOIN_OCCASION', targetOccasionId:occasion.id, innerMonologue:'' } as const;
    const other = world.locations.find(place=>place.id!==site.id)!;
    relay.locationId=other.id;
    expect(joinOccasion(world,relay,choose)).toBeNull();
    expect(joinOccasion(world,operator,choose)).toBeTruthy();
    expect(operator.locationId).toBe(site.id);
    stepTo(world,occasion.registrationClosesTick);
    expect(joinOccasion(world,relay,choose)).toBeNull();
    advanceOccasions(world,()=>.7);
    expect(operator.locationId).toBe(occasion.locationId);
    stepTo(world,world.tick + 1);
    advanceOccasions(world,()=>.7);
    expect(operator.locationId).toBe(site.id);
  });

  it('does not report a new real opening to even an exact clue owner who has already left',()=>{
    const {world,operator,site,tick}=nativeFixture();
    expect(act(world,operator,'fund')).toBeTruthy();
    stepTo(world,tick);
    expect(act(world,operator,'measure',tick-2)).toBeTruthy();
    const distant=world.locations.find(place=>place.id!==site.id)!;
    operator.locationId=distant.id;
    stepTo(world,tick+1);
    const [event]=advanceOccasions(world,()=>.99);
    const [occasion]=world.occasions;
    expect(occasion).toMatchObject({kind:'expedition',anchorSiteId:site.id});
    expect(event).toMatchObject({witnessScope:'participants',actorIds:[]});
    expect(canSeeOccasion(world,operator,occasion)).toBe(false);
    expect(projectExpeditionOmens(world,operator)[0]).toMatchObject({status:'watching'});
    expect(availableOccasionJoins(operator,world)).toEqual([]);
    operator.locationId=site.id;
    expect(canSeeOccasion(world,operator,occasion)).toBe(true);
    expect(availableOccasionJoins(operator,world)).toEqual([{action:'JOIN_OCCASION',targetOccasionId:occasion.id}]);
  });

  it('does not substitute a forecast, lower current Qi or late relays for an expired window', () => {
    const {world,operator,relay,site,tick} = nativeFixture();
    expect(act(world,operator,'fund')).toBeTruthy();
    stepTo(world,tick);
    expect(act(world,operator,'measure',tick-2)).toBeTruthy();
    const savedQi = site.spiritQi;
    site.spiritQi = 0;
    for (const delta of [1,2,3]) {
      stepTo(world,tick + delta);
      expect(advanceOccasions(world,()=>.99)).toEqual([]);
    }
    site.spiritQi = savedQi;
    stepTo(world,tick + 4);
    expect(act(world,operator,'relay',tick - 2,relay)).toBeTruthy();
    expect(projectExpeditionOmens(world,relay)).toEqual([]);
    expect(projectExpeditionOmens(world,operator)[0].status).toBe('missed');
    expect(advanceOccasions(world,()=>.99)).toEqual([]);
  });

  it('keeps the existing calendared tournament draw and never opens a blind calendar expedition', () => {
    const world=createInitialWorld();
    const rng=vi.fn(()=>.99);
    stepTo(world,60);
    expect(advanceOccasions(world,rng)).toEqual([]);
    expect(advanceOccasions(world,rng)).toEqual([]);
    expect(rng).toHaveBeenCalledTimes(1);
    stepTo(world,120);
    const tournament=vi.fn(()=>.1);
    expect(advanceOccasions(world,tournament)).toHaveLength(1);
    expect(world.occasions[0].kind).toBe('tournament');
    expect(tournament).toHaveBeenCalledTimes(1);
  });
});
