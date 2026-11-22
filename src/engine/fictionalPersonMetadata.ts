import type {FictionalGender} from '../types/world';

/**
 * A creation-only, display-only selection for generated fictional people.
 * Existing people are never backfilled, and no simulation draw or name is read.
 */
export function fictionalGenderFor(seed:number,id:string):FictionalGender{
  let hash=(seed>>>0)^0x811c9dc5;
  const key='fictional-gender/v1:'+id;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),0x01000193);
  hash=Math.imul(hash^(hash>>>16),0x85ebca6b);
  hash=Math.imul(hash^(hash>>>13),0xc2b2ae35);
  return ((hash^(hash>>>16))>>>0)<0x8000_0000?'woman':'man';
}
