import { frontierGorgeWindBlocks, northGorgeHome, northGorgePass } from '../src/engine/frontierGorgeWeather';
import { frontierWinter } from '../src/engine/frontierTerms';
import type { AnomalyRelayReceipt } from '../src/types/anomalyRelay';
import type { WorldState } from '../src/types/world';
import { enteredEpisodeIds, type StoryAuditProbe, type StoryAuditTurn } from './storyTriggerAuditTerms';

const newState = <T>(
  source: (world: WorldState) => readonly T[], stamp: (row: T) => string | undefined,
): NonNullable<StoryAuditProbe['observe']> => ({ before, after }) =>
  [...new Set(enteredEpisodeIds(source(before), source(after), stamp))];

function gorgeActions({ after, events }: StoryAuditTurn): readonly string[] {
  if (frontierWinter(after.month)) return [];
  const actual = new Set(events.filter(event => event.tick === after.tick && event.witnessScope === 'participants' &&
    event.actorIds.length === 1).map(event => JSON.stringify([event.id, event.actorIds[0], event.locationId, event.category])));
  return (after.frontier?.visits ?? []).flatMap(visit => {
    if (visit.regionId !== 'north-snow') return [];
    const at = visit.steps.at(-1), before = visit.steps.at(-2);
    const actor = after.cultivators.find(person => person.id === visit.actorId);
    if (!at || actor?.currentAction !== 'FRONTIER_GORGE' || actor.locationId !== at.siteId) return [];
    const closed = (from: string) => from === northGorgePass
      ? frontierGorgeWindBlocks(after, northGorgePass, northGorgeHome, after.tick)
      : from === northGorgeHome && frontierGorgeWindBlocks(after, northGorgeHome, northGorgePass, after.tick);
    const wait = `evt-frontier-gorge-${after.tick}-${visit.id}-wait`;
    if (at.tick < after.tick && closed(at.siteId) &&
      actual.has(JSON.stringify([wait, visit.actorId, at.siteId, 'heavenly']))) return [wait];
    const travel = `evt-frontier-movement-${visit.id}-travel-${after.tick}`;
    const bend = before?.siteId === northGorgePass ? 'frontier-north-spring' :
      before?.siteId === northGorgeHome ? 'frontier-north-lee-east' : undefined;
    return before && at.tick === after.tick && at.siteId === bend && closed(before.siteId) &&
      actual.has(JSON.stringify([travel, visit.actorId, at.siteId, 'diplomacy'])) ? [travel] : [];
  });
}

function originsWithThreeSites(world: WorldState): string[] {
  const relay = world.anomalyRelays;
  if (!relay) return [];
  const sources = new Map(relay.origins.map(origin => [origin.eventId, origin]));
  const key = (eventId: string, actorId: string) => JSON.stringify([eventId, actorId]);
  const byActor = new Map<string, AnomalyRelayReceipt | null>();
  for (const row of relay.receipts) {
    const id = key(row.eventId, row.actorId);
    byActor.set(id, byActor.has(id) ? null : row);
  }
  const done = new Set<string>();
  for (const received of relay.receipts) {
    const origin = sources.get(received.eventId);
    if (!origin || done.has(origin.eventId) || received.hops < 2 ||
      byActor.get(key(received.eventId, received.actorId)) !== received) continue;
    const places = new Set<string>();
    let row: AnomalyRelayReceipt | undefined = received;
    for (let depth = 0; row && depth <= 4; depth++) {
      places.add(row.siteId);
      if (row.channel === 'witness') {
        if (row.tick === origin.tick && row.siteId === origin.siteId && row.actorId === received.originalWitnessId &&
          row.hops === 0 && row.confidence === 100 && places.size >= 3) done.add(origin.eventId);
        break;
      }
      const parent: AnomalyRelayReceipt | null | undefined = row.senderId && row.senderId !== row.actorId
        ? byActor.get(key(origin.eventId, row.senderId)) : undefined;
      if (!parent || parent.tick >= row.tick || parent.hops + 1 !== row.hops ||
        parent.originalWitnessId !== received.originalWitnessId ||
        row.confidence !== Math.floor(parent.confidence * (row.channel === 'conversation' ? .84 : .7)) ||
        (row.channel === 'conversation' ? row.senderSiteId !== row.siteId :
          row.tick % 3 !== 0 || !row.senderSiteId || row.senderSiteId === row.siteId)) break;
      row = parent;
    }
  }
  return [...done];
}

