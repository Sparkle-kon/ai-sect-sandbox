import type {Cultivator,WorldEvent} from '../types/world';

/** The legacy (undefined) plane is always lower; an absent lower-address lookup is not authority. */
export const onLowerPlane=(actor:Pick<Cultivator,'positionPlane'>):boolean=>actor.positionPlane===undefined;
export const onUpperPassagePlane=(actor:Pick<Cultivator,'positionPlane'>):boolean=>
  actor.positionPlane==='threshold'||actor.positionPlane==='upper';
export const isUpperPassageEvent=(event:Pick<WorldEvent,'id'>):boolean=>event.id.startsWith('evt-upper-passage-');
