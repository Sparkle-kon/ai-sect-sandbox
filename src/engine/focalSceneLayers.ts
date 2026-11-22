import { chapterFocalScore } from './chapterFocalScene';
import { writeFocalDuelLayers } from './focalDuelLayers';
import { writeFocalSiegeLayers } from './focalSiegeLayers';
import { writeFocalTribulationLayers } from './focalTribulationLayers';
import type { FocalLayer, FocalLayerContext } from './focalLayerEvidence';

const writers=[writeFocalDuelLayers,writeFocalSiegeLayers,writeFocalTribulationLayers] as const;
const order={approach:0,exchange:1,aftermath:2} satisfies Record<FocalLayer['role'],number>;

/** Editorial presentation only. A structurally valid archive without its live corroboration keeps the old short scene. */
export function projectFocalLayers(context:FocalLayerContext):readonly FocalLayer[] {
  const {focal,throughTick,publicOriginal}=context;
  if(!chapterFocalScore(focal)||focal.tick>throughTick||!publicOriginal(focal.id))return [];
  for(const write of writers){
    const layers=write(context);
    if(!layers.length)continue;
    let last=-1;
    const valid=layers.length<=3&&layers.some(layer=>layer.eventIds.includes(focal.id))&&layers.every(layer=>{
      const rank=order[layer.role];
      if(rank<=last||!layer.text.trim()||Array.from(layer.text).length>160||
        /[\n\r「」『』“”]/u.test(layer.text)||!layer.eventIds.length||layer.eventIds.length>12||
        new Set(layer.eventIds).size!==layer.eventIds.length)return false;
      last=rank;
      return layer.eventIds.every(id=>{
        const source=publicOriginal(id);
        return source!==undefined&&source.tick<=focal.tick;
      });
    });
    if(valid)return layers;
  }
  return [];
}
