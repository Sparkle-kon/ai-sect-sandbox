// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
import {ColdChronicleShelf} from '../src/components/ColdChronicleShelf';
import {createInitialWorld} from '../src/data/initialWorld';
import type {ChronicleAnchor,ChronicleChapter} from '../src/types/world';

function archive(name:string,readAnchors:()=>ChronicleAnchor[],tick=6):ChronicleChapter{
  return {id:`chronicle-${tick}`,chapterNumber:tick,startTick:tick-1,endTick:tick,title:name,body:`旧卷正文：${name}`,source:'utility',
    get anchors(){return readAnchors();},biographies:[]};
}

describe('cold shelf on actual opening',()=>{
  it('keeps text and source lookups off the closed shelf, and never reuses another branch’s selection',()=>{
    const main=createInitialWorld(), fork=createInitialWorld();
    main.tick=fork.tick=12;
    const provenance=vi.fn(()=>[] as ChronicleAnchor[]);
    const read=vi.fn((item:ChronicleChapter)=><p>{item.body}</p>);
    main.coldHistory={chapters:[archive('甲支旧卷',provenance),archive('未来卷',provenance,30)],droppedChapters:0};
    fork.coldHistory={chapters:[archive('乙支旧卷',provenance)],droppedChapters:0};
    const mount=document.createElement('main');
    document.body.append(mount);
    const root=createRoot(mount);
    const env=globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT?:boolean};
    const previous=env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT=true;
    const draw=(key:string,world:typeof main)=>act(()=>root.render(<ColdChronicleShelf key={key} world={world}
      chapterTitle={item=>item.title} readChapter={read}/>));
    const open=()=>{
      const target=mount.querySelector('details');
      expect(target).not.toBeNull();
      act(()=>{target!.open=true;target!.dispatchEvent(new Event('toggle'));});
    };
    try{
      draw('main',main);
      expect(mount.textContent).toContain('远纪档案 · 1 章');
      expect(mount.textContent).not.toContain('甲支旧卷');
      expect(provenance).not.toHaveBeenCalled();
      open();
      expect(provenance).toHaveBeenCalled();
      expect(mount.textContent).toContain('甲支旧卷');
      expect(mount.textContent).not.toContain('未来卷');
      expect(read).not.toHaveBeenCalled();
      act(()=>mount.querySelector<HTMLButtonElement>('ol button')!.click());
      expect(mount.textContent).toContain('旧卷正文：甲支旧卷');
      draw('fork',fork);
      expect(mount.textContent).not.toContain('甲支旧卷');
      expect(mount.textContent).not.toContain('乙支旧卷');
      open();
      expect(mount.textContent).toContain('乙支旧卷');
      expect(mount.textContent).not.toContain('旧卷正文：乙支旧卷');
    }finally{
      act(()=>root.unmount());
      mount.remove();
      env.IS_REACT_ACT_ENVIRONMENT=previous;
    }
  });
  it('keeps the opened acknowledgment when no archived prose is authorized',()=>{
    const world=createInitialWorld();
    world.tick=12;
    const privateRow={id:'evt-private-shelf-case',tick:6,year:world.year,month:1,title:'私人记录',
      description:'不公开的旧事',category:'diplomacy' as const,actorIds:['npc-1'],witnessScope:'participants' as const};
    world.events=[privateRow];
    world.coldHistory={chapters:[archive('不授予的正文',()=>[privateRow])],droppedChapters:0};
    const mount=document.createElement('main');
    document.body.append(mount);
    const root=createRoot(mount);
    const env=globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT?:boolean};
    const previous=env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT=true;
    try{
      act(()=>root.render(<ColdChronicleShelf world={world} chapterTitle={item=>item.title} readChapter={item=><p>{item.body}</p>}/>));
      const details=mount.querySelector('details')!;
      act(()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});
      expect(mount.querySelector('details')).toBe(details);
      expect(mount.textContent).toContain('当前未保留可读的远纪章目。');
      expect(mount.textContent).not.toContain('不授予的正文');
    } finally {
      act(()=>root.unmount());
      mount.remove();
      env.IS_REACT_ACT_ENVIRONMENT=previous;
    }
  });
});
