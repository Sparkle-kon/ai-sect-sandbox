import {COMEDY_RECRUITS} from '../data/sectComedy/consequences';
import type {ComedyRecruitId} from '../types/sectComedy';
import {adjustRelationship} from './relationships';
import {ensureManagedSectQuirks} from './sectQuirkAssignment';
import {createInitialWorld,REALM_BASE_POWER,REALM_LIFESPAN} from '../data/initialWorld';
import {SECT_QUIRK_IDS,STARTER_SECT_IDS,starterSectIdentity,type ManagementBuildings,type SectQuirkId,type StarterDraw,type StarterSectId} from '../types/sectManagement';
import type {Cultivator,FictionalGender,LocationNode,PersonalityTrait,Sect,SpiritRoot,WorldgenProfileId,WorldState} from '../types/world';
import {fictionalGenderFor} from './fictionalPersonMetadata';
import {noteTerrainVisit} from './terrainEngine';
import {isWorldSeed} from './worldRandom';
import {isWorldgenProfileId} from './worldgenProfiles';
import {configureStoryteller} from './storytellerDirector';

type Starter = {
  readonly name:string;readonly pitch:string;readonly stones:number;
  readonly buildings:Readonly<ManagementBuildings>;readonly color:string;readonly root:SpiritRoot;
  readonly debt?:{readonly creditorName:string;readonly principal:number;readonly dueMonths:number};
};
const STARTERS:Readonly<Record<StarterSectId,Starter>>={
  'qingyun-odd-jobs':{
    name:'青云杂役派',pitch:'祖师爷留下三名弟子、一座漏雨的大殿，和一张没漏掉欠款的借条。',
    stones:12,color:'#5cb6a1',root:'木',
    buildings:{hall:1,kitchen:1,furnace:0,trainingGround:0,gate:1,library:0},
    debt:{creditorName:'王掌柜',principal:80,dueMonths:6},
  },
  'drunken-sword-hermitage':{
    name:'醉剑小筑',pitch:'账上没有债，剑谱只剩半本。倒是灶上的酒坛，一只也没少。',
    stones:30,color:'#c6a564',root:'金',
    buildings:{hall:1,kitchen:2,furnace:0,trainingGround:1,gate:0,library:0},
  },
};
const CAST=[
  ['柳二狗','苏小满','赵铁柱','余来福','钟半夏','谢归燕','孟白芍','常照溪'],
  ['陶三钱','花不谢','许阿巧','傅一筹','沈折桂','方无影','陈落雁','魏报春'],
] as const;
const ROOTS:readonly SpiritRoot[]=['金','木','水','火','土','雷','暗','天灵根'];
const PERSONAS:readonly PersonalityTrait[]=['刚正','阴险','狂傲','苟道','痴情','嗜血','逍遥','诡诈'];
export interface StarterDisciplePreview {
  readonly id:string;readonly name:string;readonly gender:FictionalGender;
  readonly spiritRoot:SpiritRoot;readonly personality:PersonalityTrait;readonly quirks:readonly SectQuirkId[];
}
export interface StarterSectPreview {
  readonly id:StarterSectId;readonly name:string;readonly pitch:string;readonly stones:number;
  readonly debt?:Starter['debt'];readonly buildings:ManagementBuildings;readonly disciples:readonly StarterDisciplePreview[];
}

const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function roll(seed:number,...fields:readonly (string|number)[]):number{
  let hash=seed^0x811c9dc5;
  for(const ch of fields.join('|'))hash=Math.imul(hash^ch.charCodeAt(0),0x01000193);
  hash=Math.imul(hash^(hash>>>16),0x85ebca6b);
  return (hash^(hash>>>13))>>>0;
}

