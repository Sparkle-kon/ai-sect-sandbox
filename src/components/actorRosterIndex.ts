import type {Cultivator,WorldState} from '../types/world';

export type RosterStatus='all'|'living'|'fallen';
export const ACTOR_PAGE_SIZE=8;
const normalize=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();

export interface ActorRosterIndex {
  readonly byId:ReadonlyMap<string,Cultivator>;
  readonly actors:Readonly<Record<RosterStatus,readonly Cultivator[]>>;
  readonly searchText:ReadonlyMap<Cultivator,string>;
  readonly sameName:ReadonlyMap<Cultivator,string>;
}
type Memo={tick:number;actors:WorldState['cultivators'];sects:WorldState['sects'];size:number;index:ActorRosterIndex};
const indices=new WeakMap<WorldState,Memo>();

/** A physical App snapshot is immutable. No speculative row, cross-branch name cache, or roster size limit. */
export function createActorRosterIndex(world:WorldState):ActorRosterIndex{
  const current=indices.get(world);
  if(current&&current.actors===world.cultivators&&current.sects===world.sects&&current.tick===world.tick&&
    current.size===world.cultivators.length)return current.index;
  const sects=new Map(world.sects.map(({id,name})=>[id,name]));
  const living:Cultivator[]=[],fallen:Cultivator[]=[];
  const byId=new Map<string,Cultivator>(),duplicates=new Set<string>();
  const byName=new Map<string,Cultivator[]>(),searchText=new Map<Cultivator,string>(),sameName=new Map<Cultivator,string>();
  for(const actor of world.cultivators){
    (actor.alive?living:fallen).push(actor);
    if(byId.has(actor.id)){
      byId.delete(actor.id);
      duplicates.add(actor.id);
    }else if(!duplicates.has(actor.id))byId.set(actor.id,actor);
    const title=sects.get(actor.sectId)??'散修',name=normalize(actor.name);
    searchText.set(actor,normalize(actor.name+' '+actor.title+' '+title+' '+actor.realm));
    const group=byName.get(name);
    if(group)group.push(actor);
    else byName.set(name,[actor]);
  }
  for(const group of byName.values()){
    if(group.length<2)continue;
    group.forEach((actor,n)=>sameName.set(actor,[sects.get(actor.sectId)??'散修',actor.age+' 岁','同名 '+(n+1)].join(' · ')));
  }
  const index={byId,actors:{all:[...world.cultivators],living,fallen},searchText,sameName};
  indices.set(world,{tick:world.tick,actors:world.cultivators,sects:world.sects,size:world.cultivators.length,index});
  return index;
}
export function selectActorRoster(index:ActorRosterIndex,search:string,status:RosterStatus):readonly Cultivator[]{
  const candidates=index.actors[status],needle=normalize(search);
  return needle?candidates.filter(actor=>index.searchText.get(actor)?.includes(needle)):candidates;
}
export function pageActorRoster(selection:readonly Cultivator[],requestedPage:number){
  const pages=Math.max(1,Math.ceil(selection.length/ACTOR_PAGE_SIZE));
  const page=Math.max(0,Math.min(pages-1,Number.isFinite(requestedPage)?Math.trunc(requestedPage):0));
  return {actors:selection.slice(page*ACTOR_PAGE_SIZE,(page+1)*ACTOR_PAGE_SIZE),total:selection.length,pages,page};
}
export function getActorRosterPage(world:WorldState,search:string,status:RosterStatus,requestedPage:number){
  return pageActorRoster(selectActorRoster(createActorRosterIndex(world),search,status),requestedPage);
}
export interface RosterPinnedActor {actor:Cultivator;selected:boolean;focal:boolean}
export function partitionActorRosterPage(index:ActorRosterIndex,page:readonly Cultivator[],selected?:Cultivator,focalId?:string){
  const focalRecord=focalId===undefined?undefined:index.byId.get(focalId);
  const focal=focalRecord?.alive&&focalRecord.hp>0?focalRecord:undefined;
  const selectedRecord=selected&&index.byId.get(selected.id)===selected?selected:undefined;
  const pinned:RosterPinnedActor[]=[];
  if(focal)pinned.push({actor:focal,selected:selectedRecord===focal,focal:true});
  if(selectedRecord&&selectedRecord!==focal)pinned.push({actor:selectedRecord,selected:true,focal:false});
  return {pinned,rows:page.filter(actor=>!pinned.some(row=>row.actor===actor))};
}
export const rosterActorDisambiguator=(index:ActorRosterIndex,actor:Cultivator)=>index.sameName.get(actor);
