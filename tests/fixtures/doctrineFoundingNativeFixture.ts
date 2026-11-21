import {createInitialWorld} from '../../src/data/initialWorld';
import {availableDoctrineActions} from '../../src/engine/doctrineEngine';
import {applyMapBrush} from '../../src/engine/mapBrushEngine';
import {recordMemory} from '../../src/engine/memoryEngine';
import {availableRelocationActions} from '../../src/engine/relocationEngine';
import {terrainTileAt} from '../../src/engine/terrainEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export const foundingFixture={seed:51,parentId:'sect-qingyun',oldSiteId:'loc-taixu',newSiteId:'loc-vein-north',
  leaderId:'npc-1',authorId:'elder-taixu-1',members:['elder-taixu-1','elder-taixu-2','npc-2'],
  volunteerId:'village-loc-market-vol-1',villageId:'village-loc-market',lenderSectId:'sect-danxia'} as const;
export const foundActor=(w:WorldState,id:string)=>w.cultivators.find(actor=>actor.id===id)!;
export const foundSite=(w:WorldState,id:string)=>w.locations.find(site=>site.id===id)!;
export const foundSect=(w:WorldState,id:string)=>w.sects.find(sect=>sect.id===id)!;
export const foundPayload=(chosenAction:LLMDecisionPayload['chosenAction'],payload:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按实际族籍、原稿与原产继续。',...payload});
export function foundTurn(world:WorldState,choices:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,choices[actor.id]??foundPayload('REST')])),()=>.99);
}
function assert(condition:unknown,note:string):asserts condition{if(!condition)throw Error(note);}
function move(targetLocationId:string){return foundPayload('EXPLORE',{targetLocationId});}
const doctrine=(doctrineMove:NonNullable<LLMDecisionPayload['doctrineMove']>,targetDoctrineSchoolId?:string,targetDoctrineProposalId?:string)=>
  foundPayload('DOCTRINE',{doctrineMove,...(targetDoctrineSchoolId?{targetDoctrineSchoolId}:{}),...(targetDoctrineProposalId?{targetDoctrineProposalId}:{})});
const relocate=(relocationMove:NonNullable<LLMDecisionPayload['relocationMove']>,targetLocationId?:string,targetRelocationId?:string)=>
  foundPayload('RELOCATE',{relocationMove,...(targetLocationId?{targetLocationId}:{}),...(targetRelocationId?{targetRelocationId}:{})});

/** Controlled old headquarters pressure, literate elder and seed support beliefs are authored starting
 * inputs. All registrations, manuscript, independent joining, physical relocation and population
 * changes run through the real game steps, not inserted result shapes. */
