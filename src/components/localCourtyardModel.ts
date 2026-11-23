import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {isSectActive} from '../engine/sectActivity';
import {availableSettlementActions,visibleSettlements} from '../engine/settlementEngine';
import {terrainTileAt} from '../engine/terrainEngine';
import type {Cultivator,MapPoint,WorldState} from '../types/world';
import {buildMapActorSpriteModels,type MapActorSpriteModel} from './mapActorSpriteModel';
import {projectMapEntitySiteDetails} from './mapEntitySiteDetails';
import type {SceneStageSeason,SceneStageTheme} from './sceneStageModel';
import {mapTransitActorIds} from './mapConvoyView';
import type {createTerrainMapView} from './terrainMapView';

type NativeMapView=ReturnType<typeof createTerrainMapView>;
export type CourtyardGround='grass'|'stone'|'soil'|'snow'|'ash'|'water'|'bridge';
export type LocalCourtyardFacilityKind='gate'|'pavilion'|'furnace'|'herbs'|'array'|'market'|'village';
export type LocalCourtyardTarget={kind:'actor'|'villager'|'facility';id:string};
interface Cell {readonly col:number;readonly row:number}
interface Position extends Cell {readonly x:number;readonly y:number}
export interface LocalCourtyardTile extends Cell {readonly ground:CourtyardGround}
export interface LocalCourtyardFacility extends Position {
  readonly id:string;readonly kind:LocalCourtyardFacilityKind;readonly label:string;readonly detail:string;
}
export interface LocalCourtyardActor extends Position {
  readonly id:string;readonly name:string;readonly realm:string;readonly sprite:MapActorSpriteModel;
}
export interface LocalCourtyardVillager extends Position {
  readonly id:string;readonly name:string;readonly label:string;readonly sprite:MapActorSpriteModel;
}
export interface LocalCourtyardPlan {
  readonly siteId:string;readonly siteName:string;readonly theme:SceneStageTheme;readonly season:SceneStageSeason;
  readonly columns:16;readonly rows:10;readonly width:640;readonly height:400;
  readonly tiles:readonly LocalCourtyardTile[];readonly facilities:readonly LocalCourtyardFacility[];
  readonly actors:readonly LocalCourtyardActor[];readonly villagers:readonly LocalCourtyardVillager[];
  readonly population?:number;
}
export interface LocalCourtyardOptions {readonly viewer?:Cultivator;readonly historical?:boolean}

const columns=16,rows=10,width=640,height=400,size=40;
export const courtyardFacilityScale=(kind:LocalCourtyardFacilityKind):number=>
  kind==='gate'?1.60:kind==='herbs'?1.33:1.38;
const unique=<T extends {id:string}>(items:readonly T[])=>{
  const result=new Map<string,T|undefined>();
  for(const row of items)result.set(row.id,result.has(row.id)?undefined:row);
  return result;
};
const safe=(word:string,max=60)=>[...word.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'').trim()].slice(0,max).join('');
const alive=(actor:Cultivator)=>actor.alive&&Number.isFinite(actor.hp)&&actor.hp>0&&actor.positionPlane===undefined;
const order=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;
const locate=({col,row}:Cell):Position=>({col,row,x:(col+.5)*size,y:(row+.5)*size});
const slots:Record<LocalCourtyardFacilityKind,Cell>={
  gate:{col:8,row:2},pavilion:{col:3,row:2},furnace:{col:12,row:2},herbs:{col:3,row:6},
  array:{col:12,row:6},market:{col:6,row:3},village:{col:10,row:3},
};
const thematic=(siteId:string):SceneStageTheme=>siteId==='loc-taixu'?'sword_peak':siteId==='loc-danxia'?'pill_valley':
  siteId==='loc-market'||siteId==='loc-market-east'?'market':siteId==='loc-blood'?'blood_abyss':
  siteId==='loc-vein-north'?'north_vein':'countryside';
// Keep the courtyard and illustrated story stage on the same four monthly quarters.
const currentSeason=(month:number):SceneStageSeason=>month<=3?'spring':month<=6?'summer':month<=9?'autumn':'winter';
const hasGrade=(value:number)=>Number.isFinite(value)&&value>0;

function mortalSprite(id:string,gender:WorldState['settlements']['villages'][number]['volunteers'][number]['gender']):MapActorSpriteModel{
  let n=0;
  for(const glyph of id)n=Math.imul(n^(glyph.codePointAt(0)??0),31)+7;
  const pick=(shift:number)=>((n>>>shift)&3) as 0|1|2|3;
  return {id,pose:'idle',appearance:{face:{jaw:pick(2),eyes:pick(6),hair:pick(10),ornament:0,skin:'#dcb089',ink:'#31282b'},
    attire:gender==='woman'?'layered':gender==='man'?'crossed':'neutral',ageBand:'seasoned',brow:'level',
    palette:{fabric:['#88765d','#49746c','#9b715f','#616d7b'][pick(15)],trim:'#e1bb89',spirit:'#e3bd85',background:'#28362d'}}};
}

