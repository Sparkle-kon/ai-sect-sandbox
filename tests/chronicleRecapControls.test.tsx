import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChronicleRecapControls } from '../src/components/ChronicleRecapControls';
import { captureRecapReturn,restoreRecapReturn,type RecapReaderBinding } from '../src/components/chronicleRecapPosition';
import { createInitialWorld } from '../src/data/initialWorld';

const world=createInitialWorld();
const context={world,scopeKey:'opaque-branch',viewerId:'opaque-person',chapterId:'opaque-chapter'};
const recap={rows:[{chapterId:'opaque-chapter',eventId:'opaque-event',tick:1,title:'真实转折',paragraph:'延续的一幕',
  source:'original' as const,paragraphEventIds:['opaque-event']}]};

describe('transient chapter recap control',()=>{
  it('shows only a pocket-size launcher, never hidden readback content or raw identifiers',()=>{
    const output=renderToStaticMarkup(<ChronicleRecapControls {...context} recap={recap} readerRef={createRef<HTMLElement>()}/>);
    expect(output).toContain('本卷小回顾');
    expect(output).toContain('min-h-11');
    expect(output).toContain('aria-haspopup="dialog"');
    expect(output).not.toMatch(/<dialog|真实转折|延续的一幕|opaque-/u);
    expect(renderToStaticMarkup(<ChronicleRecapControls {...context} recap={{rows:[]}} readerRef={createRef<HTMLElement>()}/>)).toBe('');
  });
});

function page(insideNote=false) {
  const scrollBy=vi.fn(),focus=vi.fn(),focusHeading=vi.fn();
  let top=42;
  const anchor={isConnected:true,textContent:'原段落',getBoundingClientRect:()=>({top,bottom:top+44})};
  const note=insideNote?{previousElementSibling:{querySelector:()=>anchor}}:null;
  const launcher={isConnected:true,focus,closest:(selector:string)=>selector==='aside'?note:null};
  const heading={focus:focusHeading,hasAttribute:()=>true};
  const reader={isConnected:true,
    contains:(node:unknown)=>[anchor,launcher,heading].includes(node as typeof anchor),
    ownerDocument:{activeElement:launcher,defaultView:{innerHeight:680,scrollBy}},
    querySelectorAll:()=>[anchor],querySelector:()=>heading,
  } as unknown as HTMLElement;
  return {reader,anchor,focus,focusHeading,scrollBy,layout:(y:number)=>{top=y;}};
}

describe('relative reader return without delayed scope writes',()=>{
  it('restores viewport relative to the same paragraph when narrow layout reflows, and returns exact focus',()=>{
    const pageView=page();
    const saved=captureRecapReturn(pageView.reader,context);
    pageView.layout(91);
    expect(restoreRecapReturn(saved,pageView.reader,context)).toBe(true);
    expect(pageView.scrollBy).toHaveBeenCalledWith({top:49,behavior:'instant'});
    expect(pageView.focus).toHaveBeenCalledWith({preventScroll:true});
  });

  it('keeps the associated source paragraph if the prior focus was inside its proof note',()=>{
    const pageView=page(true);
    pageView.layout(-90);
    const saved=captureRecapReturn(pageView.reader,context);
    expect(saved.anchor).toBe(pageView.anchor);
    pageView.layout(-55);
    expect(restoreRecapReturn(saved,pageView.reader,context)).toBe(true);
    expect(pageView.scrollBy).toHaveBeenCalledWith({top:35,behavior:'instant'});
    expect(pageView.focus).toHaveBeenCalledWith({preventScroll:true});
  });

  it('rejects stale branch, viewer, chapter, snapshot, detached or altered paragraph',()=>{
    const pageView=page();
    const saved=captureRecapReturn(pageView.reader,context);
    for(const other of [
      {...context,scopeKey:'sibling'},
      {...context,viewerId:'other'},
      {...context,chapterId:'other'},
      {...context,world:structuredClone(world)},
    ] satisfies RecapReaderBinding[])expect(restoreRecapReturn(saved,pageView.reader,other)).toBe(false);
    pageView.anchor.textContent='换了原文';
    expect(restoreRecapReturn(saved,pageView.reader,context)).toBe(false);
    pageView.anchor.textContent='原段落';
    pageView.anchor.isConnected=false;
    expect(restoreRecapReturn(saved,pageView.reader,context)).toBe(false);
    expect(pageView.scrollBy).not.toHaveBeenCalled();
    expect(pageView.focus).not.toHaveBeenCalled();
  });
});
