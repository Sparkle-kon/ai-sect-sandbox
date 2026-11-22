import type {MapPoint} from '../types/world';
import {MAP_HEIGHT,MAP_WIDTH} from './mapCamera';

export const MAP_COMBAT_CAPTION_SLOTS=3;
const CAPTION_GAP_CSS=18;
const MARKER_CLEARANCE_CSS=18;
const RISE_CSS=8;
const EDGE_X_CSS=6;
// Vertical inset includes half of a 16px caption and a 4px stroke/safety gutter.
const EDGE_Y_CSS=12;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** Lay out centered, single-line captions on a projected logical map surface—not on world coordinates. */
export function mapCombatCaptionPosition(point:MapPoint,slot:number,progress:number,logicalPerCssPixel:number,
  labelWidthCss:number):MapPoint|undefined {
  if(!Number.isInteger(slot)||slot<0||slot>=MAP_COMBAT_CAPTION_SLOTS||
    !Number.isFinite(logicalPerCssPixel)||logicalPerCssPixel<=0||!Number.isFinite(labelWidthCss)||labelWidthCss<=0||
    !Number.isFinite(point.x)||point.x<0||point.x>MAP_WIDTH||!Number.isFinite(point.y)||point.y<0||point.y>MAP_HEIGHT)return undefined;
  const width=MAP_WIDTH/logicalPerCssPixel,height=MAP_HEIGHT/logicalPerCssPixel;
  const insetX=EDGE_X_CSS+labelWidthCss/2;
  const span=(MAP_COMBAT_CAPTION_SLOTS-1)*CAPTION_GAP_CSS;
  if(!Number.isFinite(width)||!Number.isFinite(height)||insetX*2>width||2*EDGE_Y_CSS+span>height)return undefined;
  const anchorY=point.y/logicalPerCssPixel;
  const t=clamp(Number.isNaN(progress)?0:progress,0,1);
  // Pick a side for the entire rise, so stacked figures don't swap sides midway near the top edge.
  const above=anchorY-EDGE_Y_CSS>=MARKER_CLEARANCE_CSS+RISE_CSS+span;
  const first=above
    ?clamp(anchorY-MARKER_CLEARANCE_CSS-t*RISE_CSS,EDGE_Y_CSS+span,height-EDGE_Y_CSS)
    :clamp(anchorY+MARKER_CLEARANCE_CSS+(1-t)*RISE_CSS,EDGE_Y_CSS,height-EDGE_Y_CSS-span);
  return {
    x:clamp(point.x/logicalPerCssPixel,insetX,width-insetX)*logicalPerCssPixel,
    y:(first+slot*CAPTION_GAP_CSS*(above?-1:1))*logicalPerCssPixel,
  };
}