export function previewStarterSect(seed:number,starterId:StarterSectId,draw:StarterDraw):StarterSectPreview|undefined{
  if(!isWorldSeed(seed)||!STARTER_SECT_IDS.includes(starterId)||(draw!==0&&draw!==1))return;
  const starter=STARTERS[starterId],{foundingDiscipleIds}=starterSectIdentity(seed,starterId,draw);
  const names=CAST[draw],offset=roll(seed,starterId,'cast')%names.length;
  const disciples=foundingDiscipleIds.map((id,i):StarterDisciplePreview=>{
    const first=roll(seed,starterId,draw,i,'first-quirk')%SECT_QUIRK_IDS.length;
    const second=(first+1+roll(seed,starterId,draw,i,'second-quirk')%(SECT_QUIRK_IDS.length-1))%SECT_QUIRK_IDS.length;
    return {id,name:names[(i+offset)%names.length],gender:fictionalGenderFor(seed,id),
      spiritRoot:ROOTS[roll(seed,id,'root')%ROOTS.length],personality:PERSONAS[roll(seed,id,'personality')%PERSONAS.length],
      quirks:i===0||roll(seed,id,'pair')%3===0?[SECT_QUIRK_IDS[first],SECT_QUIRK_IDS[second]]:[SECT_QUIRK_IDS[first]]};
  });
  return {id:starterId,name:starter.name,pitch:starter.pitch,stones:starter.stones,buildings:{...starter.buildings},disciples,
    ...(starter.debt?{debt:{...starter.debt}}:{})};
}

function ground(world:WorldState,starterId:StarterSectId,market:LocationNode){
  const {columns,rows,tiles}=world.terrain;
  return tiles.flatMap(tile=>{
    if(tile.ownerSectId||tile.biome==='魔渊'||tile.biome==='毒沼'||tile.biome==='荒漠'||
      tile.col<1||tile.row<1||tile.col>=columns-1||tile.row>=rows-1)return [];
    const x=(tile.col+.5)*1000/columns,y=(tile.row+.5)*600/rows;
    if(world.locations.some(site=>Math.hypot(site.x-x,site.y-y)<73))return [];
    const distance=Math.hypot(x-market.x,y-market.y)-tile.spiritQi*.45;
    return [{tile,x,y,score:distance+roll(world.random.seed,starterId,tile.id)%18}];
  }).sort((a,b)=>a.score-b.score||compare(a.tile.id,b.tile.id))[0];
}

function resident(details:Pick<Cultivator,'id'|'name'|'gender'|'spiritRoot'|'personality'>,place:LocationNode,role:'leader'|'disciple'|'merchant',index=0):Cultivator {
  const foundingSect=role==='merchant'?'':place.ownerSectId??'';
  const realm=role==='leader'?'筑基':'练气';
  const maxHp=role==='leader'?310:120+index*5;
  return {...details,title:role==='leader'?'掌门':role==='merchant'?'坊市掌柜':'外门弟子',sectId:foundingSect,
    sectRank:role==='leader'?'掌门':'外门弟子',contribution:0,transgressions:0,realm,
    realmStage:role==='leader'?1:1+index%3,qiProgress:role==='leader'?24:12+index*4,hp:maxHp,maxHp,
    combatPower:REALM_BASE_POWER[realm]+index*10,age:role==='leader'?28:role==='merchant'?42:17+index,
    lifespan:REALM_LIFESPAN[realm],locationId:place.id,spiritStones:role==='merchant'?300:role==='leader'?6:2,
    karma:0,currentAction:'REST',
    innerMonologue:role==='merchant'?'纸上的账，还是一笔一笔来。':role==='leader'?'先看院里有谁，再定今天该做什么。':'先听掌门如何安排。',
    secretGoal:role==='merchant'?'守住自己的铺子':role==='leader'?'让这座山门过上有饭吃的日子':'学一点能养活自己的本事',
    technique:{name:role==='leader'?'归山调息诀':'入门吐纳诀',spiritRoot:details.spiritRoot},techniqueMastery:role==='leader'?18:0,
    herbs:{jade_leaf:0,earth_root:0,star_bloom:0,shadow_moss:0},pills:{foundation:0,golden:0,barrier:0,heart_poison:0},
    pillToxicity:0,exploredTileIds:[],artifacts:[],memories:[],coreMemories:[],memorySequence:0,reflections:[],rumors:[],alive:true,
  };
}

export function createComedyRecruit(template:ComedyRecruitId,id:string,home:LocationNode):Cultivator {
  const {name,gender,spiritRoot,personality,quirks,origin,realm}=COMEDY_RECRUITS[template];
  const recruit=resident({id,name,gender,spiritRoot,personality},home,'disciple');
  return {...recruit,realm,quirks:[...quirks],title:origin,age:24,lifespan:REALM_LIFESPAN[realm],
    combatPower:REALM_BASE_POWER[realm],...(realm==='筑基'?{maxHp:260,hp:260}:{})};
}

