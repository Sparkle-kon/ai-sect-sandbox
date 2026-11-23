import type { Cultivator, LLMDecisionPayload, LocationNode, WorldState } from '../../types/world';
import { activeAvatar } from '../avatarEngine';
import { apprenticeshipPhysicallyAt } from '../apprenticeshipPresence';
import { knownMapLocations, terrainTileAt } from '../terrainEngine';
import { weatherTravelFriction } from '../weatherEngine';
import type { DirectorNudge } from './nudge';
import { publicCampaignStaging } from './campaignNudge';

export const DIRECTOR_TOURNAMENT_TITLE = '坊市问剑会';
const nameOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function directorSiteIsSafe(world: WorldState, site: LocationNode, tick = world.tick): boolean {
  if (!world.locations.includes(site) || site.expeditionOmenId !== undefined || site.type === 'abyss') return false;
  const tile = terrainTileAt(world, site.x, site.y);
  return !!tile && !world.mapHazards.some(row => row.tileId === tile.id && row.createdTick <= tick &&
    row.expiresTick > tick && row.intensity >= 2);
}

/** Ordinary EXPLORE reaches a known permanent destination in one native action. */
export function directorKnownReachableSites(world: WorldState, actor: Cultivator): LocationNode[] {
  const origin = world.locations.find(site => site.id === actor.locationId);
  if (!origin || !world.cultivators.includes(actor) || !actor.alive || actor.hp <= 0 || actor.positionPlane !== undefined ||
      origin.expeditionOmenId !== undefined) return [];
  return knownMapLocations(world, actor).filter(site => site !== origin && directorSiteIsSafe(world, site) &&
    weatherTravelFriction(world, origin, site) <= .72)
    .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) ||
      nameOrder(a.id, b.id));
}

function canDirectNpc(world: WorldState, actor: Cultivator, tick: number): boolean {
  // A transient loss of visible control during a live lease does not grant authority to steer the body.
  const lease = world.playerAvatar;
  return world.cultivators.includes(actor) && activeAvatar(world) !== actor &&
    !(lease.possessedId === actor.id && (lease.possessionUntilTick ?? 0) > world.tick) &&
    !(actor.guardAssignment && actor.guardAssignment.expiresTick > tick) &&
    actor.hp >= .55 * actor.maxHp && apprenticeshipPhysicallyAt(world, actor, actor.locationId, tick);
}

export function directorRoll(world: WorldState, tick: number, parts: readonly string[]): number {
  const key = JSON.stringify([world.random.seed, tick, ...parts]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) % 100;
}

export function liveDirectorNudges(world: WorldState, tick = world.tick): readonly DirectorNudge[] {
  return world.storyteller?.nudges?.filter(row => row.expiresTick >= tick) ?? [];
}

export function consumeDirectorNudge(world: WorldState, nudge: DirectorNudge): void {
  const state = world.storyteller;
  if (!state?.nudges?.includes(nudge)) return;
  const retained = state.nudges.filter(row => row !== nudge);
  if (retained.length) state.nudges = retained;
  else delete state.nudges;
}

export interface DirectorTravelPreference {
  readonly site: LocationNode;
  readonly weight: number;
  readonly reason: DirectorNudge['reason'];
}

export function seedPublicCampaignTravel(world:WorldState,actor:Cultivator):DirectorNudge|undefined {
  const tick=world.tick+1;
  if(!canDirectNpc(world,actor,tick)||world.storyteller?.focusActorId===actor.id)return;
  const staging=publicCampaignStaging(world,actor,tick);
  if(!staging||!directorKnownReachableSites(world,actor).includes(staging.site))return;
  return {kind:'travel_bias',actorId:actor.id,targetSiteId:staging.site.id,weight:43,reason:'sequel',
    expiresTick:staging.expiresTick};
}

