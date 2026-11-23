import { equippedArtifact } from '../engine/artifactEngine';
import { activeAvatar } from '../engine/avatarEngine';
import { isChronicleStoryFact } from '../engine/chronicleLead';
import { activeHeartDemon, isHeartDemonGuided } from '../engine/heartDemonEngine';
import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { isSectActive } from '../engine/sectActivity';
import { terrainTileAt } from '../engine/terrainEngine';
import type { CultivationRealm, Cultivator, PersonalityTrait, Sect, SpiritRoot, WorldState } from '../types/world';
import { mapTransitActorIds } from './mapConvoyView';
import { createTerrainMapView } from './terrainMapView';
import type { SceneStageSeason,SceneStageTheme } from './sceneStageModel';

type Variant = 0 | 1 | 2 | 3;
interface PortraitFace {
  jaw: Variant;
  eyes: Variant;
  hair: Variant;
  ornament: Variant;
  skin: string;
  ink: string;
  detail?: { eyeSpread: number; fringeSweep: number; cheekSlope: number };
}
type PortraitHalo = { kind: 'gold-wheel' | 'dharma' | 'blood-moon'; color: string };
type HairStyle=0|1|2|3|4|5|6|7|8|9|10|11;
export type PortraitExpression='calm'|'joy'|'fight'|'wounded'|'demon'|'surprise'|'dismay'|'concern';
export interface PortraitProjectionOptions {
  readonly viewer?:Cultivator;
  readonly historical?:boolean;
  readonly allowPersonal?:boolean;
  readonly publicEventId?:string;
  readonly contextual?:true;
}
export interface CultivatorPortraitSpec {
  hairStyle?:HairStyle;
  accessoryStyle?:Variant;
  expression?:PortraitExpression;
  locale?:{theme:SceneStageTheme;season:SceneStageSeason};
  treasure?:'sword_case'|'gourd'|'lute_case'|'array_disk';
  face: PortraitFace;
  attire: 'neutral' | 'crossed' | 'layered';
  ageBand: 'youth' | 'seasoned' | 'elder';
  brow: 'level' | 'soft' | 'sharp';
  palette: { fabric: string; trim: string; spirit: string; background: string };
  halo?: PortraitHalo;
}

type TerrainView = ReturnType<typeof createTerrainMapView>;
const skin = ['#edd2ab', '#dda77c', '#c9936b', '#ac7758', '#a2735d', '#e2b99a'] as const;
const inks = ['#191925', '#2d232b', '#222b37', '#38282d'] as const;
const roots: Record<SpiritRoot, string> = {
  金: '#f0d08a', 木: '#86bea1', 水: '#87b7d5', 火: '#de8a72', 土: '#c4a77a', 雷: '#b1a5df',
  暗: '#aa87b6', 天灵根: '#d3dfba',
};
const brows: Record<PersonalityTrait, CultivatorPortraitSpec['brow']> = {
  刚正: 'level', 阴险: 'sharp', 狂傲: 'sharp', 苟道: 'level', 痴情: 'soft', 嗜血: 'sharp', 逍遥: 'soft', 诡诈: 'sharp',
};
const realms: Record<CultivationRealm, number> = {
  练气: 0, 筑基: 1, 金丹: 2, 元婴: 3, 化神: 4, 炼虚: 5, 合体: 6, 大乘: 7, 渡劫: 8,
};
const fallbackColor = '#3d5663';
const hex = /^#[0-9a-f]{6}$/iu;

function uniqueById<T extends { id: string }>(rows: readonly T[]) {
  const index = new Map<string, T | undefined>();
  for (const row of rows) index.set(row.id, index.has(row.id) ? undefined : row);
  return index;
}

function hash(seed: number, identity: string) {
  // Visual-only mixer, deliberately independent of the world's live PRNG and editable labels.
  // Consume Unicode scalars, not normalized names or cohort/display order.
  let state = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (const scalar of identity) {
    state = Math.imul(state ^ (scalar.codePointAt(0) ?? 0), 16777619);
  }
  return stir(state);
}
function stir(state: number) {
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d);
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b);
  return (state ^ (state >>> 16)) >>> 0;
}
const variant = (seed: number, shift: number) => ((seed >>> shift) & 3) as Variant;
const detail = (seed: number, shift: number) => (((seed >>> shift) & 255) - 128) / 64;

