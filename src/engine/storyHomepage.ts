import type {WorldState,WorldEvent} from '../types/world';
import {publicChronicleSceneEvents} from './chronicleLead';
import {writePublicChronicleScene} from './chroniclePublicProse';
import {projectProtagonistSuccession} from './protagonistSuccession';

export interface StoryHomepageView {
  readonly calendar:{readonly year:number;readonly month:number;readonly tick:number};
  readonly lead?:{readonly name:string};
  readonly scene?:{readonly eventId:string;readonly title:string;readonly paragraph:string;readonly earlier:boolean};
}

const importance:Record<WorldEvent['category'],number>={death:6,combat:5,breakthrough:4,diplomacy:3,heavenly:2,intrigue:1};
const visibleText=(text:string)=>text.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/gu,' ').trim();
function bounded(text:string,limit:number):string{
  const clean=visibleText(text);
  const glyphs=[...clean];
  if(glyphs.length<=limit)return clean;
  const prefix=glyphs.slice(0,limit-1).join('');
  const boundary=Math.max(prefix.lastIndexOf('。'),prefix.lastIndexOf('！'),prefix.lastIndexOf('？'));
  return boundary>=Math.floor(prefix.length*.55)?prefix.slice(0,boundary+1):prefix.trimEnd()+'…';
}

/** Select a single exact public story; earlier context is never represented as newly settled. */
export function projectStoryHomepage(world:WorldState):StoryHomepageView{
  const calendar={year:world.year,month:world.month,tick:world.tick};
  const active=projectProtagonistSuccession(world,world.tick).active;
  const earnedName=active?.name&&world.cultivators.filter(row=>row.id===active.actorId&&row.alive&&row.hp>0).length===1?
    bounded(active.name,40):undefined;
  const counts=new Map<string,number>();
  for(const event of world.events)counts.set(event.id,(counts.get(event.id)??0)+1);
  const leads=(event:WorldEvent)=>Number(!!(active&&earnedName&&event.actorIds.includes(active.actorId)));
  const candidates=publicChronicleSceneEvents(world).flatMap(fact=>{
    if(counts.get(fact.id)!==1||world.tick-fact.tick>6||
      (fact.tick===world.tick&&(fact.year!==world.year||fact.month!==world.month))||
      fact.year*12+fact.month>world.year*12+world.month)return [];
    const story=writePublicChronicleScene(fact);
    const title=bounded(story.title,48),paragraph=bounded(story.paragraph,200);
    return title&&paragraph?[{fact,eventId:fact.id,title,paragraph}]:[];
  }).sort((a,b)=>b.fact.tick-a.fact.tick||
    leads(b.fact)-leads(a.fact)||importance[b.fact.category]-importance[a.fact.category]);
  const first=candidates[0];
  return {calendar,...(first?{scene:{eventId:first.eventId,title:first.title,paragraph:first.paragraph,
    earlier:first.fact.tick<world.tick}}:{}),...(earnedName?{lead:{name:earnedName}}:{})};
}
