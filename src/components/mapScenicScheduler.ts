import {shouldAnimateMap} from './mapKeyboard';

const measurable=(extent:number)=>Number.isFinite(extent)&&extent>0;

export function mapScenicAnimationAllowed({
  reducedMotion,pageVisible,surfaceActive,width,height,
}:{
  reducedMotion?:boolean;
  pageVisible:boolean;
  surfaceActive:boolean;
  width:number;
  height:number;
}):boolean {
  return surfaceActive&&measurable(width)&&measurable(height)&&shouldAnimateMap(reducedMotion,pageVisible);
}

/** Single-loop render cadence: native effects keep priority over decorative motion. Infinity requests no further frame. */
export function mapScenicFrameDelay({
  moving,heat,ambient,width,
}:{moving:boolean;heat:boolean;ambient:boolean;width:number}):number {
  if(!measurable(width))return Infinity;
  if(moving)return 33;
  if(heat)return 80;
  if(ambient)return width<640?125:84;
  return Infinity;
}
