import { recordTournamentChampion, recordTournamentRound } from './competitionEngine';
import { grantExpeditionRelic } from './relicEngine';
import type { Cultivator, LLMDecisionPayload, WorldEvent, WorldOccasion, WorldState } from '../types/world';
import { artifactPowerMultiplier, wearArtifact } from './artifactEngine';
import { activeSiegeForActor } from './diplomacyEngine';
import { recordMemory } from './memoryEngine';
import { rewardContribution } from './sectPoliticsEngine';
import { dropInheritance } from './techniqueEngine';
import { isTribulationActive } from './tribulationEngine';
import { advanceExpeditionRescues, expireOccasionRescues, hasOpenExpeditionRescue, rescueHoldsExpeditionRoll,
  rescuedMemberOutOfOccasion } from './expeditionRescueEngine';

import { advanceExpeditionOmenRetention, canJoinOmenExpedition, eligibleExpeditionOmen, presentAtExpeditionAnchor,
  recordExpeditionOpening } from './expeditionOmenEngine';

const CAPACITY = 8;
const alive = (person: Cultivator) => person.alive && person.hp > 0;
const active = (occasion: WorldOccasion) => occasion.status === 'registration' || occasion.status === 'running';
const playerList = (world: WorldState, ids: string[]) => ids.map((id) => world.cultivators.find((person) => person.id === id))
  .filter((person): person is Cultivator => Boolean(person && alive(person)));
const power = (person: Cultivator) => person.combatPower * (.5 + .5 * person.hp / Math.max(1, person.maxHp)) * artifactPowerMultiplier(person);
const cap = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function activeOccasionForActor(world: WorldState, actor: Cultivator): WorldOccasion | undefined {
  return world.occasions.find((occasion) => active(occasion) && occasion.participantIds.includes(actor.id) &&
    (occasion.kind !== 'expedition' || !rescuedMemberOutOfOccasion(world, occasion.id, actor.id)));
}

export function availableOccasionJoins(actor: Cultivator, world: WorldState, executionTick=world.tick): Array<{ action: 'JOIN_OCCASION'; targetOccasionId: string }> {
  if (!alive(actor) || activeOccasionForActor(world, actor) || activeSiegeForActor(world, actor) || isTribulationActive(actor)) return [];
  return world.occasions.filter((occasion) => occasion.status === 'registration' && executionTick < occasion.registrationClosesTick &&
    canJoinOmenExpedition(world, actor, occasion, executionTick) && occasion.participantIds.length < CAPACITY && world.locations.some(({ id }) => id === occasion.locationId))
    .map(({ id }) => ({ action: 'JOIN_OCCASION', targetOccasionId: id }));
}

function event(world: WorldState, occasion: WorldOccasion, token: string, title: string, description: string,
  actors: string[] = occasion.participantIds, category: WorldEvent['category'] = 'heavenly', locationId = occasion.locationId): WorldEvent {
  return { id: `evt-${world.tick}-${occasion.id}-${token}`, tick: world.tick, year: world.year, month: world.month,
    // The registrar mutates participantIds on later turns. A dated event is a snapshot,
    // not an alias into that live registry (JSON persistence otherwise changes history).
    title, description, category, actorIds: [...actors], locationId, ...(occasion.omenId ? { witnessScope: 'participants' } : {}) };
}

export function joinOccasion(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'JOIN_OCCASION' ||
      !availableOccasionJoins(actor, world).some(({ targetOccasionId }) => targetOccasionId === decision.targetOccasionId)) return null;
  const occasion = world.occasions.find(({ id }) => id === decision.targetOccasionId)!;
  occasion.participantIds.push(actor.id);
  return event(world, occasion, `join-${actor.id}`, '修士报名盛会', `${actor.name}报名参加${occasion.title}，开场时启程。`, [actor.id], 'diplomacy', actor.locationId);
}