/** A diagram, not a movement map. It contains only native admitted local facts and illustrative courtyard geometry. */
export function buildLocalCourtyard(world:WorldState,view:NativeMapView,siteId:string,options:LocalCourtyardOptions={}):LocalCourtyardPlan|undefined{
  if(options.historical)return;
  const people=unique(world.cultivators);
  const {viewer}=options;
  if(viewer&&(people.get(viewer.id)!==viewer||!alive(viewer)))return;
  const site=unique(world.locations).get(siteId);
  const tile=site&&terrainTileAt(world,site.x,site.y);
  if(!site||!tile||unique(view.seenLocations).get(siteId)!==site||site.type==='secret_realm'||isScopedExpeditionGate(site)||
    !view.isCurrentLocation(siteId)||view.locationTile.get(siteId)!==tile||view.tileState(tile)!=='visible'||
    view.current&&!view.current.has(tile.id))return;
  const moving=mapTransitActorIds(world);
  const residents=[...unique(view.liveActors).values()].filter((body):body is Cultivator=>
    !!body&&people.get(body.id)===body&&alive(body)&&body.locationId===siteId&&!view.trailPositions.has(body.id)&&!moving.has(body.id)).sort(order);
  const local=viewer&&residents.includes(viewer)?viewer:undefined;
  const existing=[...unique(visibleSettlements(world,local)).values()].filter(village=>village?.locationId===siteId);
  const village=existing.length===1?existing[0]:undefined;
  const owner=site.ownerSectId?unique(world.sects).get(site.ownerSectId):undefined;
  const sect=isSectActive(owner)&&owner.headquartersId===siteId?owner:undefined;
  const details=projectMapEntitySiteDetails(world,view,site,residents,local);
  const fact=(label:string,fallback:string)=>details.find(row=>row.label===label)?.text??fallback;
  const facilities:LocalCourtyardFacility[]=[];
  const add=(kind:LocalCourtyardFacilityKind,label:string,detail:string)=>facilities.push({id:`${siteId}:${kind}`,kind,label,
    detail:safe(detail,120),...locate(slots[kind])});
  if(sect)add('gate','山门',`${safe(sect.name)} · 当前宗门驻地`);
  if(sect&&hasGrade(sect.facilities.scripture_pavilion))add('pavilion','藏经阁',fact('藏经阁','此地有实存藏经阁。'));
  if(hasGrade(site.furnaceGrade))add('furnace','丹炉',fact('丹炉',`${site.furnaceGrade} 阶`));
  const plants=Object.entries(site.herbs).filter(([name,stock])=>stock>0&&hasGrade(site.herbCapacity[name as keyof typeof site.herbCapacity])).length;
  if(plants)add('herbs','灵草地',`此地实有 ${plants} 类可见灵草存量。`);
  if(sect&&hasGrade(sect.facilities.defense_array))add('array','护山阵',`此地实有 ${sect.facilities.defense_array} 级护山阵。`);
  if(site.type==='market')add('market','坊市',fact('乡集','此地为实际登记的坊市。'));
  const population=local&&village&&Number.isSafeInteger(village.population)&&village.population>=0?village.population:undefined;
  if(village&&village.population>0)add('village','村落',population===undefined?'此地有登记的民居。':`村册实记 ${population} 人；不等同此画中的具名成人。`);

  const theme=thematic(siteId);
  // The Danxia ornamental water garden is stage scenery, not an added world-map river
  // or a facility/interaction. A bridge runs across it on the main carved-stone walk.
  const channel=theme==='pill_valley'
    ?[[],[14],[14],[13,14],[13],[13],[13],[13,14],[14],[]]
    :undefined;
  const tiles:LocalCourtyardTile[]=[];
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const avenue=col===8||row===5||(row===4&&col>=5&&col<=10)||
      (row===3&&col>=3&&col<=12&&col!==4&&col!==11)||facilities.some(f=>f.col===col&&f.row===row);
    const bed=facilities.some(f=>f.kind==='herbs'&&Math.abs(f.col-col)<=1&&Math.abs(f.row-row)<=1);
    const ground:CourtyardGround=channel?.[row].includes(col)?(row===5?'bridge':'water'):
      avenue?'stone':bed?'soil':theme==='north_vein'?'snow':theme==='blood_abyss'?'ash':'grass';
    tiles.push({row,col,ground});
  }
  const open=tiles.filter(cell=>cell.col>0&&cell.col<15&&cell.row>=3&&cell.row<9&&
    cell.ground!=='water'&&cell.ground!=='soil'&&!facilities.some(f=>f.col===cell.col&&
      (f.row===cell.row||f.row+1===cell.row)));
  const sprites=buildMapActorSpriteModels(world,view,residents.map(actor=>({actor})));
  const actors=residents.flatMap(body=>{
    const sprite=sprites.get(body.id);
    return sprite?[{id:body.id,name:safe(body.name),realm:`${body.realm}${body.realmStage}层`,sprite,action:body.currentAction}]:[];
  });
  const eligible=local&&village&&population&&population>0?new Set(availableSettlementActions(local,world).flatMap(choice=>
    choice.action==='RECRUIT_SETTLER'&&choice.targetSettlementId===village.id?[choice.targetVolunteerId]:[])):undefined;
  const memberIds=new Map<string,WorldState['households']['members'][number]|undefined>();
  if(eligible)for(const member of world.households.members)
    memberIds.set(member.volunteerId,memberIds.has(member.volunteerId)?undefined:member);
  const volunteers=eligible&&village?[...unique(village.volunteers).values()].flatMap(person=>{
    const member=person&&memberIds.get(person.id);
    return person&&member?.status==='resident'&&member.settlementId===village.id&&member.registeredTick<=world.tick&&
      eligible.has(person.id)&&!person.enlistedCultivatorId&&person.age>=18?
      [{id:person.id,name:safe(person.name),label:'本地成年自愿者',sprite:mortalSprite(person.id,person.gender)}]:[];
  }).sort(order):[];
  // Place the native poses at illustrative stations; never infer a new job or movement.
  const stations=Object.fromEntries(facilities.map(f=>[f.kind,f])) as Partial<Record<LocalCourtyardFacilityKind,Cell>>;
  const quietSpots:readonly Cell[]=[{col:2,row:4},{col:12,row:8},{col:4,row:8},{col:10,row:4}];
  const assigned:Cell[]=[];
  const piles=new Map<Cell,number>();
  const assign=(near:Cell)=>{
    let target=open[0],best=Infinity;
    for(const cell of open){
      const dx=cell.col-near.col,dy=cell.row-near.row;
      const score=(piles.get(cell)??0)*400+dx*dx+dy*dy;
      if(score<best){target=cell;best=score;}
    }
    assigned.push(target);piles.set(target,(piles.get(target)??0)+1);
  };
  const near=(row:typeof actors[number],i:number):Cell=>{
    if(row.action==='GATHER_HERBS'&&stations.herbs)return stations.herbs;
    if((row.action==='BREW_PILL'||row.action==='HEAVENLY_ALCHEMY')&&stations.furnace)return stations.furnace;
    if(row.sprite.pose==='fight')return {col:7+i%3,row:4+i%2};
    if(row.sprite.pose==='talk')return stations.market??{col:7+i%3,row:5};
    return quietSpots[i%quietSpots.length];
  };
  actors.forEach((actor,i)=>assign(near(actor,i)));
  volunteers.forEach((_,i)=>assign(stations.village??quietSpots[i%quietSpots.length]));
  const level=new Map<Cell,number>();
  const position=(index:number)=>{
    const cell=assigned[index],anchor=locate(cell);
    const rank=level.get(cell)??0,pile=piles.get(cell)??1;
    level.set(cell,rank+1);
    return {...anchor,x:anchor.x+(pile>1?(rank/(pile-1)-.5)*24:0)};
  };
  return {siteId,siteName:safe(site.name),theme,season:currentSeason(world.month),columns,rows,width,height,tiles,facilities,
    actors:actors.map(({action:_,...actor},i)=>({...actor,...position(i)})),villagers:volunteers.map((person,i)=>({...person,...position(i+actors.length)})),
    ...(population===undefined?{}:{population})};
}

/** Hit-tests the same logical feet/anchor coordinates painted in the layout. People take priority over background structures. */
export function hitLocalCourtyard(plan:LocalCourtyardPlan,point:Readonly<MapPoint>):LocalCourtyardTarget|undefined{
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>=plan.width||point.y>=plan.height)return;
  let picked:LocalCourtyardTarget|undefined, distance=Infinity;
  const person=(kind:'actor'|'villager',record:LocalCourtyardActor|LocalCourtyardVillager)=>{
    const dx=point.x-record.x,dy=point.y-record.y;
    if(Math.abs(dx)>14||dy< -25||dy>12)return;
    const current=dx*dx+(dy+7)*(dy+7);
    if(current<distance){picked={kind,id:record.id};distance=current;}
  };
  for(const actor of plan.actors)person('actor',actor);
  for(const visitor of plan.villagers)person('villager',visitor);
  if(picked)return picked;
  const facility=plan.facilities.find(row=>{
    const reach=19*courtyardFacilityScale(row.kind);
    return Math.abs(point.x-row.x)<=reach&&Math.abs(point.y-row.y)<=reach;
  });
  return facility?{kind:'facility',id:facility.id}:undefined;
}