function mix(a: string, b: string, proportion: number) {
  return '#' + [1, 3, 5].map(index =>
    Math.round(Number.parseInt(a.slice(index, index + 2), 16) * (1 - proportion) +
      Number.parseInt(b.slice(index, index + 2), 16) * proportion).toString(16).padStart(2, '0'),
  ).join('');
}

function portraitFace(seed: number, id: string): PortraitFace {
  const major = hash(seed, id);
  const minor = stir(major ^ 0x4a6f7921);
  return {
    jaw: variant(major, 0), eyes: variant(major, 2), hair: variant(major, 4), ornament: variant(major, 6),
    skin: skin[(major >>> 8) % skin.length], ink: inks[variant(major, 20)],
    detail: { eyeSpread: detail(minor, 0), fringeSweep: detail(minor, 8), cheekSlope: detail(minor, 16) },
  };
}
function actualHalo(actor: Cultivator, sect?: Sect): PortraitHalo | undefined {
  const power = Object.hasOwn(realms, actor.realm) ? realms[actor.realm] : -1;
  if (!actor.alive || actor.positionPlane !== undefined || power < 2) return undefined;
  if (sect?.alignment === '魔道') return { kind: 'blood-moon', color: '#fb8292' };
  if (power === 2) return { kind: 'gold-wheel', color: '#f9d68a' };
  return { kind: 'dharma', color: roots[actor.spiritRoot] ?? '#c8d5f1' };
}

function derivePortrait(world: WorldState, actor: Cultivator, sect?: Sect): CultivatorPortraitSpec {
  const ratio = Number.isFinite(actor.age) && Number.isFinite(actor.lifespan) && actor.lifespan > 0 ?
    actor.age / actor.lifespan : .4;
  const spirit = roots[actor.spiritRoot] ?? '#a8c6bc';
  const robe = sect && hex.test(sect.color) ? sect.color : fallbackColor;
  const halo = actualHalo(actor, sect);
  const hairstyle=stir(hash(world.random.seed,actor.id)^0x58ca74d1);
  return {
    face: portraitFace(world.random.seed, actor.id),
    expression:'calm',
    hairStyle:(hairstyle%12) as HairStyle,
    accessoryStyle:variant(hairstyle,19),
    attire: actor.gender === 'man' ? 'crossed' : actor.gender === 'woman' ? 'layered' : 'neutral',
    ageBand: ratio < .25 ? 'youth' : ratio < .65 ? 'seasoned' : 'elder',
    brow: brows[actor.personality] ?? 'level',
    palette: {
      fabric: mix(robe, '#1c2635', .4),
      trim: mix(robe, spirit, .73),
      spirit,
      background: mix(robe, '#101828', .74),
    },
    ...(halo ? { halo } : {}),
  };
}

function atmosphere(world: WorldState,siteId:string):NonNullable<CultivatorPortraitSpec['locale']> {
  const month=world.month;
  const season=month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';
  const theme=siteId==='loc-taixu'?'sword_peak':siteId==='loc-danxia'?'pill_valley':siteId==='loc-blood'?'blood_abyss':
    siteId==='loc-vein-north'?'north_vein':siteId==='loc-market'||siteId==='loc-market-east'?'market':'countryside';
  return {theme,season};
}

