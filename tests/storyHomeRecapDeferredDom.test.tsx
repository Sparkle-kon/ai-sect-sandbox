// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {act,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {createInitialWorld} from '../src/data/initialWorld';
import {ChronicleRecapControls} from '../src/components/ChronicleRecapControls';
import type {StoryRecapView} from '../src/engine/storyRecap';
const old:StoryRecapView={rows:[{eventId:'old',tick:1,title:'旧章',paragraph:'绝不可在开卷前露出的旧段。',source:'original',chapterId:'one',paragraphEventIds:['old']}]};
it.each([360,390])('keeps closed material and same-scope native focus at %ipx DOM width',async(width)=>{
  const w=window;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('innerWidth',width);
  w.document.body.innerHTML='<main id="root"></main><button id="outside">场外</button>';
  const showModal=Object.getOwnPropertyDescriptor(w.HTMLDialogElement.prototype,'showModal');
  const closeModal=Object.getOwnPropertyDescriptor(w.HTMLDialogElement.prototype,'close');
  Object.defineProperty(w.HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
  Object.defineProperty(w.HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
  const root=createRoot(w.document.querySelector('main')!);
  const world=createInitialWorld(1),sibling=createInitialWorld(2);
  let calls=0;
  const pending:{resolve?:(value:StoryRecapView|undefined)=>void}={};
  const loadRecap=()=>{calls++;return new Promise<StoryRecapView|undefined>(done=>{pending.resolve=done});};
  function Reader({branch}:{branch:string}){
    const ref=useRef<HTMLElement>(null);
    return <article ref={ref}><h2 data-chronicle-reader-heading>眼前一幕</h2><p><span data-chronicle-paragraph-text>这才是当月原段。</span></p>
      <button id="proof">原段注脚</button><ChronicleRecapControls loadRecap={loadRecap}
        readerRef={ref} world={branch==='A'?world:sibling} scopeKey={branch} chapterId="one" viewerId={branch}/></article>;
  }
  try {
    await act(async()=>root.render(<Reader branch="A"/>));
    expect(calls).toBe(0);
    expect(w.document.body.textContent??'').not.toMatch(/绝不可/);
    const opener=w.document.querySelector<HTMLButtonElement>('button[aria-haspopup=dialog]')!;
    const proof=w.document.getElementById('proof')!;
    proof.focus();
    const pointer=new w.MouseEvent('pointerdown',{bubbles:true,button:0});
    Object.defineProperty(pointer,'isPrimary',{value:true});
    opener.dispatchEvent(pointer);
    opener.focus();
    await act(async()=>opener.dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:1})));
    expect(calls).toBe(1);
    const dialog=w.document.querySelector('dialog')!;
    expect(w.document.activeElement).toBe(dialog.querySelector('h4'));
    await act(async()=>{pending.resolve?.(old)});
    expect(dialog.textContent??'').toMatch(/绝不可/);
    await act(async()=>dialog.dispatchEvent(new w.Event('cancel',{cancelable:true,bubbles:false})));
    expect(w.document.activeElement).toBe(proof);
    expect(w.document.querySelector('dialog')).toBe(null);
    opener.focus();
    await act(async()=>opener.dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:0})));
    expect(calls).toBe(2);
    await act(async()=>w.document.querySelector('dialog')!.dispatchEvent(new w.Event('cancel',{cancelable:true})));
    expect(w.document.activeElement).toBe(opener);
    await act(async()=>opener.dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:0})));
    const late=pending.resolve;
    await act(async()=>root.render(<Reader branch="B"/>));
    const outside=w.document.getElementById('outside')!;
    outside.focus();
    await act(async()=>{late?.(old)});
    expect(w.document.activeElement).toBe(outside);
    expect(w.document.querySelector('dialog')).toBe(null);
    expect(w.document.body.textContent??'').not.toMatch(/绝不可/);
    opener.focus();
    await act(async()=>opener.dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:0})));
    await act(async()=>{pending.resolve?.(undefined);});
    expect(w.document.querySelector('dialog')?.textContent??'').toMatch(/当前没有可回顾的见闻/);
  } finally {
    await act(async()=>root.unmount());
    w.document.body.replaceChildren();
    for(const [name,original] of [['showModal',showModal],['close',closeModal]] as const){
      if(original)Object.defineProperty(w.HTMLDialogElement.prototype,name,original);
      else Reflect.deleteProperty(w.HTMLDialogElement.prototype,name);
    }
    vi.unstubAllGlobals();
  }
});
