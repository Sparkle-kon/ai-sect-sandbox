export const SECT_MOMENT_KINDS=['breakthrough','artifact','food','travel'] as const;
export type SectMomentKind=typeof SECT_MOMENT_KINDS[number];
export const SECT_MOMENT_VARIANTS=[0,1,2,3] as const;
export type SectMomentVariant=typeof SECT_MOMENT_VARIANTS[number];
export const SECT_MOMENTS_MONTH_LIMIT=12;
export const SECT_MOMENTS_MONTHLY_LIMIT=4;
export const SECT_MOMENTS_REACTION_LIMIT=4;
export const SECT_MOMENTS_COMMENT_LIMIT=3;
export const SECT_MOMENTS_COMMENT_LENGTH=80;
export const SECT_MOMENTS_BLOCK_LIMIT=24;

export interface SectMomentSource {
  readonly tick:number;
  readonly authorId:string;
  readonly kind:SectMomentKind;
  readonly sourceEventId:string;
  readonly siteId:string;
  readonly audience?:readonly string[];
}

export interface SectMomentReaction {
  readonly actorId:string;
  readonly liked:boolean;
  readonly commentVariant?:SectMomentVariant;
}

export interface SectMomentPost extends SectMomentSource {
  readonly id:string;
  readonly variant:SectMomentVariant;
  readonly reactions:readonly SectMomentReaction[];
  readonly playerLiked?:true;
  readonly playerComments?:readonly string[];
}

export interface SectMomentsState {
  readonly posts:readonly SectMomentPost[];
  readonly blockedAuthorIds?:readonly string[];
}

export type SectMomentCommand=
  | {readonly kind:'like';readonly postId:string}
  | {readonly kind:'comment';readonly postId:string;readonly text:string}
  | {readonly kind:'block';readonly authorId:string}
  | {readonly kind:'unblock';readonly authorId:string};

export const sectMomentPostId=(tick:number,index:number):string=>`sect-moment-${tick}-${index}`;

/** Plain short comments, with no hidden control characters or interactive markup. */
export function isSectMomentComment(value:unknown):value is string{
  if(typeof value!=='string'||!value.length||value.length>SECT_MOMENTS_COMMENT_LENGTH*2||
    value.trim()!==value||[...value].length>SECT_MOMENTS_COMMENT_LENGTH)return false;
  return !/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>]/u.test(value);
}
