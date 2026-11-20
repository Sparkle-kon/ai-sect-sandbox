import {
  REALM_BASE_POWER,
  REALM_LIFESPAN,
  REALM_ORDER,
} from '../data/initialWorld';
import {
  Cultivator,
  LLMDecisionPayload,
  RelationType,
  WorldEvent,
  WorldState,
} from '../types/world';
import { computeHeuristicDecision } from './llmBrain';
import { maintainMemories, recordMemory } from './memoryEngine';
import { synthesizeReflections } from './reflectionEngine';
import { fabricateRumor, spreadRumors, witnessEvent } from './rumorEngine';
import { expireScheme, pursueScheme } from './schemeEngine';
import { scriptedDialogue } from './dialogueEngine';
import { resolveEncounter } from './encounterEngine';

export type GodInterventionType =
  | 'SPAWN_TREASURE'
  | 'TRIBULATION_STRIKE'
  | 'DEMONIC_TIDE'
  | 'WHISPER_MIND';

export interface GodInterventionCommand {
  type: GodInterventionType;
  targetCultivatorId?: string;
  targetLocationId?: string;
  whisperText?: string;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function adjustRelationship(
  world: WorldState,
  fromId: string,
  toId: string,
  delta: number,
  fallbackType: RelationType,
  noteUpdate?: string
): void {
  const existing = world.relationships.find(
    (r) =>
      (r.fromId === fromId && r.toId === toId) ||
      (r.fromId === toId && r.toId === fromId)
  );
  if (existing) {
    existing.affinity = clamp(existing.affinity + delta, -100, 100);
    if (existing.affinity <= -60) {
      existing.type = '血仇';
    } else if (existing.affinity >= 80 && existing.type === '竞争') {
      existing.type = '挚友';
    }
    if (noteUpdate) {
      existing.note = noteUpdate;
    }
  } else {
    world.relationships.push({
      fromId,
      toId,
      type: fallbackType,
      affinity: clamp(delta, -100, 100),
      note: noteUpdate ?? '修仙界因果交集',
    });
  }
}

export function applyCultivatorBrainDecision(
  world: WorldState,
  cultivator: Cultivator,
  decision: LLMDecisionPayload,
  rng: () => number = Math.random
): WorldEvent | null {
  cultivator.innerMonologue = decision.innerMonologue;
  cultivator.currentAction = decision.chosenAction;

  const location = world.locations.find((l) => l.id === cultivator.locationId);
  const qiFactor = (location?.spiritQi ?? 50) / 50;

  switch (decision.chosenAction) {
    case 'PURSUE_SCHEME': {
      return pursueScheme(cultivator, world, decision.proposedScheme, (target) => {
        const result = applyCultivatorBrainDecision(world, cultivator, {
          chosenAction: 'DUEL', innerMonologue: decision.innerMonologue, targetCultivatorId: target.id,
        }, rng);
        cultivator.currentAction = 'PURSUE_SCHEME';
        return result;
      }, (target, delta) => adjustRelationship(world, cultivator.id, target.id, delta, '竞争'), rng);
    }
    case 'TRADE':
    case 'DUAL_CULTIVATE':
    case 'SECT_DIPLOMACY':
      return resolveEncounter(decision.chosenAction, world, cultivator, decision,
        (target, amount) => adjustRelationship(world, cultivator.id, target.id, amount,
          cultivator.sectId === target.sectId ? '同门' : '竞争'));
    case 'CULTIVATE': {
      const gain = Math.round((8 + rng() * 10) * qiFactor);
      cultivator.qiProgress = clamp(cultivator.qiProgress + gain, 0, 100);
      cultivator.hp = clamp(
        cultivator.hp + Math.round(cultivator.maxHp * 0.08),
        1,
        cultivator.maxHp
      );
      return null;
    }

    case 'REST': {
      const previousHp = cultivator.hp;
      const heal = Math.round(cultivator.maxHp * 0.35);
      cultivator.hp = clamp(cultivator.hp + heal, 1, cultivator.maxHp);
      if (cultivator.hp > previousHp) {
        recordMemory(
          cultivator,
          world.tick,
          `在【${location?.name ?? '洞府'}】闭关调息，恢复了 ${cultivator.hp - previousHp} 点气血。`,
          4,
          'cultivation', 1
        );
      }
      return null;
    }

    case 'EXPLORE': {
      const dest =
        world.locations.find((l) => l.id === decision.targetLocationId) ??
        world.locations[Math.floor(rng() * world.locations.length)];
      if (dest && dest.id !== cultivator.locationId) {
        cultivator.locationId = dest.id;
        // Random chance of finding spirit stones or herbs while exploring
        if (rng() < 0.35) {
          const foundStones = Math.round(40 + rng() * 120);
          cultivator.spiritStones += foundStones;
          recordMemory(
            cultivator,
            world.tick,
            `御剑游历至【${dest.name}】，偶得机缘收获 ${foundStones} 枚灵石。`,
            6,
            'cultivation', 2
          );
          return {
            id: `evt-${world.tick}-${cultivator.id}-explore`,
            tick: world.tick,
            year: world.year,
            month: world.month,
            title: `${cultivator.name}游历${dest.name}获机缘`,
            description: `${cultivator.name}御剑抵达【${dest.name}】，在古迹残垣间寻得 ${foundStones} 枚上品灵石。`,
            category: 'breakthrough',
            actorIds: [cultivator.id],
            locationId: dest.id,
          };
        }
      }
      return null;
    }

    case 'BREAKTHROUGH': {
      const successChance =
        0.55 + (cultivator.karma / 500) + (cultivator.qiProgress >= 95 ? 0.2 : 0);
      if (rng() <= successChance) {
        cultivator.qiProgress = 0;
        let majorRealmUp = false;
        if (cultivator.realmStage < 9) {
          cultivator.realmStage += 1;
        } else {
          const currentIdx = REALM_ORDER.indexOf(cultivator.realm);
          if (currentIdx < REALM_ORDER.length - 1) {
            cultivator.realm = REALM_ORDER[currentIdx + 1];
            cultivator.realmStage = 1;
            majorRealmUp = true;
          }
        }
        const basePower = REALM_BASE_POWER[cultivator.realm];
        cultivator.maxHp = Math.round(
          basePower * (1 + cultivator.realmStage * 0.08)
        );
        cultivator.hp = cultivator.maxHp;
        cultivator.combatPower = Math.round(
          basePower * (1 + cultivator.realmStage * 0.1) +
            cultivator.artifacts.length * 45
        );
        cultivator.lifespan = REALM_LIFESPAN[cultivator.realm];

        const msg = majorRealmUp
          ? `渡过天劫，成功破境踏入【${cultivator.realm}期】！寿元与战力暴涨！`
          : `突破瓶颈，修为精进至【${cultivator.realm}${cultivator.realmStage}层】！`;

        recordMemory(cultivator, world.tick, msg, majorRealmUp ? 10 : 7, 'cultivation', majorRealmUp ? 5 : 3);
        return {
          id: `evt-${world.tick}-${cultivator.id}-break`,
          tick: world.tick,
          year: world.year,
          month: world.month,
          title: majorRealmUp
            ? `天地异象：${cultivator.name}晋升${cultivator.realm}期！`
            : `${cultivator.name}突破至${cultivator.realm}${cultivator.realmStage}层`,
          description: `在【${location?.name ?? '灵山'}】，${cultivator.name}${msg}`,
          category: 'breakthrough',
          actorIds: [cultivator.id],
          locationId: cultivator.locationId,
        };
      } else {
        // Tribulation backlash
        const backlashDamage = Math.round(cultivator.maxHp * 0.28);
        cultivator.hp = clamp(cultivator.hp - backlashDamage, 10, cultivator.maxHp);
        cultivator.qiProgress = 45;
        recordMemory(
          cultivator,
          world.tick,
          `冲击更高境界时心魔丛生，惨遭反噬受损 ${backlashDamage} 点气血！`,
          8,
          'cultivation', -4
        );
        return {
          id: `evt-${world.tick}-${cultivator.id}-fail`,
          tick: world.tick,
          year: world.year,
          month: world.month,
          title: `${cultivator.name}破境遭天劫反噬`,
          description: `${cultivator.name}强行冲关失败，雷劫加身吐血重伤，气息萎靡。`,
          category: 'heavenly',
          actorIds: [cultivator.id],
          locationId: cultivator.locationId,
        };
      }
    }

    case 'SOCIALIZE': {
      const target = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && c.locationId === cultivator.locationId &&
        (decision.targetCultivatorId === undefined || c.id === decision.targetCultivatorId)
      );
      if (!target) return null;

      adjustRelationship(
        world,
        cultivator.id,
        target.id,
        12,
        cultivator.sectId === target.sectId ? '同门' : '挚友',
        `在${location?.name ?? '秘境'}品茗论道，情谊加深`
      );
      cultivator.qiProgress = clamp(cultivator.qiProgress + 6, 0, 100);
      target.qiProgress = clamp(target.qiProgress + 6, 0, 100);
      recordMemory(
        cultivator,
        world.tick,
        `与【${target.name}】在【${location?.name ?? '坊市'}】论道交流，双方修为皆有精进。`,
        6,
        'social', 3
      );
      return {
        id: `evt-${world.tick}-${cultivator.id}-social`,
        tick: world.tick,
        year: world.year,
        month: world.month,
        title: `${cultivator.name}与${target.name}坐而论道`,
        description: `${cultivator.name}与${target.name}于【${location?.name ?? '灵山'}】畅谈天地法则，${decision.spokenLine ? `言道：“${decision.spokenLine}”` : '相谈甚欢。'}`,
        category: 'diplomacy',
        actorIds: [cultivator.id, target.id],
        locationId: cultivator.locationId,
      };
    }

    case 'SCHEMING': {
      const target = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && c.locationId === cultivator.locationId &&
        (decision.targetCultivatorId === undefined || c.id === decision.targetCultivatorId)
      );
      if (!target) return null;

      if (decision.rumorIntent) {
        fabricateRumor(world, cultivator, target, decision.rumorIntent);
      }
      const stolenStones = Math.min(target.spiritStones, Math.round(50 + rng() * 110));
      target.spiritStones -= stolenStones;
      cultivator.spiritStones += stolenStones;
      cultivator.karma = clamp(cultivator.karma - 8, -100, 100);

      adjustRelationship(
        world,
        cultivator.id,
        target.id,
        -25,
        '竞争',
        `${cultivator.name}暗中设局算计了${target.name}`
      );
      recordMemory(
        cultivator,
        world.tick,
        `施展阴谋算计【${target.name}】，截获其 ${stolenStones} 枚灵石与修行情报。`,
        7,
        'social', 2
      );
      recordMemory(
        target,
        world.tick,
        `遭【${cultivator.name}】暗中算计，损失了 ${stolenStones} 枚灵石，心中暗恨！`,
        8,
        'social', -4
      );
      return {
        id: `evt-${world.tick}-${cultivator.id}-scheme`,
        tick: world.tick,
        year: world.year,
        month: world.month,
        title: `暗流涌动：${cultivator.name}设局算计${target.name}`,
        description: `${cultivator.name}借天机迷阵暗算${target.name}，夺走 ${stolenStones} 枚灵石并动摇其道心。`,
        category: 'intrigue',
        witnessScope: 'participants',
        actorIds: [cultivator.id, target.id],
        locationId: cultivator.locationId,
      };
    }

