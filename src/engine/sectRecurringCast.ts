import {REALM_BASE_POWER,REALM_LIFESPAN} from '../data/initialWorld';
import {starterSectIdentity} from '../types/sectManagement';
import {sectRecurringIdentity} from '../types/sectRecurring';
import type {Cultivator,LocationNode,MapTile,Sect,SpiritBeast,WorldState} from '../types/world';
import {habitatCanReceiveWildBeast} from './habitatEngine';
import {noteTerrainVisit,terrainTileAt} from './terrainEngine';

const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const distance=(a:Pick<LocationNode,'x'|'y'>,b:Pick<LocationNode,'x'|'y'>)=>Math.hypot(a.x-b.x,a.y-b.y);
function exact<T extends {id:string}>(rows:readonly T[],id:string):T|undefined{
  const matches=rows.filter(row=>row.id===id);
  return matches.length===1?matches[0]:undefined;
}
function safeGround(world:WorldState,tile:MapTile):boolean{
  return !tile.ownerSectId&&(tile.biome==='灵山'||tile.biome==='剑冢')&&
    !world.mapHazards.some(row=>row.tileId===tile.id&&row.createdTick<=world.tick&&world.tick<row.expiresTick);
}

interface Lot {readonly tile:MapTile;readonly x:number;readonly y:number}
function newLot(world:WorldState,home:LocationNode,used:readonly LocationNode[],spacing:number):Lot|undefined{
  const {tiles,columns,rows}=world.terrain;
  return tiles.flatMap(tile=>{
    if(!safeGround(world,tile)||tile.col<1||tile.col>=columns-1||tile.row<1||tile.row>=rows-1)return [];
    const lot={tile,x:(tile.col+.5)*1000/columns,y:(tile.row+.5)*600/rows};
    return used.some(site=>distance(site,lot)<spacing)?[]:[lot];
  }).sort((a,b)=>distance(home,a)-distance(home,b)||b.tile.spiritQi-a.tile.spiritQi||compare(a.tile.id,b.tile.id))[0];
}

function actualNearbyRefuge(world:WorldState,home:LocationNode,catId:string):LocationNode|undefined{
  return world.locations.filter(site=>{
    const tile=terrainTileAt(world,site.x,site.y);
    return site.type==='spirit_vein'&&site.expeditionOmenId===undefined&&!site.ownerSectId&&!!tile&&
      safeGround(world,tile)&&distance(home,site)<=140&&habitatCanReceiveWildBeast(world,site.id,catId);
  }).sort((a,b)=>distance(home,a)-distance(home,b)||compare(a.id,b.id))[0];
}

const herbs=(jade_leaf:number,earth_root:number,star_bloom:number,shadow_moss:number)=>
  ({jade_leaf,earth_root,star_bloom,shadow_moss});

function rivalHeadquarters(lot:Lot,siteId:string,sectId:string):LocationNode{
  return {id:siteId,name:'三尺门',description:'一座不甚宽的别家山门，匾额偏要写得比门宽。',
    x:lot.x,y:lot.y,type:'sect_hq',ownerSectId:sectId,spiritRoot:'金',
    spiritQi:Math.max(24,Math.min(50,lot.tile.spiritQi)),furnaceGrade:0,inheritanceScrolls:[],
    herbs:herbs(1,1,0,0),herbCapacity:herbs(6,5,2,2)};
}

function hillsideRefuge(lot:Lot,siteId:string):LocationNode{
  return {id:siteId,name:'后山石棚',description:'乱石依着山坡，顶上松枝交错，给山中客留了一点清静。',
    x:lot.x,y:lot.y,type:'spirit_vein',spiritRoot:'木',
    spiritQi:Math.max(25,Math.min(48,lot.tile.spiritQi)),furnaceGrade:0,inheritanceScrolls:[],
    herbs:herbs(1,1,0,0),herbCapacity:herbs(7,5,2,2)};
}

