import type { CultivationRealm } from './world';

export const DESTINY_TRAIT_IDS = [
  'clear-sword-heart',
  'unfading-blood-sea',
  'heaven-favored',
  'supreme-patience',
  'alchemy-poison-transmutation',
  'star-reforged-bones',
  'still-heart-mirror',
  'primordial-breath',
  'benevolent-worldtree',
  'night-wandering-soul',
] as const;

export type DestinyTraitId = typeof DESTINY_TRAIT_IDS[number];
export type DestinyTraitOptions = [DestinyTraitId, DestinyTraitId, DestinyTraitId];

export interface DestinyTraitOffer {
  id: string;
  actorId: string;
  fromRealm: CultivationRealm;
  realm: CultivationRealm;
  openedTick: number;
  sourceEventId: string;
  options: DestinyTraitOptions;
}

export interface DestinyTraitAwakening extends DestinyTraitOffer {
  traitId: DestinyTraitId;
  chosenTick: number;
}

export interface DestinyTraitProgress {
  earned: DestinyTraitAwakening[];
  pending?: DestinyTraitOffer;
}
