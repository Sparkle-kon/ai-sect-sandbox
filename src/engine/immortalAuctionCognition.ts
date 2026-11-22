import type { LLMDecisionPayload } from '../types/world';
import type { ImmortalAuctionOption } from './immortalAuctionEngine';

export const AUCTION_PRIVATE_COMMAND_KEYS = [
  'auctionMove', 'targetAuctionLotId', 'targetAuctionArtifactId', 'targetAuctionPillId', 'auctionBidStones', 'auctionQuoteBidCount', 'targetAuctionAmbushLotId',
] as const;

type MechanicalCommand = Partial<Omit<LLMDecisionPayload, 'innerMonologue'>>;
const shapeKeys = (command: MechanicalCommand) => Object.keys(command) as Array<keyof MechanicalCommand>;

function matches(input: unknown, command: MechanicalCommand, allowInternalThought: boolean): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const keys = shapeKeys(command);
  const record = input as MechanicalCommand;
  return keys.every(key => Object.hasOwn(record, key) && record[key] === command[key]) &&
    Object.keys(record).every(key => Object.hasOwn(command, key) || (allowInternalThought && key === 'innerMonologue'));
}

export function immortalAuctionCommand(option: ImmortalAuctionOption) {
  const chosenAction = 'IMMORTAL_AUCTION' as const, auctionMove = option.auctionMove;
  if (option.auctionMove === 'consign_artifact') return { chosenAction, auctionMove, targetAuctionArtifactId: option.targetAuctionArtifactId };
  if (option.auctionMove === 'consign_pill') return { chosenAction, auctionMove, targetAuctionPillId: option.targetAuctionPillId };
  if (option.auctionMove === 'bid') return { chosenAction, auctionMove, targetAuctionLotId: option.targetAuctionLotId,
    auctionBidStones: option.auctionBidStones, auctionQuoteBidCount: option.auctionQuoteBidCount };
  return { chosenAction, auctionMove, targetAuctionLotId: option.targetAuctionLotId };
}

export function exactImmortalAuctionDecision(input: unknown, options: readonly ImmortalAuctionOption[],
  allowInternalThought = false): LLMDecisionPayload | undefined {
  for (const option of options) {
    const command = immortalAuctionCommand(option);
    if (matches(input, command, allowInternalThought)) return {
      ...command, innerMonologue: {
        consign_artifact: '只托付自己带来的这一件实物。',
        consign_pill: '只托付自己这一枚实丹。',
        bid: '按此刻实见的价和确有的灵石出价，不预报成交。',
        withdraw: '仅按台上实况撤回原物。',
      }[option.auctionMove],
    };
  }
  return undefined;
}

type AuctionAmbushOffer = { targetCultivatorId: string; lotId: string };
export function auctionAmbushCommand(offer: AuctionAmbushOffer) {
  return { chosenAction: 'DUEL' as const, targetCultivatorId: offer.targetCultivatorId, targetAuctionAmbushLotId: offer.lotId };
}

export function exactAuctionAmbushDecision(input: unknown, offer: AuctionAmbushOffer | undefined,
  allowInternalThought = false): LLMDecisionPayload | undefined {
  if (!offer) return undefined;
  const command = auctionAmbushCommand(offer);
  return matches(input, command, allowInternalThought)
    ? { ...command, innerMonologue: '眼前所遇正是亲眼见过交易的人，若交手，也只照真实情势行事。' }
    : undefined;
}
