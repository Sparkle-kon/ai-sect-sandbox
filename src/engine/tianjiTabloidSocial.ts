import {SECT_PLAYER_CHAT_POST_LIMIT,sectPlayerChatPostId} from '../types/sectPlayerChat';
import {TIANJI_TABLOID_SPEAKERS,type TianjiTabloidAdvertisement,type TianjiTabloidHotTopic} from '../types/tianjiGazette';
import type {WorldState} from '../types/world';
import {quotePublicSectChatEvents} from './sectChat';
import {tianjiGazetteVenue} from './tianjiGazetteTerms';

const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function unique<T>(rows:readonly T[],matches:(row:T)=>boolean):T|undefined{
  const result=rows.filter(matches);
  return result.length===1?result[0]:undefined;
}

function hotspots(world:WorldState,from:number,through:number){
  const topics=new Map<string,TianjiTabloidHotTopic>();
  for(const {event,post} of quotePublicSectChatEvents(world,from,through)){
    const {roomId,senderId}=post;
    const siteId=event.locationId,site=siteId?unique(world.locations,row=>row.id===siteId):undefined;
    if((roomId!=='jiuzhou'&&roomId!=='market')||event.tick<from||event.tick>through||!siteId||!tianjiGazetteVenue(site))continue;
    const key=JSON.stringify([roomId,event.id]);
    const topic=topics.get(key)??{sourceEventId:event.id,tick:event.tick,year:event.year,month:event.month,siteId,roomId,speakerIds:[],speakerCount:0};
    if(!topic.speakerIds.includes(senderId)){topic.speakerIds.push(senderId);topic.speakerCount++};
    topics.set(key,topic);
  }
  return [...topics.values()].filter(topic=>topic.speakerIds.length>=2).sort((a,b)=>
    b.speakerIds.length-a.speakerIds.length||b.tick-a.tick||compare(a.sourceEventId,b.sourceEventId)||compare(a.roomId,b.roomId));
}

/** Only canonical, settled quick recruitment from the real public leader account may be reprinted. */
function advertisements(world:WorldState,from:number,through:number){
  const management=world.sectManagement,state=management?.playerChat;
  if(!management||!state)return [];
  const sect=unique(world.sects,row=>row.id===management.sectId);
  const site=sect&&unique(world.locations,row=>row.id===sect.headquartersId);
  if(!sect||!tianjiGazetteVenue(site))return [];
  const ads:TianjiTabloidAdvertisement[]=[];
  for(const month of state.months){
    const tick=month.tick;
    if(!Number.isSafeInteger(tick)||tick<management.foundedTick||tick<from||tick>through||tick>world.tick||
      !unique(state.months,row=>row.tick===tick)||month.usedEffects.filter(effect=>effect==='recruit_ad').length!==1||
      !Number.isSafeInteger(month.usedSlots)||month.usedSlots<1||month.usedSlots>SECT_PLAYER_CHAT_POST_LIMIT)continue;
    const ad=unique(month.posts,post=>post.intent.kind==='recruit_ad');
    const marker=state.recruitAd;
    if(!ad||ad.tick!==tick||ad.identity!=='leader'||ad.roomId!=='jiuzhou'||ad.body.kind!=='quick'||
      ad.body.preset!=='recruit_ad'||ad.body.optionId!=='recruit_ad'||!unique(month.posts,post=>post.id===ad.id)||
      !Array.from({length:month.usedSlots},(_,index)=>sectPlayerChatPostId(tick,index)).includes(ad.id)||
      world.tick<=tick+1&&(!marker||marker.postedTick<tick||marker.targetTick!==marker.postedTick+1))continue;
    ads.push({postId:ad.id,postedTick:tick,sectId:sect.id,siteId:sect.headquartersId});
  }
  return ads.sort((a,b)=>b.postedTick-a.postedTick||compare(a.postId,b.postId));
}

export function collectTabloidSocial(world:WorldState,from:number,through:number):{
  hotspot?:TianjiTabloidHotTopic;advertisement?:TianjiTabloidAdvertisement;
}{
  const top=hotspots(world,from,through)[0],advertisement=advertisements(world,from,through)[0];
  return {...(top?{hotspot:{...top,speakerIds:top.speakerIds.sort(compare).slice(0,TIANJI_TABLOID_SPEAKERS)}}:{}),
    ...(advertisement?{advertisement}:{})};
}

export function isTabloidHotspotProven(world:WorldState,record:TianjiTabloidHotTopic,from:number,through:number):boolean{
  if(record.speakerIds.length<2||record.speakerIds.length>TIANJI_TABLOID_SPEAKERS||
    record.speakerIds.some((id,index)=>index>0&&compare(record.speakerIds[index-1],id)>=0))return false;
  return hotspots(world,from,through).some(row=>row.speakerCount===record.speakerCount&&row.roomId===record.roomId&&row.sourceEventId===record.sourceEventId&&
    row.siteId===record.siteId&&row.tick===record.tick&&row.year===record.year&&row.month===record.month&&
    record.speakerIds.length===Math.min(row.speakerIds.length,TIANJI_TABLOID_SPEAKERS)&&
    row.speakerIds.sort(compare).slice(0,TIANJI_TABLOID_SPEAKERS).every((id,index)=>id===record.speakerIds[index]));
}
export function isTabloidAdvertisementProven(world:WorldState,record:TianjiTabloidAdvertisement):boolean{
  return advertisements(world,record.postedTick,record.postedTick).some(row=>row.postId===record.postId&&
    row.sectId===record.sectId&&row.siteId===record.siteId);
}
