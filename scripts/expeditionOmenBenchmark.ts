import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {encodeEraWorldSave,decodeEraWorldSave} from '../src/engine/storageEngine';
import {campaignSHA256} from '../src/engine/campaignMemento';
import type {ExpeditionOmen,WorldOccasion} from '../src/types/world';
declare const __SECT_UTILITY_RULE_VERSION__:string;
const cases=[{seed:2031,profile:'classic'},{seed:2032,profile:'classic'},{seed:50421,profile:'fractured-frontier'}] as const;
for(const {seed,profile} of cases){
 const omens=new Map<string,ExpeditionOmen>(),visits=new Map<string,WorldOccasion>();
 const sampled=new Set<string>();
 let world=createInitialWorld(seed,profile);
 for(let i=0;i<72;i++){
   world=advanceWorldTick(world,undefined,undefined,'utility');
   for(const r of world.expeditionOmens.rows)omens.set(r.id,r);
   for(const r of world.occasions)visits.set(r.id,r);
   for(const [id,bucket] of Object.entries(world.fieldObservatories.byActor))for(const row of bucket.runs)
     if(row.status==='measured')sampled.add(id+':'+row.openedTick);
   if(world.tick===37){
     const raw=encodeEraWorldSave(world);
     if(encodeEraWorldSave(decodeEraWorldSave(raw))!==raw)throw Error('midpoint restore mismatch');
   }
 }
 const raw=encodeEraWorldSave(world);
 if(encodeEraWorldSave(decodeEraWorldSave(raw))!==raw)throw Error('final restore mismatch');
 console.log(JSON.stringify({seed,profile,rule:__SECT_UTILITY_RULE_VERSION__,months:72,final:[world.tick,world.year,world.month],measured:sampled.size,omens:[...omens.values()],cases:[...visits.values()].map(r=>({id:r.id,startedTick:r.startedTick,kind:r.kind,status:r.status,enrolled:r.participantIds.length})),sha:await campaignSHA256(new TextEncoder().encode(raw))}));
}
