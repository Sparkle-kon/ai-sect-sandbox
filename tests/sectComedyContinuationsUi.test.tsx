// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SectComedyContinuations,type SectComedyChoiceAction} from '../src/components/SectComedyContinuations';
import {applySectComedyChoice} from '../src/engine/sectComedyContinuations';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

it('the real sequel shows a working option, its concrete effect and no second round of choices',async()=>{
  const origin=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
  const actorId=origin.sectManagement!.foundingDiscipleIds[0];
  origin.cultivators.find(row=>row.id===actorId)!.quirks=['glutton','lost'];
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且留原处。'};
  const turn=(world:WorldState,first=false)=>advanceWorldTick(world,
    Object.fromEntries(world.cultivators.filter(row=>!first||row.id!==actorId).map(row=>[row.id,rest])),
    ()=>.62,'utility',undefined,{capturePresentation:false,captureTrace:false,
      ...(first?{sectJobAssignments:[{discipleId:actorId,jobId:'gather'} as const]}:{})});
  let world=turn(origin,true);
  const sequel=world.sectManagement?.comedy?.pending?.find(row=>row.kind==='sequel'&&row.templateId==='the-wok');
  if(!sequel)throw Error('Expected the genuine wok receipt');
  while(world.tick<sequel.dueTick)world=turn(world);

  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div'),root=createRoot(host);
  const choose:SectComedyChoiceAction=(expected,command)=>{
    if(expected!==world)return false;
    const next=structuredClone(expected);
    if(!applySectComedyChoice(next,command))return false;
    world=next;
    root.render(<SectComedyContinuations world={world} busy={false} action={choose}/>);
    return true;
  };
  try{
    await act(async()=>root.render(<SectComedyContinuations world={world} busy={false} action={choose}/>));
    const buttons=[...host.querySelectorAll('button')];
    expect(buttons).toHaveLength(3);
    const recipe=buttons.find(button=>button.textContent?.includes('炖肉谱'));
    expect(recipe?.disabled).toBe(false);
    await act(async()=>recipe?.click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain('收到十二枚灵石');
    expect(host.querySelector('[aria-label="小插曲的得失"]')?.textContent).toContain('公库灵石 +12');
    expect(host.querySelectorAll('button')).toHaveLength(0);
  }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
