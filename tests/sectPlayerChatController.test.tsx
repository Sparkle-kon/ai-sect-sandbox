import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import {llmScheduler} from '../src/engine/llmScheduler';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {readTimelineSnapshot} from '../src/engine/timelineEngine';
import type {SectPlayerChatDraft} from '../src/types/sectPlayerChat';

const noop=()=>{};
const draft:SectPlayerChatDraft={roomId:'jiuzhou',identity:'passing_senior',
  body:{kind:'free',text:'诸位莫急，一炷香也够煮半壶茶。'}};

function managedController(withModel=false){
  const opening=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!opening?.sectManagement)throw new Error('Expected managed world');
  let stage=0,controller:ReturnType<typeof useWorldSimulationController>|undefined;
  function Harness(){
    const current=useWorldSimulationController({
      playbackEnabled:false,inspectCampaign:false,onActivate:noop,onHistoricalPreview:noop,onPreviewContextChange:noop,
    });
    controller=current;
    if(stage===0){
      stage++;
      if(!opening||!current.replaceWorld(opening,current.authority.current,current.saveContextVersion.current))
        throw new Error('Expected native sect opening');
    }else if(stage===1&&withModel){
      stage++;
      current.changeLlmConfig({enabled:false,sectChatEnabled:true,apiBaseUrl:'https://play-chat-controller.invalid/v1',
        apiKey:'not-active-mock-key',model:'mock-parser'});
    }
    return <output data-ready={current.authority.current===opening}/>;
  }
  renderToStaticMarkup(<Harness/>);
  if(!controller)throw new Error('Expected mounted controller');
  return {controller,opening};
}

it('ties a chat preview to this exact live frame and only commits the accepted persona once',async()=>{
  const {controller,opening}=managedController();
  const option=await controller.sectPlayerPosting.prepare(opening,draft);
  if(!option)throw new Error('Expected a genuine alias speech preview');
  expect(controller.authority.current).toBe(opening);
  expect(opening.sectManagement?.playerChat).toBeUndefined();
  expect(await controller.sectPlayerPosting.send(opening,{...option})).toBe(false);
  const [one,two]=await Promise.all([
    controller.sectPlayerPosting.send(opening,option),controller.sectPlayerPosting.send(opening,option),
  ]);
  expect([one,two]).toEqual([true,false]);
  const settled=controller.authority.current;
  expect(settled.tick).toBe(opening.tick);
  expect(settled.random).toEqual(opening.random);
  expect(settled.sectManagement?.playerChat?.months.at(-1)?.posts).toHaveLength(1);
  expect(settled.sectManagement?.playerChat?.months.at(-1)?.posts[0]).toMatchObject({
    roomId:'jiuzhou',identity:'passing_senior',body:draft.body,intent:{kind:'chat'},
  });
  expect(readTimelineSnapshot(controller.history.current,opening.tick)?.sectManagement?.playerChat)
    .toEqual(settled.sectManagement?.playerChat);
});

it('aborts a late optional parser after reset and never turns a suggestion into a post',async()=>{
  llmScheduler.resetTickBudget();
  let release:((response:Response)=>void)|undefined, requestSignal:AbortSignal|null|undefined;
  let selected='chat';
  const transport=vi.fn(async (_url:RequestInfo|URL,init?:RequestInit)=>{
    requestSignal=init?.signal;
    const wire=JSON.parse(String(init?.body)) as {messages:readonly {role:string;content:string}[]};
    const user=wire.messages.find(message=>message.role==='user');
    if(!user)throw new Error('Expected public prompt');
    const parsed=JSON.parse(user.content) as {options:readonly {optionId:string;intent:string}[]};
    selected=parsed.options.find(row=>row.intent==='recruit_ad')?.optionId??selected;
    return new Promise<Response>(resolve=>{release=resolve;});
  });
  vi.stubGlobal('fetch',transport);
  try{
    const {controller,opening}=managedController(true);
    const pending=controller.sectPlayerPosting.prepare(opening,{...draft,body:{kind:'free',text:'本宗今招新弟子。'}},true);
    await vi.waitFor(()=>expect(transport).toHaveBeenCalledOnce(),{timeout:2000});
    expect(controller.authority.current).toBe(opening);
    controller.handleReset();
    expect(requestSignal?.aborted).toBe(true);
    release?.(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({optionId:selected})}}]})));
    expect(await pending).toBeUndefined();
    expect(controller.authority.current).not.toBe(opening);
    expect(controller.authority.current.sectManagement?.playerChat).toBeUndefined();
    expect(controller.history.current.branches[0].snapshots).toHaveLength(1);
  }finally{
    vi.unstubAllGlobals();
    llmScheduler.resetTickBudget();
  }
});