/** Confirming a preview creates one new native faction and its actual local bodies at the first dated month. */
export function createManagedSectWorld(seed:number,profileId:WorldgenProfileId,starterId:StarterSectId,draw:StarterDraw):WorldState|undefined{
  const preview=previewStarterSect(seed,starterId,draw);
  if(!preview||!isWorldgenProfileId(profileId))return;
  const world=createInitialWorld(seed,profileId),starter=STARTERS[starterId];
  const {sectId,homeSiteId,leaderId,creditorId:wangId}=starterSectIdentity(seed,starterId,draw);
  const market=world.locations.find(row=>row.id===(starterId==='qingyun-odd-jobs'?'loc-market':'loc-market-east')&&row.type==='market');
  if(!market)return;
  const lot=ground(world,starterId,market);
  if(!lot||world.sects.some(row=>row.id===sectId)||world.locations.some(row=>row.id===homeSiteId))return;
  const home:LocationNode={id:homeSiteId,name:preview.name,x:lot.x,y:lot.y,type:'sect_hq',ownerSectId:sectId,
    spiritRoot:starter.root,spiritQi:Math.max(26,Math.min(55,lot.tile.spiritQi)),furnaceGrade:0,inheritanceScrolls:[],
    description:starterId==='qingyun-odd-jobs'?'山门还站得住，檐下接雨的瓦盆已摆成一行。':'院中一块磨平的青石可练剑，转身就是还冒着热气的灶房。',
    herbs:{jade_leaf:2,earth_root:2,star_bloom:0,shadow_moss:0},
    herbCapacity:{jade_leaf:8,earth_root:8,star_bloom:2,shadow_moss:2}};
  const sect:Sect={id:sectId,name:preview.name,alignment:'中立',color:starter.color,
    doctrine:starterId==='qingyun-odd-jobs'?'先把山门收拾妥当，再谈得道成仙。':'愿从手中剑问道，也容灶上烟火不绝。',
    reputation:0,spiritStones:starter.stones,headquartersId:homeSiteId,leaderId,pavilion:[],
    facilities:{qi_array:0,alchemy_hall:0,scripture_pavilion:0,defense_array:0,spirit_mine:0},arrayHp:0,arrayMaxHp:0};
  const leader=resident({id:leaderId,name:'林行简',gender:fictionalGenderFor(seed,leaderId),
    spiritRoot:starter.root,personality:'逍遥'},home,'leader');
  const disciples=preview.disciples.map(({quirks,...person},i):Cultivator=>({...resident(person,home,'disciple',i),quirks:[...quirks]}));
  const wangMarket=world.locations.find(site=>site.id==='loc-market'&&site.type==='market');
  if(!wangMarket)return;
  const wang=resident({id:wangId,name:'王掌柜',gender:'man',spiritRoot:'土',personality:'苟道'},wangMarket,'merchant');
  const newPeople=[leader,...disciples,wang];
  if(newPeople.some(person=>world.cultivators.some(actor=>actor.id===person.id)))return;
  world.locations.push(home);
  world.sects.push(sect);
  lot.tile.ownerSectId=sectId;
  world.cultivators.push(...newPeople);
  const adults=disciples.filter(person=>person.age>=18);
  for(let i=0;i<adults.length;i++)for(let j=i+1;j<adults.length;j++){
    const rivals=starterId==='drunken-sword-hermitage'&&i===0&&j===1;
    const friends=starterId==='drunken-sword-hermitage'&&i===1&&j===2;
    adjustRelationship(world,adults[i].id,adults[j].id,rivals?6:friends?22:18,rivals?'竞争':friends?'挚友':'同门',
      rivals?'同在醉剑小筑习剑，彼此存着一分较量的心思。':friends?'两人同在醉剑小筑，是说得来的一对同门。':
        '同在这座山门领功课，彼此是同门。');
  }
  for(const person of newPeople)noteTerrainVisit(world,person);
  world.sectManagement={version:1,starterId,sectId,leaderId,homeSiteId,foundedTick:world.tick,draw,
    foundingDiscipleIds:disciples.map(person=>person.id),buildings:{...starter.buildings},
    ...(starter.debt?{debt:{creditorId:wang.id,principal:starter.debt.principal,dueTick:world.tick+starter.debt.dueMonths}}:{})};
  if(!configureStoryteller(world,'wandering_jianghu',leaderId))return;
  ensureManagedSectQuirks(world);
  return world;
}
