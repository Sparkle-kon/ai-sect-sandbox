import {SECT_QUIRK_IDS,SECT_QUIRK_NAMES,type SectQuirkId} from '../types/sectManagement';

const knownIds:ReadonlySet<unknown>=new Set(SECT_QUIRK_IDS);

/** Public labels come only from the fixed catalog, never from arbitrary save text. */
export function sectQuirkLabels(values:unknown):readonly string[] {
  if(!Array.isArray(values))return [];
  const labels=new Set<string>();
  for(const id of values){
    if(knownIds.has(id))labels.add(SECT_QUIRK_NAMES[id as SectQuirkId]);
    if(labels.size===2)break;
  }
  return [...labels];
}
