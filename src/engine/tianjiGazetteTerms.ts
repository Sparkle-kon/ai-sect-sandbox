import type {ChronicleAnchor,LocationNode,WorldEvent} from '../types/world';
import type {TianjiGazetteSource} from '../types/tianjiGazette';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
export const TIANJI_GAZETTE_HISTORY=24;
export const TIANJI_GAZETTE_WINDOW=12;
export const TIANJI_GAZETTE_KINDS=['headline','dark_horse','rivalry','bounty'] as const;
export const tianjiGazetteIssueId=(tick:number)=>`gazette-${tick}`;
export const tianjiGazetteVenue=(site:LocationNode|undefined):site is LocationNode=>
  !!site&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site);
export function tianjiGazetteMatchesSource(proof:TianjiGazetteSource,event:WorldEvent|ChronicleAnchor):boolean{
  return proof.sourceEventId===event.id&&proof.tick===event.tick&&proof.year===event.year&&proof.month===event.month&&
    proof.siteId===event.locationId&&(!('witnessScope' in event)||event.witnessScope===undefined);
}
/** The original Blood Moon headquarters is publicly depicted terrain despite its abyss biome.
 * Only a proved native major battle, never an ordinary abyss event, may use this exception. */
export const tianjiGazetteBattleVenue=(site:LocationNode|undefined):site is LocationNode=>
  !!site&&(site.id==='loc-blood'&&site.type==='abyss'&&!isScopedExpeditionGate(site)||tianjiGazetteVenue(site));
