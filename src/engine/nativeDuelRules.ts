import type {DaoIntentActivation} from '../types/daoPath';
import {daoIntentModifiers} from './daoPathTerms';
import type { NativeDuelRolls } from '../types/forbiddenArt';
import type { Cultivator, WorldState } from '../types/world';
import { destinyDuelDamageMultiplier, destinyDuelPower } from './destinyTraitEngine';
import { strikeMultiplier } from './elementalEngine';
import { petCombatBonus } from './spiritBeastEngine';
import { masteryMultiplier } from './techniqueEngine';

export interface NativeDuelModifier {
  ownerId: string;
  scoreMultiplier: number;
  incomingMultiplier: number;
}

export function measureNativeDuel(world: WorldState, attacker: Cultivator, defender: Cultivator,
  rolls: NativeDuelRolls, modifier?: NativeDuelModifier, dao:readonly Pick<DaoIntentActivation,'actorId'|'pathId'|'rank'>[] = []) {
  const [attackerRoll, defenderRoll, heavy, light] = rolls;
  const attackerArt = destinyDuelPower(attacker, defender);
  const defenderArt = destinyDuelPower(defender, attacker);
  const intent=(actor:Cultivator)=>{
    const ready=dao.find(row=>row.actorId===actor.id);
    return ready?daoIntentModifiers(ready):undefined;
  };
  const intentAttack=intent(attacker),intentDefense=intent(defender);
  const combatIntent=(actor:Cultivator)=>actor===attacker?intentAttack:intentDefense;
  const weight = (actor: Cultivator) => (modifier?.ownerId === actor.id ? modifier.scoreMultiplier : 1)*(combatIntent(actor)?.power??1);
  const score = (self: Cultivator, other: Cultivator, roll: number, destiny: number) =>
    self.combatPower * (0.85 + roll * 0.3) * strikeMultiplier(self, other) * masteryMultiplier(self) *
    petCombatBonus(world, self) * destiny * weight(self);
  const attackerScore = score(attacker, defender, attackerRoll, attackerArt.multiplier);
  const defenderScore = score(defender, attacker, defenderRoll, defenderArt.multiplier);
  const winner = attackerScore >= defenderScore ? attacker : defender;
  const loser = winner === attacker ? defender : attacker;
  const incoming = (recipient: Cultivator, opponent: Cultivator, base: number) => Math.round(
    base * destinyDuelDamageMultiplier(recipient, opponent) *
    (modifier?.ownerId === recipient.id ? modifier.incomingMultiplier : 1)*(combatIntent(recipient)?.incoming??1)
  );
  const hitLoser = incoming(loser, winner, Math.round(loser.maxHp * (0.35 + heavy * 0.35) * strikeMultiplier(winner, loser)));
  const hitWinner = incoming(winner, loser, Math.round(winner.maxHp * (0.1 + light * 0.15) * strikeMultiplier(loser, winner)));
  const divineArtProse = ([[attacker.name, attackerArt.arts], [defender.name, defenderArt.arts]] as const)
    .map(([name, arts]) => arts.length ? name + '使出' + arts.map(art => '「' + art + '」').join('、') : '')
    .filter(Boolean).join('；');
  return { winner, loser, hitLoser, hitWinner, divineArtProse };
}
