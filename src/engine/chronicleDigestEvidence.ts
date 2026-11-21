import type { CausalChronicleOutcome, Cultivator, LocationNode, MarketReceipt, SettlementRecord, WorldState } from '../types/world';
import type { ChronicleDigestEntry } from './chronicleDigest';
import { buildCausalChronicleChain } from './chronicleCausalityEngine';
import { visibleChronicleErrata } from './chronicleErrataEngine';
import { canFocusChronicleSite } from './chronicleFocusEngine';
import { isChronicleStoryFact } from './chronicleLead';
import { MARKET_GOODS } from './marketEngine';
import { SETTLEMENT_RELIEF, visibleSettlements } from './settlementEngine';
import { courierCheckpoint } from './sealedCourierEngine';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import { expeditionRescueCheckpoint } from './expeditionRescueCheckpoint';

type Proof = ChronicleDigestEntry['proof'];
const span = (tick: number, from: number, through: number) => Number.isSafeInteger(tick) && tick >= from && tick <= through;
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
const nonnegative = (n: number) => Number.isSafeInteger(n) && n >= 0;

function sourceIntact(world: WorldState, id: string, tick: number, siteId: string, throughTick: number): boolean {
  const matches = world.events.filter((event) => event.id === id);
  if (matches.length === 0) return true; // In this caller a retained typed receipt supplies proof.
  return matches.length === 1 && matches[0].category === 'diplomacy' && matches[0].tick === tick &&
    matches[0].locationId === siteId && isChronicleStoryFact(matches[0], throughTick);
}

function reliefInterpretations(sourceId: string, through: number,
  board: ReturnType<typeof visibleChronicleErrata>): Proof['interpretations'] {
  const docket = board.find(({ source }) => source.kind === 'relief' && source.sourceEventId === sourceId && source.tick <= through);
  if (!docket) return undefined;
  const reading = (delivery: 'full_supplies' | 'unfunded') =>
    delivery === 'full_supplies' ? '主张已实际拨付赈济物资' : '主张未实际拨付赈济物资';
  const rows = docket.retellings.flatMap((row) => row.tick <= through && row.reading.kind === 'relief' ? [{ id: row.id, tick: row.tick,
    label: '未核实的独立传本', reading: reading(row.reading.delivery) }] : []);
  const correction = docket.correction;
  if (correction && correction.tick <= through && correction.reading.kind === 'relief') rows.push({
    id: correction.id, tick: correction.tick, label: '另附已核定的勘误',
    reading: correction.reading.delivery === 'full_supplies' ? '核定已实际拨付赈济物资' : '核定未实际拨付赈济物资',
  });
  return rows.length ? rows : undefined;
}

function recognizedVillageReceipt(record: SettlementRecord): boolean {
  const prefix = `settlement-${record.tick}-${record.kind}-${record.settlementId}-`;
  switch (record.kind) {
    case 'relief': return !!record.actorId && record.id === prefix + record.actorId &&
      record.stones === SETTLEMENT_RELIEF.stones && record.herbs === SETTLEMENT_RELIEF.jade_leaf;
    case 'recruitment': return !!record.actorId && !!record.volunteerId && record.id === prefix + record.volunteerId &&
      record.cultivatorId === `recruit-${record.volunteerId}` && record.herbs === 0;
    case 'migration': return !!record.targetSettlementId && record.targetSettlementId !== record.settlementId &&
      record.id === prefix + record.targetSettlementId && record.stones === 0 && record.herbs === 0;
    case 'growth': return record.id === prefix + 'births' && record.stones === 0 && record.herbs === 0;
    case 'disaster': return record.id.startsWith(prefix) && record.id.length > prefix.length && record.stones === 0 && record.herbs === 0;
  }
}