function startTournament(world: WorldState, rng: () => number): WorldEvent | undefined {
  const stage = world.locations.find(({ type }) => type === 'market') ?? world.locations.find(({ ownerSectId }) => !ownerSectId) ?? world.locations[0];
  if (!stage || rng() >= .5) return undefined;
  const kind = 'tournament';
  const id = `occasion-${world.tick}-${kind}`;
  const title = '诸宗百年大比';
  const occasion: WorldOccasion = { id, kind, title, locationId: stage.id, startedTick: world.tick, registrationClosesTick: world.tick + 3,
    expiresTick: world.tick + 12, status: 'registration', participantIds: [], remainingIds: [], bouts: [], expeditions: [], round: 0 };
  world.occasions.push(occasion);
  return event(world, occasion, 'open', `${title}开启`, `天下修士可在第${occasion.registrationClosesTick}轮之前报名${title}。`);
}

function startLinkedExpedition(world: WorldState): WorldEvent | undefined {
  const selected = eligibleExpeditionOmen(world);
  if (!selected) return undefined;
  const kind = 'expedition';
  const title = '星门秘境远征';
  const id = `occasion-${world.tick}-${kind}`;
  const locationId = `${id}-gate`;
  const { site, row } = selected;
  world.locations.push({ id: locationId, name: '星门浮域', type: 'secret_realm', x: site.x, y: site.y,
    expeditionOmenId: row.id, description: '限时洞天，原处实地通行，机缘与灵灾同在。', spiritRoot: '雷', spiritQi: 96, furnaceGrade: 0,
    inheritanceScrolls: [], herbs: { jade_leaf: 1, earth_root: 0, star_bloom: 5, shadow_moss: 2 },
    herbCapacity: { jade_leaf: 1, earth_root: 0, star_bloom: 5, shadow_moss: 2 } });
  const occasion: WorldOccasion = { id, kind, title, locationId, startedTick: world.tick, registrationClosesTick: world.tick + 3,
    expiresTick: world.tick + 12, status: 'registration', participantIds: [], remainingIds: [], bouts: [], expeditions: [],
    round: 0, omenId: row.id, anchorSiteId: site.id };
  world.occasions.push(occasion);
  recordExpeditionOpening(world, selected, occasion);
  const witnesses=[row.operatorId,...(row.relay?[row.relay.recipientId]:[])].filter(id=>{
    const actor=world.cultivators.find(person=>person.id===id);
    return !!actor&&presentAtExpeditionAnchor(world,actor,site.id);
  });
  return event(world, occasion, 'open', `${title}在实测地点开启`, '本地天候与灵气符合实测先兆；已知线索者需实地报名。',
    witnesses, 'heavenly', site.id);
}

function finish(world: WorldState, occasion: WorldOccasion, cancelled = false): WorldEvent {
  const interruptedExpedition = cancelled && occasion.kind === 'expedition' && occasion.status === 'running';
  const permanent = world.locations.filter(({ id }) => id !== occasion.locationId);
  const exit = (occasion.anchorSiteId ? permanent.find(site => site.id === occasion.anchorSiteId) : undefined) ??
    permanent.find(({ type }) => type === 'market') ?? permanent[0];
  const temp = world.locations.find(({ id }) => id === occasion.locationId);
  for (const person of world.cultivators) {
    if (person.locationId !== occasion.locationId || (occasion.kind === 'tournament' && (occasion.status !== 'running' || !occasion.participantIds.includes(person.id)))) continue;
    const home = world.sects.find(({ id }) => id === person.sectId)?.headquartersId;
    person.locationId = occasion.omenId ? exit?.id ?? occasion.locationId :
      world.locations.find(({ id }) => id === home && id !== occasion.locationId)?.id ??
      (occasion.kind === 'tournament' ? occasion.locationId : exit?.id ?? occasion.locationId);
  }
  if (occasion.kind === 'expedition' && temp && exit) {
    const validSites = new Set(permanent.map(({ id }) => id));
    for (const beast of world.spiritBeasts) {
      if (beast.locationId !== temp.id && beast.homeLocationId !== temp.id) continue;
      const owner = beast.tamedBy ? world.cultivators.find(({ id, alive, hp }) => id === beast.tamedBy && alive && hp > 0) : undefined;
      if (beast.homeLocationId === temp.id) beast.homeLocationId = exit.id;
      if (beast.locationId === temp.id) {
        beast.locationId = owner && validSites.has(owner.locationId) ? owner.locationId :
          validSites.has(beast.homeLocationId) ? beast.homeLocationId : exit.id;
      }
    }
    exit.inheritanceScrolls.push(...temp.inheritanceScrolls);
    world.locations = permanent;
  }
  occasion.status = cancelled ? 'cancelled' : 'completed';
  occasion.remainingIds = [];
  return event(world, occasion, 'close', cancelled ? `${occasion.title}取消` : `${occasion.title}落幕`,
    interruptedExpedition ? '星门期限届满或入口失效，仍在入口者按原规离场；未走完的路线不计为救援抵达。' :
      cancelled ? '无人或人数不足，盛会未能成行。' : occasion.kind === 'expedition' ? '星门关闭，生还者撤离，遗卷散落外界。' : '比试结束，参赛修士返回所属宗门。',
    occasion.participantIds, 'heavenly', occasion.kind === 'expedition' ? exit?.id : occasion.locationId);
}

