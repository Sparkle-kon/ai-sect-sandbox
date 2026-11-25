import type {SectComedyEffect,SectComicJobTier} from '../../../types/sectComedy';

export type SceneRewrite=readonly [report:string,quote:string,effects:readonly SectComedyEffect[],newFieldTier?:SectComicJobTier];
