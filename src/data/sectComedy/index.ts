import type {SectComedyTemplate} from '../../types/sectComedy';
import {AMBIENT_SECT_COMEDY} from './ambient';
import {FIELD_SECT_COMEDY} from './field';
import {FESTIVAL_SECT_COMEDY} from './festival';
import {WORK_SECT_COMEDY} from './work';

export const SECT_COMEDY_TEMPLATES:readonly SectComedyTemplate[]=Object.freeze([
  ...WORK_SECT_COMEDY,...FIELD_SECT_COMEDY,...AMBIENT_SECT_COMEDY,...FESTIVAL_SECT_COMEDY,
]);
const knownTemplates:ReadonlyMap<string,SectComedyTemplate>=new Map(SECT_COMEDY_TEMPLATES.map(row=>[row.id,row]));
export function findSectComedyTemplate(id:string):SectComedyTemplate|undefined {
  return knownTemplates.get(id);
}
