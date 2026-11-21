import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { collectDigestEvidence } from '../src/engine/chronicleDigestEvidence';
import { captureChronicleErrataSource, resolveChronicleErrataAction } from '../src/engine/chronicleErrataEngine';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import { resolveSettlementAction } from '../src/engine/settlementEngine';
import type { Cultivator, LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(638);
  const [first, second, editor, remote] = world.cultivators;
  const venue = world.locations.find(({ id }) => id === 'loc-market')!;
  const village = world.settlements.villages.find(({ locationId }) => locationId === venue.id)!;
  world.tick = 10;
  for (const actor of [first, second, editor]) {
    actor.locationId = venue.id; actor.herbs.jade_leaf = 5; actor.spiritStones = 100;
  }
  remote.locationId = 'loc-taixu';
  village.stress = 60;
  return { world, first, second, editor, remote, venue, village };
}

describe('digest: exact public typed village and market receipts', () => {
  it('preserves original paid relief, independent contrary claims and a separately dated correction', () => {
    const { world, first, second, editor, remote, village } = fixture();
    const fact = resolveSettlementAction(world, first, { chosenAction:'DELIVER_RELIEF', targetSettlementId:village.id, innerMonologue:'' })!;
    expect(fact).not.toBeNull();
    expect(captureChronicleErrataSource(world,fact)).toBe(true);
    const retell = (actor: Cultivator, chronicleReliefReading: LLMDecisionPayload['chronicleReliefReading']) =>
      resolveChronicleErrataAction(world, actor, { chosenAction:'CHRONICLE_ERRATA', chronicleErrataMove:'retell',
        targetChronicleSourceId:fact.id, chronicleReliefReading, innerMonologue:'' });
    expect(retell(first,'full_supplies')).not.toBeNull();
    expect(retell(second,'unfunded')).not.toBeNull();
    expect(collectDigestEvidence(world,remote,'villages',1,10)).toEqual([]);
    const before = collectDigestEvidence(world,editor,'villages',1,10)[0];
    expect(before).toMatchObject({ id:fact.id, group:'实拨赈济', proof:{sourceId:fact.id,fields:expect.arrayContaining([
      {label:'实耗灵石',value:'12'},{label:'实耗翡翠灵叶',value:'2'}]),
      interpretations:[{reading:'主张已实际拨付赈济物资'},{reading:'主张未实际拨付赈济物资'}] } });
    const archiveAtTen = structuredClone(world);
    const oldViewer = archiveAtTen.cultivators.find(({ id }) => id === editor.id)!;
    world.tick++;
    expect(resolveChronicleErrataAction(world,editor,{ chosenAction:'CHRONICLE_ERRATA', chronicleErrataMove:'correct',
      targetChronicleSourceId:fact.id,innerMonologue:'' })).not.toBeNull();
    expect(collectDigestEvidence(world,editor,'villages',1,10)).toEqual([]);
    expect(collectDigestEvidence(archiveAtTen,oldViewer,'villages',1,10)[0].proof.interpretations).toHaveLength(2);
    expect(collectDigestEvidence(world,editor,'villages',1,11)[0].proof.interpretations).toMatchObject([
      {label:'未核实的独立传本'},{label:'未核实的独立传本'},{label:'另附已核定的勘误',tick:11},
    ]);
    expect(collectDigestEvidence(world,editor,'villages',1,12)).toEqual([]);
    world.events.push({ ...fact, witnessScope:'participants' });
    expect(collectDigestEvidence(world,editor,'villages',1,11)).toEqual([]);
  });

  it('does not expose a hidden migration endpoint or join same-date unrelated claims', () => {
    const {world,first,village} = fixture();
    const other = world.settlements.villages.find((row) => row.id !== village.id)!;
    // The date/key is canonical-shaped, but the origin's visitor does not see the destination.
    const otherSite = world.locations.find(({id}) => id === other.locationId)!;
    otherSite.x = 999; otherSite.y = 1;
    world.settlements.records.push({id:`settlement-10-migration-${village.id}-${other.id}`,kind:'migration',tick:10,
      settlementId:village.id,targetSettlementId:other.id,people:2,stones:0,herbs:0,description:'不得披露的迁往地点'});
    expect(collectDigestEvidence(world,first,'villages',1,10)).toEqual([]);
  });

  it('links actual local market fills to exactly matched prior orders, with no private actors or inferred missing links', () => {
    const {world,first,second,editor,venue} = fixture();
    first.herbs.jade_leaf = 0;
    const place = (actor:Cultivator,chosenAction:'PLACE_MARKET_BUY'|'PLACE_MARKET_SELL') => resolveMarketAction(world,actor,
      {chosenAction,marketGood:'jade_leaf',marketQuantity:2,marketLimitPrice:22,innerMonologue:''});
    const sell = place(second,'PLACE_MARKET_SELL')!;
    const buy = place(first,'PLACE_MARKET_BUY')!;
    expect([sell.locationId,buy.locationId]).toEqual([venue.id,venue.id]);
    const outcome = advanceMarkets(world).find(({title}) => title === '坊市当场结算')!;
    const original = JSON.stringify(world);
    const [entry] = collectDigestEvidence(world,editor,'market',10,10);
    expect(entry).toMatchObject({id:outcome.id, group:'当场成交', proof:{sourceId:outcome.id,earlier:expect.arrayContaining([
      {id:buy.id,tick:10,label:'先前买单',relation:'撮合买单'},{id:sell.id,tick:10,label:'先前卖单',relation:'撮合卖单'}])}});
    expect(JSON.stringify(entry)).not.toContain(first.name);
    expect(JSON.stringify(entry)).not.toContain(second.name);
    expect(JSON.stringify(world)).toBe(original);
    world.chronicleCausality.nodes = [];
    const [receiptWithoutCausalProof] = collectDigestEvidence(world,editor,'market',10,10);
    expect(receiptWithoutCausalProof.proof.earlier).toBeUndefined();
    world.events.push({ ...outcome, locationId:'loc-taixu' });
    expect(collectDigestEvidence(world,editor,'market',10,10)).toEqual([]);
  });
});
