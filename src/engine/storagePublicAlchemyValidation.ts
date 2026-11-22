import type { PillId, WorldEvent, WorldState } from '../types/world';
import { ALCHEMY_RECIPES } from './alchemyCatalog';

type Fail=(path:string)=>never;
const path='cultivators.publicAlchemy';
const pillId=(value:string):value is PillId=>Object.hasOwn(ALCHEMY_RECIPES,value);
const sourceId=(tick:number,actorId:string)=>`evt-${tick}-${actorId}-alchemy`;

/** Per-site stamp has no independently retained complete lifetime series. Verify its
 * structural bounds, and independently corroborate date, scope and last grade when retained. */
export function validatePublicAlchemyPractice(world:WorldState,fail:Fail):void{
  const practitioners=world.cultivators.filter(row=>row.publicAlchemy!==undefined);
  if(!practitioners.length)return;
  const publicPlaces=new Set(world.locations.filter(site=>
    site.type!=='secret_realm'&&site.type!=='abyss'&&site.expeditionOmenId===undefined).map(site=>site.id));
  const current=new Map<string,WorldEvent[]>();
  for(const event of world.events){
    if(!event.id.endsWith('-alchemy'))continue;
    const rows=current.get(event.id);
    if(rows)rows.push(event);
    else current.set(event.id,[event]);
  }
  const privateIds=new Set(world.danxiaMedicine.commitments.map(row=>row.settlement?.artifactEventId));
  const furnace=new Map(world.furnaceReservations.uses.map(row=>[sourceId(row.tick,row.actorId),row]));
  const journals=new Map(world.resourceFlow.months.map(row=>[row.tick,row]));
  for(const actor of practitioners){
    const records=actor.publicAlchemy!;
    if(!records.length)return fail(path+'.records');
    const sites=new Set<string>(),endpoints=new Set<number>();
    let first=Infinity,last=0,total=0;
    for(const row of records){
      const {siteId,firstTick,lastTick,successes,bestGrade}=row;
      if(!publicPlaces.has(siteId)||sites.has(siteId))return fail(path+'.site');
      if(firstTick<1||lastTick<firstTick||lastTick>world.tick||successes>lastTick-firstTick+1||
        (firstTick===lastTick)!==(successes===1)||endpoints.has(firstTick)||endpoints.has(lastTick))
        return fail(path+'.chronology');
      sites.add(siteId);
      endpoints.add(firstTick);endpoints.add(lastTick);
      first=Math.min(first,firstTick);last=Math.max(last,lastTick);total+=successes;
      const key=sourceId(lastTick,actor.id);
      if(privateIds.has(key))return fail(path+'.source');
      const exact=current.get(key),use=furnace.get(key),journal=journals.get(lastTick);
      if(use&&(use.siteId!==siteId||use.kind!=='brew'))return fail(path+'.source');
      const entries=journal?.entries.filter(entry=>entry.kind==='production'&&entry.reason==='brew_output'&&
        entry.to.kind==='actor'&&entry.to.id===actor.id)??[];
      if(entries.length>1||entries.some(entry=>entry.mechanism!=='alchemy'||entry.refId!==siteId||
        entry.amount!==1||entry.tick!==lastTick||!pillId(entry.good)))return fail(path+'.source');
      // ResourceFlow's month can be absent or its 96 detailed rows can rotate.
      // Do not turn a missing source outside a complete book into a fabricated failure.
      if(journal&&journal.totalEntries===journal.entries.length&&entries.length!==1)return fail(path+'.source');
      let knownGrade:number|undefined;
      const journalPill=entries[0]?.good;
      if(journalPill&&pillId(journalPill))knownGrade=ALCHEMY_RECIPES[journalPill].furnaceGrade;
      if(exact){
        const source=exact[0];
        if(exact.length!==1||source.tick!==lastTick||source.locationId!==siteId||source.category!=='breakthrough'||
          source.witnessScope!==undefined||source.actorIds.length!==1||source.actorIds[0]!==actor.id||
          !source.title.endsWith('炼丹成丹')||!source.description.endsWith('凝成一枚灵丹。'))return fail(path+'.source');
        const recipes=Object.entries(ALCHEMY_RECIPES).filter(([,recipe])=>source.description.includes(`炼制【${recipe.name}】，凝成一枚灵丹。`));
        if(recipes.length!==1||journalPill!==undefined&&recipes[0][0]!==journalPill)return fail(path+'.source');
        knownGrade=recipes[0][1].furnaceGrade;
      }
      if(knownGrade!==undefined&&(knownGrade>bestGrade||successes===1&&bestGrade!==knownGrade))return fail(path+'.grade');
    }
    if(total>last-first+1)return fail(path+'.chronology');
  }
}
