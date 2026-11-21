import type {Cultivator,WorldState} from '../types/world';
import {sameCampaignStopCondition,validCampaignStopCondition,type CampaignStopCondition} from '../engine/campaignStopCondition';
import {createTerrainMapView} from './terrainMapView';

export interface CampaignStopOption {readonly condition:CampaignStopCondition;readonly label:string}
const clean=(label:string)=>label.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu,' ').replace(/\s+/gu,' ').trim();

export function visibleCampaignStopOptions(world:WorldState,viewer?:Cultivator):CampaignStopOption[]{
  if(!viewer?.alive||viewer.hp<=0||!world.cultivators.includes(viewer))return [];
  const map=createTerrainMapView(world,viewer,true);
  const publicSites=map.seenLocations.filter(({type})=>type!=='secret_realm'&&type!=='abyss');
  const known=new Set(publicSites.map(({id})=>id));
  const build:CampaignStopOption[]=[];
  const add=(condition:CampaignStopCondition,label:string)=>{
    const safe=clean(label);
    if(safe&&validCampaignStopCondition(world,condition))build.push({condition,label:safe});
  };
  for(const sect of world.sects){
    if(sect.leaderId&&(sect.id===viewer.sectId||known.has(sect.headquartersId)))add({kind:'sect_leader_changed',sectId:sect.id,
      initialLeaderId:sect.leaderId},sect.name);
  }
  for(const actor of map.liveActors){
    if(actor.id!==viewer.id&&!map.trailPositions.has(actor.id)&&!known.has(actor.locationId))continue;
    add({kind:'actor_died',actorId:actor.id},`${actor.name} · ${actor.realm}${actor.realmStage} 层`);
  }
  for(const site of publicSites)add({kind:'site_owner_changed',siteId:site.id},site.name);
  const total=new Map<string,number>(),seen=new Map<string,number>();
  for(const row of build){
    const key=JSON.stringify([row.condition.kind,row.label]);
    total.set(key,(total.get(key)??0)+1);
  }
  return build.map(row=>{
    const key=JSON.stringify([row.condition.kind,row.label]);
    if((total.get(key)??0)<2)return row;
    const ordinal=(seen.get(key)??0)+1;seen.set(key,ordinal);
    return {...row,label:`${row.label}（同名 ${ordinal}）`};
  });
}

export const findVisibleCampaignStopOption=(options:readonly CampaignStopOption[],condition?:CampaignStopCondition)=>
  condition&&options.find(row=>sameCampaignStopCondition(row.condition,condition));