export function preparedDoctrineFounding(){
  const f=foundingFixture;
  let w=createInitialWorld(f.seed,'classic');
  const p=foundSect(w,f.parentId), oldSite=foundSite(w,f.oldSiteId), nextSite=foundSite(w,f.newSiteId);
  const destinationTile=terrainTileAt(w,nextSite.x,nextSite.y)!;
  delete destinationTile.ownerSectId;
  delete nextSite.ownerSectId;
  const leader=foundActor(w,f.leaderId);
  leader.exploredTileIds.push(destinationTile.id);
  for(const actor of w.cultivators.filter(actor=>actor.sectId===p.id))actor.locationId=oldSite.id;
  const author=foundActor(w,f.authorId);
  author.realm='元婴';author.techniqueMastery=85;author.qiProgress=0;
  // Vault and title remain their native balances; weakness is a controlled source condition.
  p.facilities.defense_array=2;p.arrayMaxHp=400;p.arrayHp=0;
  oldSite.herbs.earth_root=Math.max(2,oldSite.herbs.earth_root);
  w=foundTurn(w,{[f.leaderId]:move('loc-market'),[f.authorId]:foundPayload('AUTHOR_TECHNIQUE')});
  const original=w.scriptures.originals.find(row=>row.technique.authorId===f.authorId);
  assert(original?.source==='authored'&&original.sourceSectId===p.id,'exact authored immutable manuscript');
  w=foundTurn(w,{[f.leaderId]:foundPayload('RECRUIT_SETTLER',{targetSettlementId:f.villageId,targetVolunteerId:f.volunteerId})});
  const stayedId=`recruit-${f.volunteerId}`;
  assert(foundActor(w,stayedId)?.sectId===p.id,'real recruited parent member, not a founding participant');
  w=foundTurn(w,{[f.leaderId]:move(oldSite.id),[stayedId]:move(oldSite.id)});
  for(const id of [...f.members,f.leaderId]){
    const actor=foundActor(w,id);
    recordMemory(actor,w.tick,'曾共同佐理实地旧山门。',9,'social',4);
    const sources=actor.memories.filter(row=>row.tick===w.tick&&row.category==='social').map(row=>row.id);
    actor.reflections=[{id:`founding-fixture-belief-${id}`,tick:w.tick,theme:'community',kind:'belief',
      intensity:9,statement:'按手中确存的依据相议。',sourceMemoryIds:sources,source:'utility'}];
  }
  w=foundTurn(w,Object.fromEntries([...f.members,f.leaderId].map(id=>[id,foundPayload('DOCTRINE',
    {doctrineMove:'endorse',doctrineTheme:'community'})])));
  const school=w.doctrines.schools.find(row=>row.parentSectId===f.parentId&&row.theme==='community')!;
  assert(school,'native endorsed school');
  const separation=availableDoctrineActions(foundActor(w,f.leaderId),w).find(row=>row.doctrineMove==='propose_separation'&&
    row.targetDoctrineSchoolId===school.id);
  assert(separation,'authentic accepted separation option');
  w=foundTurn(w,{[f.leaderId]:doctrine('propose_separation',school.id)});
  const proposed=w.doctrines.proposals[0];
  assert(proposed.stewardId===f.authorId,'authentic manuscript author is native chosen steward');
  w=foundTurn(w,{[f.authorId]:doctrine('accept',undefined,proposed.id)});
  assert(w.doctrines.schools[0].status==='autonomous'&&w.doctrines.schools[0].treasury>0,'funded native school autonomy');
  w=foundTurn(w,Object.fromEntries(f.members.filter(id=>id!==f.authorId).map(id=>[id,doctrine('join',school.id)])));
  assert(f.members.every(id=>w.doctrines.schools[0].memberIds.includes(id)),'each native school person joined independently');
  w=applyMapBrush(applyMapBrush(w,'cursed_miasma',[{x:oldSite.x,y:oldSite.y}]),'cursed_miasma',[{x:oldSite.x,y:oldSite.y}]);
  w=foundTurn(w,{[f.leaderId]:relocate('propose',nextSite.id)});
  const relocation=w.relocations.plans[0];
  assert(relocation?.originId===oldSite.id&&relocation.destinationId===nextSite.id,'exact native relocation plan');
  for(const id of relocation.voterIds.filter(id=>id!==f.leaderId)){
    assert(availableRelocationActions(foundActor(w,id),w).some(row=>row.relocationMove==='approve'),'eligible real native voter');
  }
  w=foundTurn(w,Object.fromEntries(relocation.voterIds.filter(id=>id!==f.leaderId).map(id=>[id,relocate('approve',undefined,relocation.id)])));
  for(let i=0;i<10&&w.relocations.plans[0].status!=='settled';i++)w=foundTurn(w);
  const settled=w.relocations.plans[0];
  assert(settled.status==='settled'&&w.relocations.abandonedSites[0].planId===settled.id&&
    foundSect(w,p.id).headquartersId===nextSite.id&&!foundSite(w,oldSite.id).ownerSectId,'paid moved original parent HQ with neutral old title');
  assert(foundSect(w,p.id).pavilion.some(row=>row.id===original.id),'canonical prior controlled parent teaching copy moved with native convoy');
  w=foundTurn(w,Object.fromEntries(f.members.map(id=>[id,move(oldSite.id)])));
  assert(f.members.every(id=>foundActor(w,id).locationId===oldSite.id)&&foundActor(w,f.leaderId).locationId===nextSite.id,
    'all future volunteers locally at vacant site, authentic parent head remains at its own new HQ');
  return {world:w,schoolId:school.id,relocationId:settled.id,originalId:original.id,stayedId};
}
