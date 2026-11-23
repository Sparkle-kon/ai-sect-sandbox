import {SECT_PLAYER_CHAT_IDENTITY_LABELS,type SectPlayerChatAlias} from '../types/sectPlayerChat';

/** A retained social memory identifies this particular exposure, not a guess at a new speaker. */
export function sectAliasExposureMemoryText(alias:SectPlayerChatAlias):string{
  return `曾在九州传音里认出「${SECT_PLAYER_CHAT_IDENTITY_LABELS[alias]}」的旧笔迹。`;
}

const RIVAL_REPLIES=[
  '上回「{alias}」写得一手好字，我如今见了落款，倒先认字。',
  '「{alias}」今日可来喝茶？茶只斟一盏，落款倒由道友挑。',
  '请代问「{alias}」近来可好。我还留着那张短笺，省得下回认错。',
] as const;

export function sectAliasRivalReply(alias:SectPlayerChatAlias,tick:number):string{
  return RIVAL_REPLIES[tick%RIVAL_REPLIES.length].replace('{alias}',SECT_PLAYER_CHAT_IDENTITY_LABELS[alias]);
}