    case 'DUEL': {
      const defender = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && c.locationId === cultivator.locationId &&
        (decision.targetCultivatorId === undefined || c.id === decision.targetCultivatorId)
      );
      if (!defender) return null;

      const attackerScore = cultivator.combatPower * (0.85 + rng() * 0.3);
      const defenderScore = defender.combatPower * (0.85 + rng() * 0.3);
      const winner = attackerScore >= defenderScore ? cultivator : defender;
      const loser = winner.id === cultivator.id ? defender : cultivator;

      const dmgToLoser = Math.round(loser.maxHp * (0.35 + rng() * 0.35));
      const dmgToWinner = Math.round(winner.maxHp * (0.1 + rng() * 0.15));
      loser.hp = Math.max(0, loser.hp - dmgToLoser);
      winner.hp = Math.max(1, winner.hp - dmgToWinner);

      adjustRelationship(
        world,
        cultivator.id,
        defender.id,
        -40,
        '血仇',
        `在${location?.name ?? '荒野'}发生生死斗法，结下深仇`
      );

      if (loser.hp <= 0) {
        loser.alive = false;
        const lootedStones = loser.spiritStones;
        winner.spiritStones += lootedStones;
        loser.spiritStones = 0;
        if (loser.artifacts.length > 0) {
          winner.artifacts.push(loser.artifacts[0]);
        }
        recordMemory(
          winner,
          world.tick,
          `在生死斗法中斩杀【${loser.name}】，搜刮其储物袋获 ${lootedStones} 灵石！`,
          10,
          'combat', 4
        );
        return {
          id: `evt-${world.tick}-${cultivator.id}-kill`,
          tick: world.tick,
          year: world.year,
          month: world.month,
          title: `陨落：${winner.name}斩杀${loser.name}！`,
          description: `【${location?.name ?? '秘境'}】剑气纵横，${cultivator.name}与${defender.name}爆发生死决战！最终${winner.name}技高一筹，将${loser.name}当场斩杀并夺其法宝储物袋！`,
          category: 'death',
          actorIds: [cultivator.id, defender.id],
          dialogue: scriptedDialogue('combat', cultivator, defender, `${winner.name}胜出，${loser.name}当场陨落。`, decision.spokenLine),
          locationId: cultivator.locationId,
        };
      }