function addPortraitContext(world:WorldState,actor:Cultivator,portrait:CultivatorPortraitSpec,options:PortraitProjectionOptions,
  view?:TerrainView):CultivatorPortraitSpec {
  if(options.historical||!actor.alive||!(actor.hp>0)||actor.positionPlane!==undefined)return portrait;
  const viewer=options.viewer;
  if(viewer&&uniqueById(world.cultivators).get(viewer.id)!==viewer)return portrait;
  const frame=options.allowPersonal&&viewer===actor?activeHeartDemon(world,actor):undefined;
  const guided=frame&&actor.tribulation?.heartGuide?.bindingGeneration===world.playerAvatar.switchAvailableTick&&isHeartDemonGuided(world,actor,frame);
  const personal=options.allowPersonal&&viewer===actor&&(guided||activeAvatar(world)===actor);
  if(!view&&!options.contextual&&!options.publicEventId&&!personal)return portrait;
  const scope=view??createTerrainMapView(world,viewer,viewer!==undefined);
  const actualSite=uniqueById(world.locations).get(actor.locationId);
  const site=actualSite&&actualSite.type!=='secret_realm'&&!isScopedExpeditionGate(actualSite)&&
    scope.isCurrentLocation(actualSite.id)&&scope.seenLocations.includes(actualSite)?actualSite:undefined;
  const travellers=mapTransitActorIds(world);
  const live=uniqueById(scope.liveActors),canonical=uniqueById(world.cultivators);
  const present=(id:string)=>{const other=live.get(id);return other&&canonical.get(id)===other&&other.alive&&other.hp>0&&
    other.positionPlane===undefined&&other.locationId===site?.id&&!scope.trailPositions.has(id)&&!travellers.has(id)?other:undefined;};
  if(!site||present(actor.id)!==actor)return portrait;
  const events=[...uniqueById(world.events).values()].filter(event=>event&&event.witnessScope===undefined&&
    event.tick===world.tick&&event.year===world.year&&event.month===world.month&&event.locationId===site.id&&
    isChronicleStoryFact(event,world.tick)&&(!options.publicEventId||event.id===options.publicEventId));
  if(options.publicEventId&&!events.some(event=>event?.actorIds.includes(actor.id)))return portrait;
  const battle=events.some(event=>{
    if(!event||event.category!=='combat'||event.actorIds.length!==2||event.actorIds[0]===event.actorIds[1]||
      !event.actorIds.includes(actor.id)||!event.actorIds.every(id=>present(id))||
      !event.duelWinnerId||!event.actorIds.includes(event.duelWinnerId))return false;
    return event.id===`evt-${world.tick}-${event.actorIds[0]}-duel`;
  });
  const joyful=events.some(event=>{
    if(!event||event.category!=='breakthrough'||event.actorIds.length!==1||event.actorIds[0]!==actor.id)return false;
    const id=`evt-${world.tick}-${actor.id}-`;
    const trial=actor.tribulation;
    const ordinary=event.id===id+'break'&&(event.title===`${actor.name}突破至${actor.realm}${actor.realmStage}层`||
      actor.realmStage===1&&event.title===`天地异象：${actor.name}晋升${actor.realm}期！`);
    return ordinary||event.id===id+'tribulation-passed'&&event.title==='天劫圆满'&&!!trial&&trial.id===`trial-${actor.id}-${trial.startedTick}`&&
      trial.stage==='passed'&&trial.resolvedTick===world.tick&&actor.realm===trial.targetRealm&&actor.realmStage===1;
  });
  const wounded=Number.isFinite(actor.maxHp)&&actor.maxHp>0&&actor.hp/actor.maxHp<.45;
  const expression:PortraitExpression=personal&&frame?'demon':wounded?'wounded':battle?'fight':joyful?'joy':'calm';
  const item=personal?equippedArtifact(actor):undefined;
  const treasure=item&&(item.relicSetId?'array_disk':item.spiritRoot==='木'?'gourd':item.spiritRoot==='水'?'lute_case':
    item.spiritRoot==='金'||item.spiritRoot==='雷'?'sword_case':'array_disk');
  const hasBackdrop=!!(options.contextual||options.publicEventId||personal)||expression!=='calm';
  return hasBackdrop?{...portrait,expression,locale:atmosphere(world,site.id),...(treasure?{treasure}:{})}:portrait;
}