function villageStory(record: SettlementRecord, site: LocationNode, destination?: LocationNode):
  Pick<ChronicleDigestEntry, 'group' | 'title' | 'paragraph'> & { fields: NonNullable<Proof['fields']> } | undefined {
  const { name } = site;
  const fields = [{ label: '已见地点', value: name }];
  if (!nonnegative(record.people) || !nonnegative(record.stones) || !nonnegative(record.herbs)) return undefined;
  switch (record.kind) {
    case 'disaster':
      fields.push({ label: '明载死亡', value: String(record.people) });
      return { group: '村镇受灾', title: name + '遭逢灾害', paragraph: record.people > 0 ?
        `灾害落在${name}，村账记下${record.people}人身亡。` : `灾害波及${name}，村账此项记零人死亡，未列具体其他损失。`, fields };
    case 'relief':
      if (!positive(record.stones) || !positive(record.herbs) || record.people !== 0) return undefined;
      fields.push({ label: '实耗灵石', value: String(record.stones) }, { label: '实耗翡翠灵叶', value: String(record.herbs) });
      return { group: '实拨赈济', title: `真的有人给${name}送来赈济`,
        paragraph: `${name}收到了赈济。${record.stones}灵石、${record.herbs}份翡翠灵叶已实付，不是账上的许诺。`, fields };
    case 'recruitment':
      if (record.people !== 1 || !positive(record.stones)) return undefined;
      fields.push({ label: '自愿入门', value: '1 人' }, { label: '实付安置', value: `${record.stones} 灵石` });
      return { group: '自愿入门', title: `${name}一人自愿入门`,
        paragraph: `${name}一名成年志愿者自愿入门，坊籍扣减一人，另已实付${record.stones}灵石安置。`, fields };
    case 'growth':
      if (!positive(record.people)) return undefined;
      fields.push({ label: '新增未成年', value: String(record.people) });
      return { group: '村镇添丁', title: name + '添了新生儿',
        paragraph: `${name}新增${record.people}名新生儿，记入未成年坊籍，不列入招募。`, fields };
    case 'migration':
      if (!destination || !positive(record.people)) return undefined;
      fields.push({ label: '迁往已见地点', value: destination.name }, { label: '实际迁居', value: String(record.people) });
      return { group: '实际迁居', title: `有人从${name}迁往${destination.name}`,
        paragraph: `${record.people}名乡民从${name}迁到${destination.name}。这是人口转移，不是新增居民。`, fields };
  }
}

function collectVillages(world: WorldState, viewer: Cultivator, from: number, through: number,
  sites: ReadonlyMap<string, LocationNode>, visible: (id: string) => boolean): ChronicleDigestEntry[] {
  const villages = new Map(visibleSettlements(world,viewer).map((row) => [row.id, row]));
  const board = courierCheckpoint(world,viewer) || boundaryReliefCheckpoint(world,viewer) || expeditionRescueCheckpoint(world,viewer) ?
    [] : visibleChronicleErrata(world,viewer);
  return world.settlements.records.flatMap((record) => {
    if (!span(record.tick, from, through) || !recognizedVillageReceipt(record)) return [];
    const village = villages.get(record.settlementId);
    const site = village && sites.get(village.locationId);
    const movedTo = record.targetSettlementId ? villages.get(record.targetSettlementId) : undefined;
    const target = movedTo && visible(movedTo.locationId) ? sites.get(movedTo.locationId) : undefined;
    const sourceId = `evt-${record.id}`;
    if (!site || !visible(site.id) || !sourceIntact(world, sourceId, record.tick, site.id, through)) return [];
    const story = villageStory(record, site, target);
    if (!story) return [];
    const { fields, ...entry } = story;
    const interpretations = record.kind === 'relief' ? reliefInterpretations(sourceId,through,board) : undefined;
    return [{ id: sourceId, topic:'villages', tick: record.tick, ...entry,
      proof:{ label:'村镇实账', sourceId, fields, ...(interpretations ? { interpretations } : {}) } } satisfies ChronicleDigestEntry];
  });
}

const matchingOutcome = (status: MarketReceipt['status'], outcome?: CausalChronicleOutcome) =>
  status === 'local_fill' ? outcome === 'local_fill' : status === 'delivered' ? outcome === 'delivered' :
    status === 'lost' ? outcome === 'route_loss' : outcome === 'escort_failed' || outcome === 'endpoint_missing' || outcome === 'market_closed';
const marketLabels: Partial<Record<CausalChronicleOutcome,string>> =
  { local_fill:'当场成交', delivered:'运达交割', route_loss:'途中灾损', escort_failed:'护送中止', endpoint_missing:'坊市撤销', market_closed:'持续闭市' };
const marketRelations = {matched_buy_order:'撮合买单',matched_sell_order:'撮合卖单',settled_shipment:'结算此商队',
  filled_vacancy:'填补空位',withdrew_siege:'撤回围攻'} as const;
const marketParents = { market_buy_order:'先前买单',market_sell_order:'先前卖单',market_shipment:'原商队启程',
  market_settlement:'实际交割',sect_election:'宗门选举',sect_vacancy:'宗门空位',truce_signed:'正式停战',siege_launched:'实际围攻' } as const;