      recordMemory(
        winner,
        world.tick,
        `与【${loser.name}】激战一场将其击败重创。`,
        8,
        'combat', 3
      );
      recordMemory(
        loser,
        world.tick,
        `不敌【${winner.name}】身受重伤，燃血遁走，此仇必报！`,
        9,
        'combat', -5
      );
      return {
        id: `evt-${world.tick}-${cultivator.id}-duel`,
        tick: world.tick,
        year: world.year,
        month: world.month,
        title: `惊天斗法：${cultivator.name}激战${defender.name}`,
        description: `${cultivator.name}于【${location?.name ?? '秘境'}】向${defender.name}悍然出手！一番激斗后，${winner.name}占据上风，${loser.name}受创（-${dmgToLoser} HP）化作血光遁走。`,
        category: 'combat',
        actorIds: [cultivator.id, defender.id],
        dialogue: scriptedDialogue('combat', cultivator, defender, `${winner.name}占得上风，${loser.name}负伤离去。`, decision.spokenLine),
        locationId: cultivator.locationId,
      };
    }
  }
}

/**
 * Advances the entire world by 1 tick (1 month in virtual cultivation calendar).
 * Accepts optional precomputed LLM decisions keyed by cultivator ID.
 */
export function advanceWorldTick(
  prevState: WorldState,
  precomputedDecisions?: Record<string, LLMDecisionPayload>,
  rng: () => number = Math.random
): WorldState {
  const nextState: WorldState = structuredClone(prevState);
  nextState.tick += 1;
  if (nextState.month >= 12) {
    nextState.year += 1;
    nextState.month = 1;
  } else {
    nextState.month += 1;
  }

  const newEvents: WorldEvent[] = [];

  for (const cultivator of nextState.cultivators) {
    if (!cultivator.alive) continue;

    // Age increment every 12 months
    if (nextState.month === 1) {
      cultivator.age += 1;
      if (cultivator.age >= cultivator.lifespan) {
        cultivator.alive = false;
        cultivator.hp = 0;
        const death: WorldEvent = {
          id: `evt-${nextState.tick}-${cultivator.id}-oldage`,
          tick: nextState.tick,
          year: nextState.year,
          month: nextState.month,
          title: `寿元耗尽：${cultivator.name}坐化陨落`,
          description: `${cultivator.name}未能突破更高境界，大限将至，于洞府中安然坐化。`,
          category: 'death',
          actorIds: [cultivator.id],
          locationId: cultivator.locationId,
        };
        newEvents.push(death);
        witnessEvent(nextState, death);
        continue;
      }
    }

    const decision =
      precomputedDecisions?.[cultivator.id] ??
      computeHeuristicDecision(cultivator, nextState, rng);

    const evt = applyCultivatorBrainDecision(nextState, cultivator, decision, rng);
    if (evt) {
      newEvents.push(evt);
      witnessEvent(nextState, evt);
    }
  }

  for (const cultivator of nextState.cultivators) {
    expireScheme(cultivator, nextState.tick);
    if (!cultivator.alive) continue;
    const yearly = nextState.month === 1;
    maintainMemories(cultivator, nextState.tick, yearly);
    if (yearly) cultivator.reflections = synthesizeReflections(cultivator, nextState.tick);
  }

  spreadRumors(nextState);
  nextState.events = [...newEvents, ...nextState.events].slice(0, 120);
  return nextState;
}

