import type {Cultivator,LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../types/world';
import type {WildMigrationOption,WildMigrationRecord,WildMigrationSide,WildMigrationView} from '../types/wildMigration';
import {habitatCanReceiveWildBeast,isRewildingAcclimating} from './habitatEngine';
import {knownMapLocations,terrainTileAt} from './terrainEngine';
import {presentForWildMigration,WILD_MIGRATION_RESPONSE_TICKS,wildMigrationId,wildMigrationWilderness,wildRoamEventId} from './wildMigrationStamp';
export type {WildMigrationOption,WildMigrationView} from '../types/wildMigration';
export {recordWildMigration} from './wildMigrationStamp';

const QI=8;
const unique=<T extends {id:string}>(rows:readonly T[],id:string)=>{const found=rows.filter(row=>row.id===id);return found.length===1?found[0]:undefined;};
const actorBy=(world:WorldState,id:string)=>unique(world.cultivators,id);
const siteBy=(world:WorldState,id:string)=>unique(world.locations,id);
const beastBy=(world:WorldState,id:string)=>unique(world.spiritBeasts,id);
const idAt=(row:WildMigrationRecord,tick:number,side:WildMigrationSide)=>`evt-${tick}-${row.id}-${side}`;
export const isPrivateWildMigrationEvent=(row:Pick<WorldEvent,'id'|'witnessScope'>)=>
  row.witnessScope==='participants'&&/^evt-\d+-wild-migration-/.test(row.id);
const sentences={
  origin:{
    let_pass:{title:'让脚印留在本地',description:'亲见它已经离开，只让这处地面安静下来，不猜它去了哪边。'},
    track:{title:'记下离去的当地妖迹',description:'只记这一侧亲见的足迹，没有添写远处的兽影或路线。'},
  },
  destination:{
    let_pass:{title:'给迁来的活物留路',description:'实到的野物仍在此地。不驱赶，不驯服。'},
    track:{title:'认清本地的迁来妖迹',description:'只记亲到此处的同一活物，没有添写中途路径。'},
    drive:{title:'实把野物引向邻地',description:'实付八点灵气，只导走眼前同一活物；不杀、不驯、不改山门的领地。'},
  },
} as const;
function date(world:WorldState,row:WorldEvent,tick:number){
  const cal=world.year*12+world.month-1-(world.tick-tick);
  return row.tick===tick&&row.year===Math.floor(cal/12)&&row.month===cal%12+1;
}
function validRaw(world:WorldState,row:WildMigrationRecord,raw:WorldEvent){
  return raw.id===row.sourceEventId&&raw.id===wildRoamEventId(row.tick,row.beastId)&&date(world,raw,row.tick)&&
    raw.title==='妖兽游踪'&&raw.category==='heavenly'&&raw.witnessScope===undefined&&raw.actorIds.length===0&&raw.locationId===row.to.siteId&&
    raw.description===`${beastBy(world,row.beastId)?.name}离开原处，在${siteBy(world,row.to.siteId)?.name}附近出没。`;
}
function liveBeast(world:WorldState,row:WildMigrationRecord){
  const beast=beastBy(world,row.beastId);
  return beast?.alive&&beast.hp>0&&!beast.tamedBy&&beast.kind===row.kind&&beast.locationId===row.to.siteId&&
    !isRewildingAcclimating(world,beast.id)?beast:undefined;
}
function scene(world:WorldState,viewer:Cultivator,row:WildMigrationRecord){
  if(actorBy(world,viewer.id)!==viewer)return;
  const at=(['origin','destination'] as const).flatMap(side=>{
    const stamp=side==='origin'?row.from:row.to;
    const place=siteBy(world,stamp.siteId);
    return place&&place.ownerSectId===stamp.sectId&&viewer.sectId===stamp.sectId&&stamp.witnessIds.filter(id=>id===viewer.id).length===1&&
      presentForWildMigration(world,viewer,place.id)?[{side,place}]:[];
  });
  return at.length===1?at[0]:undefined;
}
function safeRetreat(world:WorldState,site:LocationNode,target:LocationNode,beastId:string,tick:number){
  const a=terrainTileAt(world,site.x,site.y),b=terrainTileAt(world,target.x,target.y);
  return target.type==='spirit_vein'&&wildMigrationWilderness(target)&&(target.ownerSectId===undefined||target.ownerSectId===site.ownerSectId)&&
    !!a&&!!b&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1&&b.biome!=='魔渊'&&b.biome!=='毒沼'&&
    !world.mapHazards.some(item=>item.tileId===b.id&&item.createdTick<=tick&&item.expiresTick>tick)&&
    habitatCanReceiveWildBeast(world,target.id,beastId);
}
function allowed(world:WorldState,viewer:Cultivator,row:WildMigrationRecord,tick:number):WildMigrationOption[]{
  const own=scene(world,viewer,row),source=unique(world.events,row.sourceEventId);
  if(!own||!source||!validRaw(world,row,source)||tick<=row.tick||tick>row.tick+WILD_MIGRATION_RESPONSE_TICKS||
    row.responses.some(choice=>choice.side===own.side))return [];
  const base={action:'WILD_MIGRATION',targetWildMigrationId:row.id} as const;
  const beast=own.side==='destination'?liveBeast(world,row):undefined;
  if(own.side==='destination'&&!beast)return [];
  const options:WildMigrationOption[]=[{...base,wildMigrationMove:'let_pass'},{...base,wildMigrationMove:'track'}];
  if(beast&&beast.kind!=='瑞兽'&&viewer.qiProgress>=QI&&viewer.hp>=viewer.maxHp*.4&&viewer.combatPower>=beast.power){
    const retreat=knownMapLocations(world,viewer).find(place=>siteBy(world,place.id)===place&&
      safeRetreat(world,own.place,place,beast.id,tick));
    if(retreat)options.push({...base,wildMigrationMove:'drive',targetLocationId:retreat.id});
  }
  return options;
}
export function availableWildMigrationActions(viewer:Cultivator,world:WorldState,tick=world.tick+1):WildMigrationOption[]{
  if(tick!==world.tick&&tick!==world.tick+1||!viewer.alive||viewer.positionPlane!==undefined)return [];
  const records=world.wildMigrations?.records??[];
  return records.flatMap(row=>tick>row.tick&&tick<=row.tick+WILD_MIGRATION_RESPONSE_TICKS?allowed(world,viewer,row,tick):[]);
}
export function resolveWildMigrationAction(world:WorldState,viewer:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='WILD_MIGRATION'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','wildMigrationMove','targetWildMigrationId','targetLocationId'].includes(key)))return null;
  const match=availableWildMigrationActions(viewer,world,world.tick).find(row=>row.targetWildMigrationId===decision.targetWildMigrationId&&
    row.wildMigrationMove===decision.wildMigrationMove&&row.targetLocationId===decision.targetLocationId);
  const record=match&&unique(world.wildMigrations?.records??[],match.targetWildMigrationId);
  const own=record&&scene(world,viewer,record);
  if(!match||!record||!own)return null;
  const move=match.wildMigrationMove,tick=world.tick;
  if(move==='drive'){
    const beast=liveBeast(world,record);
    if(!beast||own.side!=='destination')return null;
    viewer.qiProgress-=QI;beast.locationId=match.targetLocationId;
    beast.nextActionTick=Math.max(beast.nextActionTick,tick+1);
  }
  record.responses.push({side:own.side,actorId:viewer.id,tick,move,paidQi:move==='drive'?QI:0,
    ...(move==='drive'?{destinationId:match.targetLocationId}:{})});
  const text=move==='drive'?sentences.destination.drive:sentences[own.side][move];
  return {id:idAt(record,tick,own.side),tick,year:world.year,month:world.month,category:'heavenly',actorIds:[viewer.id],
    locationId:own.place.id,witnessScope:'participants',...text};
}
export function projectWildMigration(world:WorldState,viewer:Cultivator):WildMigrationView|undefined{
  if(!viewer?.alive||viewer.positionPlane!==undefined)return;
  for(const row of [...(world.wildMigrations?.records??[])].reverse()){
    if(row.tick>world.tick||world.tick>row.tick+WILD_MIGRATION_RESPONSE_TICKS)continue;
    const own=scene(world,viewer,row);
    if(!own)continue;
    const options=allowed(world,viewer,row,world.tick+1);
    const response=row.responses.find(result=>result.side===own.side&&result.actorId===viewer.id);
    const raw=response?unique(world.events,idAt(row,response.tick,own.side)):undefined;
    const text=response&&(response.move==='drive'?sentences.destination.drive:sentences[own.side][response.move]);
    const receipt=raw&&response&&text&&date(world,raw,response.tick)&&raw.actorIds.length===1&&raw.actorIds[0]===viewer.id&&
      raw.title===text.title&&raw.description===text.description&&raw.locationId===own.place.id&&isPrivateWildMigrationEvent(raw)?text:undefined;
    if(options.length||receipt){
      const beast=own.side==='destination'?liveBeast(world,row):undefined;
      return {side:own.side,siteName:own.place.name,weather:own.side==='origin'?row.fromWeather:row.toWeather,
        ...(beast?{localKind:beast.kind}:{}),options,...(receipt?{receipt}:{})};
    }
  }
}

export function validateWildMigrationSave(world:WorldState,fail:(path:string)=>never):void{
  const seen=new Set<string>(),responseIds=new Set<string>();
  let last=0;
  for(const row of world.wildMigrations?.records??[]){
    const from=siteBy(world,row.from.siteId),to=siteBy(world,row.to.siteId);
    const wild=beastBy(world,row.beastId);
    if(seen.has(row.id)||row.tick<last||row.tick>world.tick||row.id!==wildMigrationId(row.tick,row.beastId)||
      row.sourceEventId!==wildRoamEventId(row.tick,row.beastId)||!wild||wild.kind!==row.kind||
      !from||!to||from===to||!wildMigrationWilderness(from)||!wildMigrationWilderness(to)||
      from.type==='secret_realm'||to.type==='secret_realm'||row.from.sectId===row.to.sectId||
      !unique(world.sects,row.from.sectId)||!unique(world.sects,row.to.sectId))
      fail('wildMigrations.record');
    last=row.tick;seen.add(row.id);
    const raw=world.events.filter(source=>source.id===row.sourceEventId);
    if(raw.length>1||raw[0]&&!validRaw(world,row,raw[0]))fail('wildMigrations.source');
    const month=(world.month-1-(world.tick-row.tick)%12+12)%12;
    const season=(['春','夏','秋','冬'] as const)[Math.floor(month/3)];
    for(const {weather,stamp} of [{weather:row.fromWeather,stamp:row.from},{weather:row.toWeather,stamp:row.to}]){
      if(weather.season!==season||weather.intensity<0||weather.intensity>1||
        (weather.kind==='平息'?weather.intensity!==0:weather.intensity<.05)||
        stamp.witnessIds.some((id,i)=>!actorBy(world,id)||i>0&&stamp.witnessIds[i-1]>=id))fail('wildMigrations.stamp');
    }
    const sides=new Set<WildMigrationSide>();
    for(const response of row.responses){
      const stamp=response.side==='origin'?row.from:row.to;
      const id=idAt(row,response.tick,response.side),sources=world.events.filter(source=>source.id===id);
      const text=response.move==='drive'?sentences.destination.drive:sentences[response.side][response.move];
      const retreat=response.destinationId?siteBy(world,response.destinationId):undefined;
      const start=terrainTileAt(world,to.x,to.y),end=retreat&&terrainTileAt(world,retreat.x,retreat.y);
      const realNeighbor=retreat?.type==='spirit_vein'&&start&&end&&Math.abs(start.col-end.col)+Math.abs(start.row-end.row)===1;
      if(sides.has(response.side)||!stamp.witnessIds.includes(response.actorId)||
        response.tick<=row.tick||response.tick>row.tick+WILD_MIGRATION_RESPONSE_TICKS||response.tick>world.tick||
        (response.move==='drive'?(response.side!=='destination'||row.kind==='瑞兽'||response.paidQi!==QI||
          !response.destinationId||response.destinationId===stamp.siteId||!realNeighbor):
          response.paidQi!==0||response.destinationId!==undefined)||
        sources.length>1||sources[0]&&(!date(world,sources[0],response.tick)||!isPrivateWildMigrationEvent(sources[0])||
          sources[0].locationId!==stamp.siteId||sources[0].category!=='heavenly'||
          sources[0].actorIds.length!==1||sources[0].actorIds[0]!==response.actorId||
          sources[0].title!==text.title||sources[0].description!==text.description))fail('wildMigrations.response');
      sides.add(response.side);responseIds.add(id);
    }
  }
  for(const row of world.events)if(/^evt-\d+-wild-migration-/.test(row.id)&&!responseIds.has(row.id))fail('wildMigrations.orphan');
}
