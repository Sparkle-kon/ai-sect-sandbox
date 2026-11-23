// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {ChronicleFeed} from '../src/components/ChronicleFeed';
import {App} from '../src/App';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {marketClosureReason} from '../src/engine/marketEngine';
import {projectSectChat} from '../src/engine/sectChat';
import {encodeWorldSave} from '../src/engine/storageEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {publicChronicleSceneEvents} from '../src/engine/chronicleLead';

it('opens and focuses the exact native public detail, never a stale or sealed source',async()=>{
  const next=advanceWorldTick(createInitialWorld(13071));
  const native=publicChronicleSceneEvents(next);
  const selected=native[1]??native[0];
  if(!selected)throw Error('Expected a genuine public record after a native world month');
  const privateRecord={...selected,id:`private-${selected.id}`,title:'不可外传的一封短笺',witnessScope:'participants' as const};
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),opened=vi.fn();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const paint=(eventId:string,token:number)=>act(async()=>root.render(
    <ChronicleFeed events={[...native,privateRecord]} sourceOpening={{eventId,token}} onSourceOpened={opened}/>));
  try{
    await paint(selected.id,1);
    expect(opened).toHaveBeenCalledWith(1);expect(opened).toHaveBeenCalledTimes(1);
    const records=[...host.querySelectorAll<HTMLDetailsElement>('details[open]')];
    expect(records).toHaveLength(1);
    expect(records[0].textContent).toContain(selected.title);
    expect(document.activeElement?.closest('details')).toBe(records[0]);
    await paint(privateRecord.id,2);
    await paint('evt-aged-out',3);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain(privateRecord.title);
  }finally{
    await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
  }
});


it('follows a real public chat message from the managed phone panel to its exact chronicle record',async()=>{
  let world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
  const wang=world.sectManagement?.debt?.creditorId;
  if(!wang)throw Error('Expected Wang in the native managed game');
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'先在原处。'};
  const orders=(source:WorldState,forWang:LLMDecisionPayload=rest):Record<string,LLMDecisionPayload>=>Object.fromEntries(
    source.cultivators.map(actor=>[actor.id,actor.id===wang?forWang:rest]));
  for(let i=0;i<10&&marketClosureReason({...world,tick:world.tick+1},'loc-market');i++)world=advanceWorldTick(world,orders(world));
  const next=advanceWorldTick(world,orders(world,{
    chosenAction:'PLACE_MARKET_BUY',marketGood:'jade_leaf',marketQuantity:1,marketLimitPrice:11,innerMonologue:'照坊市的规矩挂一份买单。',
  }));
  const rooms=projectSectChat(next);
  const matching=rooms.flatMap(room=>room.posts.flatMap(message=>{
    const fact=next.events.find(row=>row.id===message.sourceEventId&&row.tick===next.tick&&row.id.includes('-market-order-'));
    return fact?[{room,message,fact}]:[];
  }))[0];
  if(!matching)throw Error('No scoped, actionable market chat message for the actual order');
  const raw=encodeWorldSave(next);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  async function when(condition:()=>boolean){
    for(let i=0;i<40&&!condition();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
    expect(condition()).toBe(true);
  }
  async function press(scope:ParentNode,selector:string,label:string){
    const control=[...scope.querySelectorAll<HTMLElement>(selector)].find(row=>row.textContent?.includes(label));
    if(!control)throw Error('Missing control '+label);
    await act(async()=>control.click());
  }
  try{
    await act(async()=>root.render(<App initialMode="sect"/>));
    await press(host,'summary','更多');
    await press(host,'button','读档');
    const inputSelector='input[type="file"][accept=".json,application/json"]';
    await when(()=>!!host.querySelector(inputSelector));
    const file=new File([raw],'山门来信.json',{type:'application/json'});
    Object.defineProperty(file,'text',{value:async()=>raw});
    const input=host.querySelector<HTMLInputElement>(inputSelector)!;
    Object.defineProperty(input,'files',{configurable:true,value:[file]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    await when(()=>[...host.querySelectorAll('button')].some(row=>row.textContent?.includes('确认执行')));
    await press(host,'button','确认执行');
    await when(()=>!!host.querySelector('[data-sect-chat]'));
    const panel=host.querySelector('[data-sect-chat]')!;
    await press(panel,'button[aria-expanded]','仙门群聊');
    await press(panel,'[aria-label="选择群聊"] button',matching.room.label);
    await press(panel,'[data-sect-chat-message] button',matching.message.text);
    await when(()=>Array.from(host.querySelectorAll('details[open]')).some(section=>section.textContent?.includes(matching.fact.title)));
    expect(document.activeElement?.closest('details')?.textContent).toContain(matching.fact.title);
    expect(encodeWorldSave(next)).toBe(raw);
  }finally{
    await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
  }
},12000);