export const storyTriggerAuditPhase21_22: readonly StoryAuditProbe[] = [
  {
    id: 'P21-1', title: '山门失火与藏卷抢救', mode: 'player-triggered',
    evidence: '以陨星画笔确实打开的藏经阁火案为一次；需要玩家施加陨星，不向自然推演注入灾情。',
    observe: newState(world => world.pavilionFires?.cases ?? [], row => row.sourceEventId),
  },
  {
    id: 'P21-2', title: '云潮封峡后的两条归途', mode: 'player-triggered',
    evidence: '先由本人付费进入北岭异图；封风时原处等候有独立事件，改道另须峡口至真实相邻背风格的步迹与同月事件。',
    observe: gorgeActions,
  },
  {
    id: 'P21-3', title: '放下旧怨还是回敬一剑', mode: 'player-triggered',
    evidence: '两人先从真实决斗中的留命许可结下旧事，再亲自离去、重新见面；离线不会代选留命，未重逢的不计。',
    observe: newState(world => world.mercyReunions?.cases ?? [], row => row.departure && row.reunion ? row.id : undefined),
  },
  {
    id: 'P21-4', title: '夜渡引魂灯', mode: 'player-triggered',
    evidence: '只有同一真实付费外港访问里完成留灯或作别的私下记录；离线不代付跨图入关费用。',
    observe: newState(world => world.farewellLandings?.records ?? [],
      row => row.deathEventId && row.sharedEventId && row.visitId ? row.id : undefined),
  },
  {
    id: 'P21-5', title: '灵兽大迁与借道', mode: 'native',
    evidence: '同一真兽跨两方疆界的原生迁徙，两边至少各有一位实际本方见证者；不是任意游踪。',
    observe: newState(world => world.wildMigrations?.records ?? [],
      row => row.from.sectId !== row.to.sectId && row.from.witnessIds.length && row.to.witnessIds.length
        ? row.sourceEventId : undefined),
  },
  {
    id: 'P21-6', title: '掌门未归的一夜', mode: 'native',
    evidence: '掌门或护阵者失位后，攻防回合真实支付护阵或实现撤身，以同一实际回合去重。',
    observe: newState(world => world.vacantGate?.records ?? [],
      row => row.roundEventId && (row.move === 'withdraw' && row.destinationId || row.wallSaved && row.paidQi > 0)
        ? row.roundEventId : undefined),
  },
  {
    id: 'P21-7', title: '一场天变，三地闻钟', mode: 'native',
    evidence: '从同一兽潮的实际目击者到末端收信人，逐个核对原闻者、上一传人和先后月份，只有串起三个不同地点才算。',
    observe: newState(originsWithThreeSites, id => id),
  },
  {
    id: 'P21-8', title: '凡门同窗到山门异途', mode: 'native',
    evidence: '两人先后从同一原乡真实入宗，再有一人实地抵达对方所在地；仅同乡或同名不计。',
    observe: newState(world => world.villageReunions?.pairs ?? [],
      row => row.secondActorId && row.arrival && row.arrival.siteId !== row.arrival.fromSiteId ? row.id : undefined),
  },
  {
    id: 'P21-9', title: '战后拾愿的群像尾章', mode: 'player-triggered',
    evidence: '同一真实战局结案后，至少一名合格见证人实际作出留守、归去或互助回应；同一战局结案编号只计一次。',
    observe: newState(world => world.battlefieldAftermath?.cases ?? [],
      row => row.decision && row.decision.tick > row.terminalTick ? row.terminalEventId : undefined),
  },
  {
    id: 'P21-10', title: '十代之上仍看清当下', mode: 'interface',
    evidence: '十代长局、跨代承接、首屏与千人负载是独立验收，不把普通出生、单个主角交接或合成人口统计成单月剧情。',
  },
  {
    id: 'P22-1', title: '同路一夜，各望一山', mode: 'native',
    evidence: '两位实际同行者已有同一次原生旅队抵达凭证，从该事实登记一处可分别选择的岔口；不把选择算成已经走完的行程。',
    observe: newState(world => world.pilgrimageForks?.forks ?? [],
      row => row.actors[0] !== row.actors[1] && row.arrivalEventId ? row.id : undefined),
  },
  {
    id: 'P22-2', title: '拜师未果之后', mode: 'native',
    evidence: '同一对旧师徒候选有真实拒绝、分开、重逢与一幕安静相谈的原生事件，不能用一次新拜师替代。',
    observe: newState(world => world.apprenticeshipReunions?.cases ?? [],
      row => row.refusedTick !== undefined && row.departure && row.reunion && row.quiet?.eventId &&
        row.quiet.tick >= row.reunion.tick ? row.id : undefined),
  },
  {
    id: 'P22-3', title: '丹火将熄，谁先出门', mode: 'native',
    evidence: '同一实际兽潮的炉损和现场学徒正数伤害同时被记录，炉台冷却和普通炉损不代替该案。',
    observe: newState(world => world.furnaceEmergencies?.cases ?? [],
      row => row.injuryHp > 0 && row.injuryEventId && row.safetyId ? row.id : undefined),
  },
  {
    id: 'P22-4', title: '剑鸣穿过空城', mode: 'native',
    evidence: '旧区实际迁空后，修士从另一真实地址亲自返回，并留下明确迁徙编号和个人入区记录。',
    observe: newState(world => world.abandonedQuarters?.visits ?? [],
      row => row.migrationId && row.fromSiteId !== row.siteId ? row.id : undefined),
  },
  {
    id: 'P22-5', title: '关外两面旗', mode: 'native',
    evidence: '同一次轮值交接确有守关空档，后来真实在场者作出掩护、拒援或留守，按同一空档去重。',
    observe: newState(world => world.boundaryGapResponses?.responses ?? [],
      row => row.tick > row.gapTick ? JSON.stringify([row.reliefId, row.gapTick]) : undefined),
  },
  {
    id: 'P22-6', title: '村灯照见今朝', mode: 'native',
    evidence: '同一村社已有离去、真实灾害、已完成赈济和个人后来实地归来的两次见证，不把普通赈济计为回乡故事。',
    observe: newState(world => world.reliefHomecomings?.scenes ?? [],
      row => row.reliefTick > row.departureTick && row.return && row.return.tick > row.reliefTick ? row.id : undefined),
  },
  {
    id: 'P22-7', title: '夜半叩门，谁在风里', mode: 'native',
    evidence: '险阻旅人与合法驿舍屋主实际遇见，已核真实到舍的事件编号；疑似旧识或尚未接受的供宿不代替到舍。',
    observe: newState(world => world.nightDoors?.encounters ?? [],
      row => row.arrivalEventId && row.hostId !== row.guestId ? row.id : undefined),
  },
  {
    id: 'P22-8', title: '大比之后无人赴席', mode: 'native',
    evidence: '实际大比后的席上结果已按真到场者结算；零人到场也是真结果，邀请尚未开席则不计。',
    observe: newState(world => world.banquetSeats?.tables ?? [],
      row => row.summary && row.summary.tick === row.seatTick ? row.summary.eventId : undefined),
  },
  {
    id: 'P22-9', title: '宗门终章之后的空页', mode: 'native',
    evidence: '原宗确实散去并有真正仍在场的末代同门，按同一原生合宗结案一次去重，不因同一宗多人走不同支线重复累计。',
    observe: newState(world => world.lastRosters?.entries ?? [],
      row => row.people.length ? row.mergeEventId : undefined),
  },
  {
    id: 'P22-10', title: '手机上只复盘一处选择', mode: 'interface',
    evidence: '实际长局同源复盘、触控、键盘和焦点是交互验收，不把虚拟世界里的类似行动当真实设备已测。',
  },
];