/** A bounded invitation on actual known routes; never an order or a relocation. */
export function directorTravelPreference(world: WorldState, actor: Cultivator, tick = world.tick): DirectorTravelPreference | undefined {
  const live = liveDirectorNudges(world, tick);
  const rows = live.filter(row =>
    (row.kind === 'travel_bias' || row.kind === 'encounter_ticket') && row.actorId === actor.id);
  const omens=live.flatMap(row=>row.kind==='omen_bias'&&row.reason==='dungeon'&&row.expiresTick>tick?[row]:[]);
  if ((!rows.length&&!omens.length)||!canDirectNpc(world, actor, tick)) return undefined;
  if(world.fieldObservatories.byActor[actor.id]?.runs.some(row=>row.status==='pending'&&row.locationId===actor.locationId&&
      row.targetTick>=tick&&omens.some(omen=>omen.siteId===row.locationId)))return undefined;
  const known = new Map(directorKnownReachableSites(world, actor).map(site => [site.id, site]));
  const choices = rows.flatMap(row => {
    if (row.kind !== 'travel_bias' && row.kind !== 'encounter_ticket') return [];
    const site = known.get(row.targetSiteId);
    if (!site || !directorSiteIsSafe(world, site, tick) ||
      row.kind==='travel_bias'&&row.reason==='sequel'&&(world.storyteller?.focusActorId===actor.id||publicCampaignStaging(world,actor,tick)?.site!==site)) return [];
    // A waiting encounter is a stronger incentive, but travel remains an ordinary actor decision.
    return [{site, weight: row.kind === 'travel_bias' ? row.weight : 78, reason: row.reason}];
  });
  for(const omen of omens){
    const site=known.get(omen.siteId);
    if(!site||!directorSiteIsSafe(world,site,tick)||world.occasions.some(row=>row.kind==='expedition'&&
       (row.status==='registration'||row.status==='running')))continue;
    if(world.cultivators.some(person=>person.locationId===site.id&&person.spiritStones>=5&&canDirectNpc(world,person,tick)))continue;
    // A single traveler, preferably the actual current focus, considers visiting the future survey site.
    const candidates=world.cultivators.filter(person=>person.spiritStones>=5&&canDirectNpc(world,person,tick)&&
      !world.fieldObservatories.byActor[person.id]?.runs.some(row=>row.status==='pending')&&
      directorKnownReachableSites(world,person).includes(site))
      .sort((a,b)=>Number(b.id===world.storyteller?.focusActorId)-Number(a.id===world.storyteller?.focusActorId)||
        directorRoll(world,tick,[a.id,site.id,'survey-travel'])-directorRoll(world,tick,[b.id,site.id,'survey-travel'])||nameOrder(a.id,b.id));
    if(candidates[0]===actor)choices.push({site,weight:62,reason:'dungeon'});
  }
  return choices.sort((a, b) => b.weight - a.weight || nameOrder(a.site.id, b.site.id))[0];
}

export function utilityDirectorTravel(world: WorldState, actor: Cultivator): LLMDecisionPayload | undefined {
  const preference = directorTravelPreference(world, actor);
  if (!preference) return undefined;
  const { site, weight, reason } = preference;
  const threshold = Math.min(96, 18 + weight);
  if (directorRoll(world, world.tick, [actor.id, site.id, reason, 'travel']) >= threshold) return undefined;
  return {chosenAction: 'EXPLORE', targetLocationId: site.id,
    innerMonologue: '听说熟路那头有些动静，且亲自去看一眼。'};
}

/** Adjust willingness on a genuine offer, never grant consent or change an earlier refusal. */
export function directorNpcAcceptanceDelta(world: WorldState, npc: Cultivator, otherId: string, tick = world.tick): number {
  if (!canDirectNpc(world, npc, tick)) return 0;
  const other = world.cultivators.find(actor => actor.id === otherId);
  if (!other || !apprenticeshipPhysicallyAt(world, other, npc.locationId, tick)) return 0;
  return Math.max(-40, Math.min(40, liveDirectorNudges(world, tick).reduce((sum, row) =>
    row.kind === 'npc_accept_bias' && row.actorId === npc.id && row.towardActorId === otherId ? sum + row.delta : sum, 0)));
}
