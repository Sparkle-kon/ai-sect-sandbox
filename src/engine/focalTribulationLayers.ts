import type { WorldEvent } from '../types/world';
import { ascensionEventId, ascensionTrialId } from './ascensionTerms';
import { openSite, verifiedImmortalAscension } from './ascensionProof';
import { STORMS } from './tribulationTerms';
import type { FocalLayer, FocalLayerContext } from './focalLayerEvidence';

const ordinal = ['','一','二','三','四','五','六'] as const;
const waveLine = /^(.{1,64}?)以(?:御雷护体|凝神守心|逆雷砺心)扛过第([1-6])\/([1-6])重劫雷，损失([1-9]\d{0,8})气血(?:，渡劫神丹护持抵去本重部分雷力|，耗费一枚破障丹抵消部分雷力)?。(雷云消退，心魔随即浮现。)?$/u;
const fatalBoltLine = /未能承受第([1-6])重劫雷(?:，已耗渡劫神丹护持|，破障丹护持亦告破)?，身死道消。$/u;
const mindLine = /心魔压过道心，反噬[1-9]\d{0,8}气血(，身死道消。|，修为受挫但仍存性命。)$/u;

function ordinaryLayers(context: FocalLayerContext, end: WorldEvent, body: FocalLayerContext['world']['cultivators'][number],
  source: (id: string) => WorldEvent | undefined): FocalLayer[] {
  const { tick, category, title, description, id, locationId } = end;
  const trial = body.tribulation;
  if (!trial || trial.id !== `trial-${body.id}-${trial.startedTick}` || trial.startedTick >= tick || trial.resolvedTick !== tick ||
      trial.totalWaves !== STORMS[trial.targetRealm]?.waves || !Number.isInteger(trial.nextWave) ||
      trial.nextWave < 1 || trial.nextWave > trial.totalWaves + 1) return [];
  const bodyName = body.name;
  const prefix = (time: number) => `evt-${time}-${body.id}-tribulation-`;
  const past = trial.nextWave - 1;
  let closing: string;
  if (id === `${prefix(tick)}passed` && trial.stage === 'passed' && category === 'breakthrough' && title === '天劫圆满' &&
    description === `${bodyName}渡过劫雷与心魔，踏入【${trial.targetRealm}】境！` && past === trial.totalWaves) {
    closing = `劫雷与心魔皆已渡过。${bodyName}就此踏入${trial.targetRealm}境。`;
  } else if (id === `${prefix(tick)}failure` && trial.stage === 'failed' && description.startsWith(bodyName)) {
    const reason = description.slice(bodyName.length);
    const bolt = fatalBoltLine.exec(reason);
    const mind = mindLine.exec(reason);
    if (bolt?.[0] === reason && Number(bolt[1]) === trial.nextWave && trial.nextWave <= trial.totalWaves &&
        category === 'death' && title === '渡劫陨落' && !body.alive && body.hp === 0 &&
        end.damage?.length === 1 && end.damage[0].cultivatorId === body.id && end.damage[0].amount > 0) {
      closing = `第${ordinal[trial.nextWave]}重劫雷，${bodyName}没能扛住。性命也随这一重雷尽了。`;
    } else if (mind?.[0] === reason && past === trial.totalWaves &&
      (mind[1] === '，身死道消。' ? category === 'death' && title === '渡劫陨落' : category === 'heavenly' && title === '渡劫失败')) {
      closing = category === 'death' ? `${bodyName}败在心魔一关，就此陨落。` : `${bodyName}没能渡过心魔。修为受挫，性命尚在。`;
    } else return [];
  } else return [];

  const result: FocalLayer[] = [];
  const start = source(`${prefix(trial.startedTick)}start`);
  if (start?.tick === trial.startedTick && start.category === 'heavenly' && start.title === '天劫降临' &&
      start.locationId === locationId && start.description === `${bodyName}引动${trial.targetRealm}天劫，须渡过${trial.totalWaves}重雷劫与心魔一关。`)
    result.push({ role:'approach', text:`${bodyName}引动天劫。${trial.targetRealm}境之前，等着${ordinal[trial.totalWaves]}重雷劫和一关心魔。`,eventIds:[start.id] });

  const observed = context.anchors.flatMap(anchor => {
    if (anchor.tick <= trial.startedTick || anchor.tick >= tick || !anchor.id.startsWith(`${prefix(anchor.tick)}wave-`)) return [];
    const event = source(anchor.id);
    if (!event || event.category !== 'heavenly' || event.locationId !== locationId) return [];
    const match = waveLine.exec(event.description);
    if (!match) return [];
    const wave = Number(match[2]);
    const damage = event.damage?.[0];
    if (match[1] !== bodyName || Number(match[3]) !== trial.totalWaves || !!match[5] !== (wave === trial.totalWaves) ||
        wave > past || event.tick < trial.startedTick + wave || event.id !== `${prefix(event.tick)}wave-${wave}` ||
        event.title !== `第${wave}重雷劫` || event.damage?.length !== 1 || damage?.cultivatorId !== body.id ||
        damage.amount !== Number(match[4])) return [];
    return [{ event, wave }];
  }).sort((a,b) => a.wave - b.wave);
  if (observed.length && observed.every((item,i) => i === 0 || item.wave > observed[i-1].wave && item.event.tick > observed[i-1].event.tick)) {
    const each = observed.map(({wave}) => `第${ordinal[wave]}重`).join('、');
    result.push({role:'exchange',text:`${each}劫雷落下时，${bodyName}撑了过去。`,eventIds:observed.map(({event}) => event.id)});
  }
  return result.length ? [...result,{ role:'aftermath', text:closing, eventIds:[id] }] : [];
}