/** Profile may show a canonically selected historical/deceased person, never a detached row. */
export function projectCultivatorPortrait(world: WorldState, actor?: Cultivator | null, options?:PortraitProjectionOptions): CultivatorPortraitSpec | undefined {
  if (!actor) return undefined;
  const match = world.cultivators.filter(row => row.id === actor.id);
  if (match.length !== 1 || match[0] !== actor) return undefined;
  const sect = uniqueById(world.sects).get(actor.sectId);
  const portrait=derivePortrait(world, actor, isSectActive(sect) ? sect : undefined);
  return options?addPortraitContext(world,actor,portrait,options):portrait;
}

function forCurrentMapActors(world: WorldState, view: TerrainView, accepts: (actor: Cultivator, sect?: Sect) => void) {
  if (!view.liveActors.length || !view.seenLocations.length) return;
  const actors = uniqueById(world.cultivators), seenActors = uniqueById(view.liveActors);
  const sites = uniqueById(world.locations), seenSites = uniqueById(view.seenLocations), sects = uniqueById(world.sects);
  const travellers = mapTransitActorIds(world);
  for (const actor of seenActors.values()) {
    if (!actor || actors.get(actor.id) !== actor || !actor.alive || !(actor.hp > 0) ||
        actor.positionPlane !== undefined || travellers.has(actor.id) || view.trailPositions.has(actor.id)) continue;
    const site = sites.get(actor.locationId);
    if (!site || seenSites.get(site.id) !== site || site.type === 'secret_realm' || isScopedExpeditionGate(site) ||
        !view.isCurrentLocation(site.id)) continue;
    const tile = terrainTileAt(world, site.x, site.y);
    if (!tile || view.locationTile.get(site.id) !== tile || view.tileState(tile) !== 'visible' ||
        (view.current && !view.current.has(tile.id))) continue;
    const sect = sects.get(actor.sectId);
    accepts(actor, isSectActive(sect) ? sect : undefined);
  }
}

/** The map popover receives one small decorative spec only for the same currently painted actor. */
export function projectMapCultivatorPortrait(world: WorldState, view: TerrainView, actor?: Cultivator | null, options?:PortraitProjectionOptions):
    CultivatorPortraitSpec | undefined {
  if (!actor) return undefined;
  let visible: CultivatorPortraitSpec | undefined;
  forCurrentMapActors(world, view, (candidate, sect) => {
    if (candidate !== actor) return;
    const portrait=derivePortrait(world, actor, sect);
    visible=addPortraitContext(world,actor,portrait,options??{},view);
  });
  return visible;
}

/** Aura-only Canvas projection; no hashes, portrait geometry, explicit roster cap or additional animation. */
export function projectMapCultivatorHalos(world: WorldState, view: TerrainView): ReadonlyMap<string, PortraitHalo> {
  const result = new Map<string, PortraitHalo>();
  forCurrentMapActors(world, view, (actor, sect) => {
    const halo = actualHalo(actor, sect);
    if (halo) result.set(actor.id, halo);
  });
  return result;
}

/** Bulk read for non-painter consumers; Canvas should use the lighter halo-only projection. */
export function projectMapCultivatorPortraits(world: WorldState, view: TerrainView): ReadonlyMap<string, CultivatorPortraitSpec> {
  const result = new Map<string, CultivatorPortraitSpec>();
  forCurrentMapActors(world, view, (actor, sect) => result.set(actor.id, derivePortrait(world, actor, sect)));
  return result;
}

/** Bulk appearance for actors already authorized by the caller's presentation scope. Not a visibility grant. */
export function projectCanonicalCultivatorPortraits(world: WorldState, scopedActors: readonly Cultivator[]):
    ReadonlyMap<string, CultivatorPortraitSpec> {
  const result=new Map<string,CultivatorPortraitSpec>();
  if (!scopedActors.length) return result;
  const actors=uniqueById(world.cultivators), sects=uniqueById(world.sects);
  for (const actor of uniqueById(scopedActors).values()) {
    if (!actor || actors.get(actor.id) !== actor) continue;
    const sect=sects.get(actor.sectId);
    result.set(actor.id,derivePortrait(world,actor,isSectActive(sect)?sect:undefined));
  }
  return result;
}
