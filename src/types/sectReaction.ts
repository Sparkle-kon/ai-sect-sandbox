export const SECT_REACTION_KINDS=['sweat','black_line','smoke','sparkle','soul','hurt'] as const;
export type SectReactionKind=typeof SECT_REACTION_KINDS[number];

/** A dated projection for presentation only; no fields are written into a world or a save. */
export interface SectReactionCue {
  readonly id:string;
  readonly tick:number;
  readonly actorId:string;
  readonly kind:SectReactionKind;
  readonly cause:'report'|'furnace';
  readonly siteId?:string;
  readonly shake?:'kitchen';
}