function ascensionLayers(context: FocalLayerContext, end: WorldEvent, body: FocalLayerContext['world']['cultivators'][number],
  source: (id: string) => WorldEvent | undefined): FocalLayer[] {
  const { world } = context;
  const { id, tick, locationId } = end;
  const rows = world.ascension?.trials.filter(row => row.actorId === body.id && row.terminal?.eventId === id) ?? [];
  const trial = rows[0], terminal = trial?.terminal;
  if (rows.length !== 1 || !terminal || trial.siteId !== locationId || !openSite(world,trial.siteId) ||
      trial.id !== ascensionTrialId(body.id,trial.startedTick) || trial.startedTick >= tick ||
      terminal.tick !== tick || terminal.year !== end.year || terminal.month !== end.month) return [];
  const last = trial.waves.at(-1);
  const lastImpact = end.damage?.[0];
  if (!last || terminal.eventId !== last.eventId || terminal.tick !== last.tick || last.year !== end.year || last.month !== end.month ||
      end.damage?.length !== 1 || lastImpact?.cultivatorId !== body.id || lastImpact.amount !== last.beforeHp - last.afterHp) return [];
  const success = terminal.status === 'succeeded' && trial.phase === 'succeeded' &&
    id === ascensionEventId(body.id,tick,'succeeded') && end.category === 'heavenly' && end.title === '九天仙门启' &&
    end.description === '三重真雷皆已亲历并生还；此身越过仙门，未曾陨落，也不再返回下界。' &&
    verifiedImmortalAscension(world,body) !== undefined;
  const failure = terminal.status === 'failed' && terminal.reason === 'lightning' && trial.phase === 'failed' &&
    id === ascensionEventId(body.id,tick,`failed-${last.wave}`) && end.category === 'death' && end.title === '飞升雷下陨落' &&
    end.description === `第${last.wave}重真雷已至，原身未能承住，未入仙门。` && !body.alive && body.hp === 0;
  if (!success && !failure) return [];
  if (trial.waves.some((wave,i) => wave.wave !== i + 1 ||
      wave.tick <= (i === 0 ? trial.startedTick : trial.waves[i-1].tick) || wave.beforeHp <= wave.afterHp ||
      wave.afterHp < 0 || (wave.afterHp === 0) !== (failure && wave === last))) return [];

  const result: FocalLayer[] = [];
  const start = source(ascensionEventId(body.id,trial.startedTick,'warning'));
  if (start?.tick === trial.startedTick && start.year === trial.startedYear && start.month === trial.startedMonth &&
      start.title === '九天云涌' && start.category === 'heavenly' && start.description === '道气已付，三重飞升雷劫尚未落下。')
    result.push({role:'approach',text:`${body.name}已付道气。飞升雷还未落下，仙门尚在前头。`,eventIds:[start.id]});

  const passed = trial.waves.slice(0,-1).flatMap(wave => {
    const event = source(wave.eventId), damage = event?.damage?.[0];
    return event?.id === ascensionEventId(body.id,wave.tick,`wave-${wave.wave}`) &&
      event.tick === wave.tick && event.year === wave.year && event.month === wave.month &&
      event.category === 'heavenly' && event.title === `飞升第${wave.wave}重雷` &&
      event.description === `此身承过第${wave.wave}重真雷，尚未进入仙门。` &&
      event.damage?.length === 1 && damage?.cultivatorId === body.id && damage.amount === wave.beforeHp - wave.afterHp ? [wave] : [];
  });
  if (passed.length) result.push({ role:'exchange',text:`${passed.map(row => `第${ordinal[row.wave]}重`).join('、')}真雷，${body.name}撑了过去。那时，仙门尚未越过。`,eventIds:passed.map(row => row.eventId) });
  return result.length ? [...result,{role:'aftermath',
    text:success ? `第三重真雷过去，${body.name}仍在。接着，${body.name}越过仙门，从此不再返回下界。`
      : `第${ordinal[last.wave]}重真雷落下，${body.name}没能撑过去，终未入仙门。`,eventIds:[id]}] : [];
}

/** Never borrow another attempt, a later wave, or an unseen participant-only account. */
export function writeFocalTribulationLayers(context: FocalLayerContext): FocalLayer[] {
  const { world, focal, throughTick, publicOriginal } = context;
  const [actorId] = focal.actorIds;
  if (focal.tick > throughTick || focal.tick > world.tick || !focal.locationId || focal.actorIds.length !== 1 ||
      !focal.id.startsWith(`evt-${focal.tick}-${actorId}-`)) return [];
  const actorRows = world.cultivators.filter(row => row.id === actorId);
  if (actorRows.length !== 1) return [];
  const body = actorRows[0];
  const source = (id: string): WorldEvent | undefined => {
    const row = publicOriginal(id);
    return row?.id === id && row.tick <= focal.tick && row.tick <= throughTick && row.witnessScope === undefined &&
      row.locationId === focal.locationId && row.actorIds.length === 1 && row.actorIds[0] === actorId ? row : undefined;
  };
  const end = source(focal.id);
  if (!end || end.tick !== focal.tick || end.year !== focal.year || end.month !== focal.month ||
      end.title !== focal.title || end.description !== focal.description || end.category !== focal.category) return [];
  if (end.id.startsWith(`evt-${end.tick}-${actorId}-tribulation-`)) return ordinaryLayers(context,end,body,source);
  if (end.id.startsWith(`evt-${end.tick}-${actorId}-ascension-`)) return ascensionLayers(context,end,body,source);
  return [];
}
