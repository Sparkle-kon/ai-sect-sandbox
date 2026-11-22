import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {HeartDemonTrialTheatre} from '../src/components/HeartDemonTrialTheatre';
import type {HeartDemonFrame,HeartDemonResult} from '../src/types/heartDemon';

const base:HeartDemonFrame={id:'private-heart-trial',actorId:'private-body',siteId:'private-location',
  openedTick:18,finalWaveEventId:'private-final-wave',evidence:{kind:'mirror'}};
const result:HeartDemonResult={choice:'wrath',origin:'player',outcome:'failed',resolvedTick:19,damage:23,
  karmaDelta:-3,masteryDelta:0,personalityBefore:'刚正',personalityAfter:'嗜血'};
function read(frame:HeartDemonFrame, likenessName?:string,busy=false){
  const onChoose=vi.fn(()=>true),onRelease=vi.fn(()=>true),onAdvance=vi.fn(()=>true),onContinue=vi.fn();
  const html=renderToStaticMarkup(<HeartDemonTrialTheatre frame={frame} actorName="岑闻溪" likenessName={likenessName}
    busy={busy} onChoose={onChoose} onRelease={onRelease} onAdvance={onAdvance} onContinue={onContinue}/>);
  for(const callback of [onChoose,onRelease,onAdvance,onContinue])expect(callback).not.toHaveBeenCalled();
  expect(html).not.toContain('private-');
  return html;
}

describe('one guided native heart-demon story stage',()=>{
  it('offers three touch choices and a neutral release, clarifying the apparent figure is illusion only',()=>{
    const bond:HeartDemonFrame={...base,evidence:{kind:'bond',role:'血仇',otherActorId:'private-apparition',
      source:{kind:'scene',eventId:'private-old-event',tick:8}}};
    const html=read(bond,'闻笛');
    expect(html).toContain('这一剑若只能让恨再活一次，你还愿意出鞘么？');
    expect(read(bond)).not.toContain('这一剑若只能让恨再活一次');
    for(const word of ['心魔劫','像极了闻笛','只是幻象，并非那人到场','斩断尘缘','以杀止杀','直面愧疚','让此人自行过劫'])
      expect(html).toContain(word);
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html.match(/min-h-12/g)).toHaveLength(3);
    expect(html).not.toContain('推进一月');
    expect(html).not.toContain('破劫成功');
  });
  it('asks about a real reflected theme without revealing a memory or treating the illusion as a witness',()=>{
    const reflection:HeartDemonFrame={...base,evidence:{kind:'reflection',theme:'community',memoryCategory:'cultivation',
      reflectionId:'private-reflection',reflectionTick:12,memoryId:'private-memory',memoryTick:11}};
    const html=read(reflection);
    expect(html).toContain('幻象质问');
    expect(html).toContain('若从此无人记得你曾伸手，那只手还伸不伸出去？');
    expect(html).not.toContain('像极了');
    expect(read(base)).toContain('走出去的那个人，还是你么？');
  });
  it('disables all decisions during work and requires exactly one deliberate native next month after queue',()=>{
    const busy=read(base,undefined,true);
    expect(busy.match(/<button[^>]*disabled=""/g)).toHaveLength(4);
    const html=read({...base,queued:{choice:'face',queuedTick:18}});
    expect(html).toContain('已记下：直面愧疚');
    expect(html).toContain('还未见结果');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('推进一月，面对心魔');
    expect(html).not.toContain('自行过劫');
  });
  it('only displays actual result amounts/character changes and has no second paid choice or next turn',()=>{
    const html=read({...base,result});
    for(const claim of ['道心未稳','反噬实损 23 点气血','气运受损','性情从刚正变为嗜血','收起这一幕'])
      expect(html).toContain(claim);
    expect(html).not.toContain('对所修功法多');
    expect(html).not.toContain('推进一月');
    expect(html).not.toContain('斩断尘缘');
  });
  it('separates relinquished guidance and interruption from a chosen outcome',()=>{
    const released=read({...base,releasedTick:18}), interrupted=read({...base,cancelledTick:19});
    expect(released).toContain('引导已经交还，此劫尚无结果');
    expect(interrupted).toContain('此劫受外力中断，没有执行新的破劫选择');
    for(const html of [released,interrupted]){
      expect(html).not.toContain('反噬');
      expect(html).not.toContain('推进一月');
      expect(html.match(/<button/g)).toHaveLength(1);
    }
  });
});