export function advanceOccasions(world: WorldState, rng: () => number): WorldEvent[] {
  // Actual route progression precedes the ordinary gate roll and any removal of its origin.
  const results: WorldEvent[] = advanceExpeditionRescues(world);
  const close = (occasion: WorldOccasion, cancelled = false) => {
    if (occasion.kind === 'expedition') results.push(...expireOccasionRescues(world, occasion.id));
    results.push(finish(world, occasion, cancelled));
  };
  if (world.tick > 0 && world.tick % 60 === 0 && world.expeditionOmens.lastCalendarTick !== world.tick && !world.occasions.some((occasion) => occasion.kind === 'tournament' && (active(occasion) || occasion.startedTick === world.tick))) {
    world.expeditionOmens.lastCalendarTick = world.tick;
    const opened = startTournament(world, rng);
    if (opened) results.push(opened);
  }
  const openedExpedition = startLinkedExpedition(world);
  if (openedExpedition) results.push(openedExpedition);
  advanceExpeditionOmenRetention(world);
  for (const occasion of world.occasions) {
    if (!active(occasion) || (occasion.lastResolvedTick ?? -1) >= world.tick) continue;
    occasion.lastResolvedTick = world.tick;
    if (world.tick >= occasion.expiresTick || !world.locations.some(({ id }) => id === occasion.locationId)) {
      close(occasion, true); continue;
    }
    if (occasion.status === 'registration') {
      if (world.tick < occasion.registrationClosesTick) continue;
      const entrants = playerList(world, [...new Set(occasion.participantIds)]).filter((person) =>
        !activeSiegeForActor(world, person) && !isTribulationActive(person) &&
        (!occasion.omenId || (!!occasion.anchorSiteId && presentAtExpeditionAnchor(world, person, occasion.anchorSiteId))));
      if (entrants.length < (occasion.kind === 'tournament' ? 2 : 1)) {
        close(occasion, true); continue;
      }
      occasion.status = 'running';
      occasion.remainingIds = entrants.sort((a, b) => power(b) - power(a) || a.id.localeCompare(b.id)).map(({ id }) => id);
      for (const person of entrants) person.locationId = occasion.locationId;
      results.push(event(world, occasion, 'commence', `${occasion.title}正式开始`, `${entrants.length}名修士已到场。`));
      continue;
    }
    const roster = playerList(world, occasion.remainingIds);
    if (occasion.kind === 'tournament') {
      occasion.round++;
      if (!roster.length) { close(occasion, true); continue; }
      const winners: Cultivator[] = [];
      // Pair high and low seeds; deterministic bye when a bracket is odd.
      for (let i = 0; i < Math.ceil(roster.length / 2); i++) {
        const first = roster[i];
        const second = roster[roster.length - i - 1];
        if (first.id === second.id) {
          winners.push(first);
          occasion.bouts.push({ round: occasion.round, firstId: first.id, winnerId: first.id });
          continue;
        }
        const winner = power(first) * (.8 + rng() * .4) >= power(second) * (.8 + rng() * .4) ? first : second;
        const loser = winner.id === first.id ? second : first;
        winner.hp = Math.max(1, winner.hp - Math.round(winner.maxHp * .07));
        loser.hp = Math.max(1, loser.hp - Math.round(loser.maxHp * .14));
        wearArtifact(winner, true); wearArtifact(loser, false);
        winners.push(winner);
        const bout = { round: occasion.round, firstId: first.id, secondId: second.id, winnerId: winner.id };
        occasion.bouts.push(bout);
        recordTournamentRound(world, occasion, bout);
      }
      if (winners.length === 1) {
        const champion = winners[0];
        occasion.championId = champion.id;
        champion.spiritStones += 220; rewardContribution(champion, world, 20);
        const sect = world.sects.find(({ id }) => id === champion.sectId);
        if (sect) sect.reputation = Math.min(100, sect.reputation + 8);
        const description = `${champion.name}夺得大比魁首，赢得220灵石与宗门声望。`;
        recordMemory(champion, world.tick, description, 9, 'combat', 5);
        results.push(event(world, occasion, 'champion', '大比魁首揭晓', description, [champion.id]));
        close(occasion);
        recordTournamentChampion(world, occasion);
      } else {
        occasion.remainingIds = winners.map(({ id }) => id);
        results.push(event(world, occasion, 'round', `大比第${occasion.round}轮`, `${winners.length}名修士晋级下一轮。`));
      }
      continue;
    }
    const stillInside = roster.filter(({ id }) => !rescuedMemberOutOfOccasion(world, occasion.id, id));
    const explorer = stillInside.find(({ id }) => !rescueHoldsExpeditionRoll(world, occasion.id, id));
    occasion.remainingIds = stillInside.filter(({ id }) => id !== explorer?.id).map(({ id }) => id);
    if (!explorer) {
      if (!occasion.remainingIds.length && !hasOpenExpeditionRescue(world, occasion.id)) close(occasion);
      continue;
    }
    occasion.round++;
    const fortune = rng() + cap((explorer.hp / Math.max(1, explorer.maxHp) - .65) * .32 + explorer.techniqueMastery * .001 +
      (artifactPowerMultiplier(explorer) - 1) * .15, -.25, .18);
    let outcome: 'death' | 'wounded' | 'escaped' | 'loot';
    let description: string;
    if (fortune < .14) {
      outcome = 'death'; explorer.hp = 0; explorer.alive = false; dropInheritance(explorer, world);
      description = `${explorer.name}触发秘境灵灾，未能生还。`;
    } else if (fortune < .46) {
      outcome = 'wounded'; explorer.hp = Math.max(1, explorer.hp - Math.round(explorer.maxHp * .42)); wearArtifact(explorer, false);
      description = `${explorer.name}遭遇灵灾，重伤后退出险地。`;
    } else if (fortune >= .79) {
      outcome = 'loot'; explorer.spiritStones += 180; rewardContribution(explorer, world, 14);
      explorer.artifacts.push({ id: `relic-${occasion.id}-${explorer.id}`, name: '星门遗宝', spiritRoot: '雷', tier: '通天灵宝',
        durability: 95, maxDurability: 145, resonance: 0 });
      description = `${explorer.name}寻得通天灵宝【星门遗宝】与180灵石。`;
    } else {
      outcome = 'escaped';
      description = `${explorer.name}避过秘境凶险，平安脱身但未寻得珍宝。`;
    }
    recordMemory(explorer, world.tick, description, outcome === 'escaped' ? 5 : 9, 'heavenly', outcome === 'loot' ? 5 : -3);
    occasion.expeditions.push({ cultivatorId: explorer.id, tick: world.tick, outcome, description });
    const report = event(world, occasion, `expedition-${explorer.id}`, '秘境传来消息', description, [explorer.id], outcome === 'death' ? 'death' : 'heavenly');
    results.push(report);
    if (outcome === 'loot') {
      const relic = grantExpeditionRelic(world, occasion, explorer, report);
      if (relic) results.push(relic);
    }
    if (!occasion.remainingIds.length && !hasOpenExpeditionRescue(world, occasion.id)) close(occasion);
  }
  return results;
}
