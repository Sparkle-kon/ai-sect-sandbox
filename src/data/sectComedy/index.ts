import type {SectComedyTemplate} from '../../types/sectComedy';
import {AMBIENT_SECT_COMEDY} from './ambient';
import {FIELD_SECT_COMEDY} from './field';
import {FESTIVAL_SECT_COMEDY} from './festival';
import {WORK_SECT_COMEDY} from './work';
import {AMBIENT_SCENES} from './scenes/ambient';
import {FIELD_SCENES} from './scenes/field';
import {FESTIVAL_SCENES} from './scenes/festival';
import {WORK_SCENES} from './scenes/work';
import {COMEDY_FOLLOW_UPS} from './scenes/continuations';
import {QUIET_SCENES} from './scenes/quiet';
import {ODDBALL_SCENES} from './scenes/oddballs';
import type {SceneRewrite} from './scenes/types';

// These IDs belong to already-settled H5 saves. Keep their original prose and receipt contracts.
const legacy:readonly SectComedyTemplate[]=[
  ...WORK_SECT_COMEDY,...FIELD_SECT_COMEDY,...AMBIENT_SECT_COMEDY,...FESTIVAL_SECT_COMEDY,
];
const rewrites:Readonly<Record<string,SceneRewrite>>={...WORK_SCENES,...FIELD_SCENES,...AMBIENT_SCENES,...FESTIVAL_SCENES};
const revised=legacy.map((original):SectComedyTemplate=>{
  const [report,quote,effects,fieldTier]=rewrites[original.id];
  const match=fieldTier&&original.match.phase!=='ambient'
    ?{...original.match,phase:'performed' as const,tier:fieldTier}:original.match;
  return {...original,id:`h6-${original.id}`,match,report,quote,effects};
});
const baseline=[...revised,...ODDBALL_SCENES,...QUIET_SCENES];
export const SECT_COMEDY_TEMPLATES:readonly SectComedyTemplate[]=Object.freeze(baseline.map(scene=>{
  const after=COMEDY_FOLLOW_UPS[scene.id];
  return after?{...scene,id:`${scene.id}-follow-up`,effects:[...scene.effects,after]}:scene;
}));
const knownTemplates:ReadonlyMap<string,SectComedyTemplate>=new Map([...legacy,...baseline,...SECT_COMEDY_TEMPLATES].map(row=>[row.id,row]));
export function findSectComedyTemplate(id:string):SectComedyTemplate|undefined {
  return knownTemplates.get(id);
}
