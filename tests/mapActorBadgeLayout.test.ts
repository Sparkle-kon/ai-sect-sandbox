import {describe,expect,it} from 'vitest';
import {planMapActorBadgeLayout} from '../src/components/mapActorBadgeLayout';
import type {MapActorBadgeFact} from '../src/components/mapActorBadgeView';
import type {MapActorMarker} from '../src/components/mapActorClusters';
import {createInitialWorld} from '../src/data/initialWorld';

const original=createInitialWorld().cultivators[0];
const solo=(key:string,x:number,y:number,selected=false):MapActorMarker=>({
  kind:'actor',key,x,y,selected,mouseRadius:10,point:{actor:{...original,id:key},x:x*3,y:y*3},
});
const number=(value:string)=>Array.from(value).length*12;
const facts=(...rows:MapActorBadgeFact[])=>new Map(rows.map(row=>[row.actorId,row]));
const card=(actorId:string,quote:string,statuses:MapActorBadgeFact['statuses']=[]):MapActorBadgeFact=>({actorId,quote,statuses});
const small={width:390,height:234};

describe('decorative actor badge layout uses only the actual painted CSS anchors',()=>{
  it('never creates an individual hint from a cluster, duplicate key, stale ID, or unseen fact',()=>{
    const markers=[solo('actual',72,90),solo('duplicate',180,80),solo('duplicate',190,82),
      solo('wrong',260,120),solo('outside',400,170),{kind:'cluster' as const,key:'crowd',x:330,y:50,ids:['hidden','grouped']},
      solo('grouped',90,150)];
    const rows=facts(card('actual','远山有灵气',['ready','ready']),card('duplicate','歧义人物',['critical']),
      card('hidden','群中私语',['heart-demon']),card('grouped','不应拆团',['heart-demon']),card('outside','图外不见',['critical']));
    rows.set('wrong',card('another','错位词条',['critical']));
    const before=structuredClone(markers);
    const laid=planMapActorBadgeLayout(markers,rows,small,null,number);
    expect(laid.badges.map(x=>x.kind)).toEqual(['ready']);
    expect(laid.bubbles).toHaveLength(1);
    expect(laid.bubbles[0]).toMatchObject({lines:['远山有灵气'],anchor:{x:72,y:90}});
    expect(markers).toEqual(before);
  });

  it('prioritizes exact selected, then heart demon, then stable ASCII IDs and applies a CSS-width bubble cap',()=>{
    const a=solo('a',100,85),z=solo('z',280,185,true),heart=solo('m',250,70);
    const rows=facts(card('a','正路在前',['ready']),card('z','山河在望',['ready']),card('m','此间有魔念',['heart-demon']));
    expect(planMapActorBadgeLayout([heart,a,z],rows,small,'z',number).bubbles.map(x=>x.anchor)).toEqual([{x:280,y:185}]);
    const width={width:640,height:300};
    const first=planMapActorBadgeLayout([z,a,heart],rows,width,'z',number);
    expect(first.bubbles.map(x=>x.anchor)).toEqual([{x:280,y:185},{x:250,y:70}]);
    expect(planMapActorBadgeLayout([heart,a,z],rows,width,'z',number)).toEqual(first);
    const ascii=facts(card('Z','先者在此'),card('a','后来之人'));
    expect(planMapActorBadgeLayout([a,solo('Z',240,170)],ascii,small,null,number).bubbles[0].lines).toEqual(['先者在此']);
  });

  it('fits/clips measured CJK to 1–2 lines with ellipsis and keeps the visible shape clear of edges',()=>{
    for(const width of [360,390]){
      const viewport={width,height:216};
      const actor=solo('actual',width-2,5);
      const quote='纵使九重劫云漫卷而来我也当以此剑守住这片山河与天下同道并肩';
      const result=planMapActorBadgeLayout([actor],facts(card('actual',quote,['critical'])),viewport,'actual',number);
      const box=result.bubbles[0];
      expect(box.lines).toHaveLength(2);
      expect(box.lines[1].endsWith('…')).toBe(true);
      expect(quote.startsWith(box.lines.join('').slice(0,-1))).toBe(true);
      expect(box.width).toBeLessThanOrEqual(164);
      expect(box.x+box.width).toBeLessThanOrEqual(width-4);
      expect(box.y).toBeGreaterThanOrEqual(4);
      expect(box.anchor).toEqual({x:width-2,y:5});
    }
  });

  it('rejects a bubble obstructed by painted dots and reserves their collision space even without badge facts',()=>{
    const actor=solo('actual',100,89);
    const many=[actor,
      {kind:'cluster' as const,key:'above',x:100,y:43,ids:['above']},
      {kind:'cluster' as const,key:'below',x:100,y:137,ids:['below']},
      solo('at-top',100,20),solo('at-bottom',100,160),
      solo('upper-right',120,80),solo('upper-left',80,80),solo('lower-right',120,98),solo('lower-left',80,98),
    ];
    const result=planMapActorBadgeLayout(many,facts(card('actual','绝不盖住已有地图节点',['ready'])),
      {width:200,height:178},null,number);
    expect(result.bubbles).toEqual([]);
    expect(result.badges).toEqual([]);
    expect(planMapActorBadgeLayout([actor],facts(card('actual','可信字句')),small,null,()=>NaN).bubbles).toEqual([]);
  });
});
