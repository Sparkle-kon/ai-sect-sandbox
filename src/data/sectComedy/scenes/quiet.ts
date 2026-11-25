import type {SectComedyTemplate} from '../../../types/sectComedy';

/** A traveling cast can be between stops, with no location where a new transaction can settle. */
export const QUIET_SCENES=[
  {id:'h6-quiet-road-bell',match:{phase:'ambient',presence:'away'},
    report:'{name}托同门稍等，留了一句话。',quote:'诸位听见钟响先吃饭，弟子手里的饼还没翻面。',effects:[]},
  {id:'h6-quiet-road-dust',match:{phase:'ambient',presence:'away'},
    report:'{name}提起该给弟子做厚一些的鞋。',quote:'等我真会御剑了，第一件事便是回门里看谁还欠我鞋钱。',effects:[]},
] as const satisfies readonly SectComedyTemplate[];
