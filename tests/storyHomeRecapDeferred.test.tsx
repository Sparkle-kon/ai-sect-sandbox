import {renderToStaticMarkup} from 'react-dom/server';
import {createRef} from 'react';
import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import StoryHomeRecap from '../src/components/StoryHomeRecap';

const calls=vi.hoisted(()=>({imports:0}));
vi.mock('../src/engine/storyRecap',()=>{
  calls.imports++;
  return {projectStoryRecap:()=>{throw new Error('must not load before open');}};
});

describe('first-screen recap has only a light launcher',()=>{
  it('does not import or project old material at opening load',()=>{
    const world=createInitialWorld(1);
    world.chronicleArchive.chapters.length=1;
    const html=renderToStaticMarkup(<StoryHomeRecap world={world} scopeKey="root" readerRef={createRef()}/>);
    expect(html).toContain('本卷小回顾');
    expect(html).not.toMatch(/<dialog|正在翻阅|可回顾的见闻/);
    expect(calls.imports).toBe(0);
  });
  it('omits the launcher without chapter metadata',()=>{
    const world=createInitialWorld(1);
    expect(renderToStaticMarkup(<StoryHomeRecap world={world} scopeKey="root" readerRef={createRef()}/>)).toBe('');
    expect(calls.imports).toBe(0);
  });
});
