import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableArtifactActions, equippedArtifact } from '../src/engine/artifactEngine';
import { possessAvatar } from '../src/engine/avatarEngine';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

export const artOwnerId='elder-danxia-1', strongRivalId='npc-5', furnaceSiteId='loc-danxia';
const weaker='npc-6';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静养等候。'};
export const artActor=(world:WorldState,id=artOwnerId)=>world.cultivators.find(row=>row.id===id)!;
export function artTurn(world:WorldState,choices:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??rest])),
    ()=>.10,'utility');
}
export const artDuel=(id:string):LLMDecisionPayload=>({chosenAction:'DUEL',targetCultivatorId:id,innerMonologue:'与真正眼前的修士交剑。'});

export function actualAwakenedArtifact(rivalCombatPower?:number){
  let world=createInitialWorld(1,'spirit-bloom');
  // Optional controlled starting matchup only; temporal causality, item history and bodies stay native.
  if(rivalCombatPower!==undefined)artActor(world,strongRivalId).combatPower=rivalCombatPower;
  // Exact untouched starter body, home grade-3 furnace and public known route.
  world=artTurn(world,{[weaker]:{chosenAction:'EXPLORE',targetLocationId:furnaceSiteId,innerMonologue:'赴丹霞谷。'}});
  expect(artActor(world,weaker).locationId).toBe(furnaceSiteId);
  for(let turn=0;turn<10&&artActor(world).techniqueMastery<45;turn++){
    world=artTurn(world,{[artOwnerId]:{chosenAction:'CULTIVATE',innerMonologue:'练熟控火和一息真炁。'}});
  }
  const ready=artActor(world);
  expect(ready.techniqueMastery).toBeGreaterThanOrEqual(45);
  expect(availableArtifactActions(ready,world,world.tick+1)).toContainEqual({action:'FORGE_ARTIFACT',forgeTier:'法宝'});
  world=artTurn(world,{[artOwnerId]:{chosenAction:'FORGE_ARTIFACT',forgeTier:'法宝',innerMonologue:'开原炉铸法宝。'}});
  const forged=artActor(world).artifacts.find(row=>row.tier==='法宝')!;
  expect(forged).toMatchObject({id:`artifact-${artOwnerId}-${world.tick}-1`,resonance:0});
  const itemId=forged.id!;
  const forgedTick=world.tick;
  world=artTurn(world,{[artOwnerId]:{chosenAction:'BIND_ARTIFACT',targetArtifactId:itemId,innerMonologue:'本件滴血认主。'}});
  expect(equippedArtifact(artActor(world))).toMatchObject({id:itemId,boundTo:artOwnerId,resonance:0});
  for(let bouts=0;bouts<3;bouts++){
    world=artTurn(world,{[artOwnerId]:artDuel(weaker)});
    const duel=world.events.find(row=>row.tick===world.tick&&row.duelWinnerId===artOwnerId&&row.actorIds.includes(weaker));
    expect(duel).toBeDefined();
    expect(artActor(world,weaker).alive).toBe(true);
    expect(equippedArtifact(artActor(world))?.resonance).toBe((bouts+1)*18);
    world=artTurn(artTurn(world));
  }
  expect(availableArtifactActions(artActor(world),world,world.tick+1)).toContainEqual({action:'AWAKEN_ARTIFACT',targetArtifactId:itemId});
  const stones=artActor(world).spiritStones;
  world=artTurn(world,{[artOwnerId]:{chosenAction:'AWAKEN_ARTIFACT',targetArtifactId:itemId,innerMonologue:'唤醒此件亲用器灵。'}});
  const item=equippedArtifact(artActor(world))!;
  expect(item).toMatchObject({id:itemId,boundTo:artOwnerId,resonance:9,soul:{experience:0}});
  expect(stones-artActor(world).spiritStones).toBe(85);
  expect(world.furnaceReservations.uses).toContainEqual(expect.objectContaining({kind:'awaken',actorId:artOwnerId,tick:world.tick,siteId:furnaceSiteId}));
  return {world,itemId,forgedTick};
}

export function actualThreatenedDuel(guided=true,rivalCombatPower?:number){
  const {world,itemId,forgedTick}=actualAwakenedArtifact(rivalCombatPower);
  const before=artActor(world);
  const first=executeGodIntervention(world,{type:'TRIBULATION_STRIKE',targetCultivatorId:before.id});
  const wounded=executeGodIntervention(first,{type:'TRIBULATION_STRIKE',targetCultivatorId:before.id});
  const owner=artActor(wounded),opponent=artActor(wounded,strongRivalId);
  expect(owner.hp).toBeGreaterThan(0);
  expect(owner.hp/owner.maxHp).toBeLessThan(.25);
  expect(opponent.maxHp).toBeGreaterThan(owner.maxHp);
  expect(owner.locationId).toBe(opponent.locationId);
  if(guided)expect(possessAvatar(wounded,owner.id)).toBe(true);
  return {wounded,itemId,forgedTick};
}

export function actualForbiddenContact(guided=true,rivalCombatPower?:number){
  const {wounded,itemId}=actualThreatenedDuel(guided,rivalCombatPower);
  const offered=artTurn(wounded,{[strongRivalId]:artDuel(artOwnerId)});
  const contact=offered.forbiddenDuels?.[0]!;
  expect(contact).toMatchObject({ownerId:artOwnerId,attackerId:strongRivalId,defenderId:artOwnerId,artifactId:itemId,
    openedTick:offered.tick,guided});
  expect(offered.forbiddenDuels).toHaveLength(1);
  return {wounded,offered,contact,itemId};
}