/**
 * Applies a Heavenly Dao (God Console) direct intervention to the world state.
 */
export function executeGodIntervention(
  prevState: WorldState,
  cmd: GodInterventionCommand
): WorldState {
  const nextState: WorldState = structuredClone(prevState);

  switch (cmd.type) {
    case 'SPAWN_TREASURE': {
      const loc =
        nextState.locations.find((l) => l.id === cmd.targetLocationId) ??
        nextState.locations[0];
      loc.spiritQi = clamp(loc.spiritQi + 20, 10, 150);

      const luckyOnes = nextState.cultivators.filter(
        (c) => c.alive && c.locationId === loc.id
      );
      for (const c of luckyOnes) {
        c.qiProgress = clamp(c.qiProgress + 30, 0, 100);
        c.spiritStones += 500;
        if (!c.artifacts.includes('天道造化玉碟')) {
          c.artifacts.push('天道造化玉碟');
        }
        recordMemory(
          c,
          nextState.tick,
          `天降祥瑞于【${loc.name}】，我沐浴仙光获得天材地宝，修为大进！`,
          10,
          'heavenly', 5
        );
      }

      nextState.events.unshift({
        id: `evt-god-treasure-${nextState.tick}-${++nextState.interventionSequence}`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: `天道赐福：【${loc.name}】仙宝出世！`,
        description: `天道降下浩瀚紫气，【${loc.name}】灵气暴涨，驻留此地的 ${luckyOnes.map((c) => c.name).join('、') || '生灵'} 获无上造化！`,
        category: 'heavenly',
        actorIds: luckyOnes.map((c) => c.id),
        locationId: loc.id,
      });
      break;
    }

    case 'TRIBULATION_STRIKE': {
      const target =
        nextState.cultivators.find((c) => c.id === cmd.targetCultivatorId) ??
        nextState.cultivators.find((c) => c.alive);
      if (!target) break;

      const dmg = Math.round(target.maxHp * 0.45);
      target.hp = clamp(target.hp - dmg, 1, target.maxHp);
      target.innerMonologue = '为何苍天突然降下紫霄神雷劈我？！莫非我逆天行事触怒了天道？！';
      recordMemory(
        target,
        nextState.tick,
        `无故遭九天紫霄神雷劈中，损失 ${dmg} 点气血，道心巨震！`,
        10,
        'heavenly', -5
      );

      nextState.events.unshift({
        id: `evt-god-strike-${nextState.tick}-${++nextState.interventionSequence}`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: `天罚降世：九天神雷怒劈${target.name}！`,
        description: `晴空霹雳！一道毁天灭地的紫霄神雷直劈${target.name}，令其重伤吐血（-${dmg} HP）！`,
        category: 'heavenly',
        actorIds: [target.id],
        locationId: target.locationId,
      });
      break;
    }

    case 'DEMONIC_TIDE': {
      for (const c of nextState.cultivators) {
        if (!c.alive) continue;
        if (c.sectId === 'sect-bloodmoon') {
          c.combatPower = Math.round(c.combatPower * 1.15);
          c.qiProgress = clamp(c.qiProgress + 20, 0, 100);
        } else {
          c.hp = clamp(c.hp - Math.round(c.maxHp * 0.15), 1, c.maxHp);
        }
      }
      nextState.events.unshift({
        id: `evt-god-demon-${nextState.tick}-${++nextState.interventionSequence}`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: '血月当空：域外天魔劫降临！',
        description:
          '苍穹化为诡异血色，魔道修士战力暴涨15%，正道与中立修士皆受魔音侵蚀气血受损！',
        category: 'heavenly',
        actorIds: nextState.cultivators.filter((c) => c.alive).map((c) => c.id),
      });
      break;
    }

    case 'WHISPER_MIND': {
      const target =
        nextState.cultivators.find((c) => c.id === cmd.targetCultivatorId) ??
        nextState.cultivators.find((c) => c.alive);
      if (!target || !cmd.whisperText?.trim()) break;

      const whisper = cmd.whisperText.trim();
      target.innerMonologue = `脑海中突然响起神秘天道法旨：“${whisper}”……我定当遵从这冥冥中的指引！`;
      target.secretGoal = whisper;
      recordMemory(
        target,
        nextState.tick,
        `聆听天道传音：“${whisper}”，从此道心执念彻底改变。`,
        10,
        'whisper', 5
      );

      nextState.events.unshift({
        id: `evt-god-whisper-${nextState.tick}-${++nextState.interventionSequence}`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: `天道传音：神念降临${target.name}识海`,
        description: `冥冥之中一道不可抗拒的意志传入${target.name}脑海：“${whisper}”，彻底改写了其秘密目标！`,
        category: 'intrigue',
        witnessScope: 'participants',
        actorIds: [target.id],
        locationId: target.locationId,
      });
      break;
    }
  }

  const head = nextState.events[0];
  if (head && head.id !== prevState.events[0]?.id) witnessEvent(nextState, head);
  return nextState;
}