function collectMarket(world: WorldState, viewer: Cultivator, from: number, through: number,
  sites: ReadonlyMap<string, LocationNode>, visible: (id: string) => boolean): ChronicleDigestEntry[] {
  return world.markets.receipts.flatMap((row) => {
    if (!span(row.tick, from, through) || !positive(row.sequence) || row.id !== `receipt-${row.sequence}` ||
      !positive(row.quantity) || !positive(row.unitPrice) || !Object.hasOwn(MARKET_GOODS,row.good)) return [];
    const destination = sites.get(row.destinationId);
    if (destination?.type !== 'market' || !visible(destination.id) ||
      (row.status === 'local_fill' ? row.originId !== destination.id || row.shipmentId !== undefined :
        row.originId === destination.id || !row.shipmentId || !/^caravan-[1-9][0-9]*$/.test(row.shipmentId))) return [];
    const sourceId = `evt-${row.tick}-market-${row.shipmentId ?? `fill-${row.sequence}`}`;
    if (!sourceIntact(world,sourceId,row.tick,destination.id,through)) return [];
    const found = buildCausalChronicleChain(world,sourceId,viewer.id);
    if (found && (found.entry.kind !== 'market_settlement' || found.entry.tick !== row.tick ||
      !matchingOutcome(row.status,found.entry.outcome))) return [];
    const cause = found?.entry.outcome ? marketLabels[found.entry.outcome] : undefined;
    const earlier = found?.previous.flatMap(({ relation, node }) =>
      node.entry.tick <= through && (relation === 'matched_buy_order' || relation === 'matched_sell_order' || relation === 'settled_shipment')
        ? [{ id:node.entry.eventId,tick:node.entry.tick,label:marketParents[node.entry.kind],relation:marketRelations[relation] }] : []);
    const good = MARKET_GOODS[row.good].label;
    const fields = [{label:'已见结算坊市',value:destination.name},{label:'货物',value:`${row.quantity} 份${good}`},
      {label:'结算单价',value:`${row.unitPrice} 灵石/份`}];
    const origin = sites.get(row.originId);
    if (origin?.type === 'market' && origin.id !== destination.id && visible(origin.id)) fields.push({label:'已见起运坊市', value:origin.name});
    const status = row.status;
    const title = status === 'local_fill' ? '货款在坊市当场交割' : status === 'delivered' ? '货至，账清' :
      status === 'lost' ? '这一趟未能交货' : '商队退回了原货';
    const paragraph = status === 'local_fill' ? `在${destination.name}，${row.quantity}份${good}当场成交，货款同时交割。` :
      status === 'delivered' ? `${destination.name}收到${row.quantity}份${good}。货到之后，买卖才算结清。` :
      status === 'lost' ? `应运到${destination.name}的${row.quantity}份${good}没有交付，买方原款已退。` :
      `这一笔没有交货。买方原款已退，${row.quantity}份${good}退还卖方。`;
    return [{id:sourceId,topic:'market',group:cause ?? (status === 'returned' ? '退运（前因未证）' : status === 'lost' ?
      '未交货（前因未证）' : status === 'local_fill' ? '当场成交' : '运达交割'),tick:row.tick,title,paragraph,
      proof:{label:'坊市结算收据',sourceId,fields,...(earlier?.length?{earlier}:{})}} satisfies ChronicleDigestEntry];
  });
}

export function collectDigestEvidence(world: WorldState, viewer: Cultivator, topic: 'villages' | 'market', fromTick: number,
  throughTick: number): ChronicleDigestEntry[] {
  if (!world.cultivators.includes(viewer) || !viewer.alive || viewer.hp <= 0 || !nonnegative(fromTick) ||
    throughTick !== world.tick || !span(throughTick,fromTick,world.tick)) return [];
  const sites = new Map(world.locations.map((site) => [site.id,site]));
  const seen = new Map<string,boolean>();
  const visible = (id: string) => {
    if (!seen.has(id)) seen.set(id,canFocusChronicleSite(world,id,viewer.id));
    return seen.get(id) === true;
  };
  const values = topic === 'villages' ? collectVillages(world,viewer,fromTick,throughTick,sites,visible) :
    collectMarket(world,viewer,fromTick,throughTick,sites,visible);
  const counter = new Map<string,number>();
  for (const value of values) counter.set(value.id,(counter.get(value.id)??0)+1);
  return values.filter(({id})=>counter.get(id)===1).sort((a,b)=>b.tick-a.tick || a.id.localeCompare(b.id));
}