function resident(id:string,site:LocationNode,role:'rival'|'ancestor'):Cultivator{
  const rival=role==='rival';
  const realm=rival?'筑基':'金丹',maxHp=rival?320:740,spiritRoot=rival?'金':'木';
  return {id,name:rival?'赵掌门':'后山老祖',gender:'man',title:rival?'三尺门掌门':'后山散人',
    sectId:rival?site.ownerSectId??'':'',sectRank:rival?'掌门':'外门弟子',contribution:0,transgressions:0,
    realm,realmStage:rival?2:3,qiProgress:rival?16:37,hp:maxHp,maxHp,combatPower:REALM_BASE_POWER[realm]+10,
    age:rival?33:326,lifespan:REALM_LIFESPAN[realm],personality:rival?'狂傲':'苟道',spiritRoot,locationId:site.id,
    spiritStones:rival?15:9,karma:0,currentAction:'REST',
    innerMonologue:rival?'三尺也要有三尺的体面。':'闲人若来借宿，先把蒲团留在屋里。',
    secretGoal:rival?'让邻近山门承认三尺门的本领':'在后山少听几句争名的话',
    technique:{name:rival?'三尺守中剑':'松根调息法',spiritRoot},techniqueMastery:rival?21:38,
    herbs:herbs(0,0,0,0),pills:{foundation:0,golden:0,barrier:0,heart_poison:0},
    pillToxicity:0,exploredTileIds:[],artifacts:[],memories:[],coreMemories:[],memorySequence:0,reflections:[],rumors:[],alive:true,
  };
}

/** Introduce the three new native entities once, after the founding month; never recreate missing or deceased cast. */
export function ensureSectRecurringCast(world:WorldState):boolean{
  const state=world.sectManagement;
  if(!state||state.recurring!==undefined||world.tick<=state.foundedTick)return false;
  const origin=starterSectIdentity(world.random.seed,state.starterId,state.draw);
  if(state.sectId!==origin.sectId||state.leaderId!==origin.leaderId||state.homeSiteId!==origin.homeSiteId)return false;
  const identity=sectRecurringIdentity(state.sectId,origin.creditorId);
  const managed=exact(world.sects,state.sectId);
  const home=managed&&exact(world.locations,managed.headquartersId);
  if(!home||home.type!=='sect_hq'||home.ownerSectId!==state.sectId||home.expeditionOmenId!==undefined||
    !exact(world.cultivators,identity.wang)||!exact(world.cultivators,identity.host)||
    world.sects.some(row=>row.id===identity.rivalSectId)||world.locations.some(row=>row.id===identity.rivalSiteId)||
    world.cultivators.some(row=>row.id===identity.rival||row.id===identity.ancestor)||
    world.spiritBeasts.some(row=>row.id===identity.cat))return false;

  const refuge=actualNearbyRefuge(world,home,identity.cat);
  const backhillId=`${state.sectId}-backhill-site`;
  if(!refuge&&world.locations.some(row=>row.id===backhillId))return false;
  const refugeLot=refuge?undefined:newLot(world,home,world.locations,52);
  const hills=refuge??(refugeLot&&hillsideRefuge(refugeLot,backhillId));
  if(!hills)return false;
  const rivalLot=newLot(world,home,[...world.locations,hills],66);
  if(!rivalLot)return false;
  const rivalSite=rivalHeadquarters(rivalLot,identity.rivalSiteId,identity.rivalSectId);

  const rival:Sect={id:identity.rivalSectId,name:'三尺门',headquartersId:rivalSite.id,leaderId:identity.rival,
    color:'#8a7ca6',alignment:'中立',doctrine:'一柄三尺剑，一寸也不让人小看。',spiritStones:24,reputation:5,
    pavilion:[],facilities:{qi_array:0,alchemy_hall:0,scripture_pavilion:0,defense_array:0,spirit_mine:0},arrayHp:0,arrayMaxHp:0};
  const chief=resident(identity.rival,rivalSite,'rival'),ancestor=resident(identity.ancestor,hills,'ancestor');
  const cat:SpiritBeast={id:identity.cat,name:'偷丹灵猫',kind:'瑞兽',locationId:hills.id,homeLocationId:hills.id,
    hp:90,maxHp:90,power:110,cultivation:2,alive:true,nextActionTick:world.tick+4};

  // All construction checks finish before the first write. Original actors, terrain geometry and RNG cursor stay untouched.
  world.sects.push(rival);
  world.locations.push(rivalSite);
  if(!refuge)world.locations.push(hills);
  rivalLot.tile.ownerSectId=rival.id;
  world.cultivators.push(chief,ancestor);
  noteTerrainVisit(world,chief);
  noteTerrainVisit(world,ancestor);
  world.spiritBeasts.push(cat);
  state.recurring={openedTick:world.tick,ancestorSiteId:hills.id,catHomeSiteId:hills.id,encounters:[]};
  return true;
}
