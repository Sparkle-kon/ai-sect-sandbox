// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SectChallengePanel,type SectChallengeAnswerAction,type SectChallengeRequestAction} from '../src/components/SectChallengePanel';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {SectChallengeOffer,SectChallengeResult} from '../src/types/sectChallenge';
import type {WorldState} from '../src/types/world';

const mocks=vi.hoisted(()=>({disciples:vi.fn(),targets:vi.fn(),arena:vi.fn()}));
vi.mock('../src/engine/sectChallenges',()=>({listSectChallengeDisciples:mocks.disciples,listSectChallengeTargets:mocks.targets}));
vi.mock('../src/components/visualDuelArenaModel',()=>({projectVisualDuelArena:mocks.arena}));

function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw Error('Expected managed sect');
  const own=world.sects.find(row=>row.id===world.sectManagement?.sectId);
  const disciple=world.cultivators.find(row=>row.id===world.sectManagement?.foundingDiscipleIds[0]);
  const rival=world.sects.find(row=>row.id!==own?.id&&row.leaderId);
  const outsider=world.cultivators.find(row=>row.id===rival?.leaderId);
  const venue=world.locations.find(row=>row.id===world.sectManagement?.homeSiteId);
  if(!own||!disciple||!rival||!outsider||!venue)throw Error('Expected exact roster and venue');
  mocks.disciples.mockReturnValue([disciple]);
  mocks.targets.mockReturnValue([{sectId:rival.id,sectName:rival.name,defenderId:outsider.id,defenderName:outsider.name,
    siteId:venue.id,siteName:venue.name}]);
  const offer:SectChallengeOffer={id:`sect-challenge-inbound-${world.tick}`,createdTick:world.tick,expiresTick:world.tick+4,
    direction:'inbound',phase:'awaiting_response',challengerId:outsider.id,defenderId:disciple.id,
    challengerSectId:rival.id,defenderSectId:own.id,siteId:venue.id};
  const result:SectChallengeResult={id:offer.id,createdTick:offer.createdTick,expiresTick:offer.expiresTick,
    direction:offer.direction,challengerId:offer.challengerId,defenderId:offer.defenderId,challengerSectId:offer.challengerSectId,
    defenderSectId:offer.defenderSectId,siteId:offer.siteId,outcome:'completed',resolvedTick:world.tick+1,
    eventId:`evt-${world.tick+1}-${offer.id}-completed`,winnerId:disciple.id,loserId:outsider.id,injury:6,reputationMoved:1};
  const update=(challenges:NonNullable<NonNullable<WorldState['sectManagement']>['challenges']>,tick=world.tick):WorldState=>({
    ...world,tick,month:world.month+tick-world.tick,sectManagement:{...world.sectManagement!,challenges},
  });
  return {world,own,disciple,rival,outsider,venue,offer,result,update};
}
function mount(){
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  return {host,render:(markup:JSX.Element)=>act(async()=>root.render(markup)),
    cleanup:async()=>{await act(async()=>root.unmount());host.remove();}};
}
function button(host:ParentNode,name:string){
  const found=[...host.querySelectorAll('button')].find(row=>row.textContent===name);
  if(!found)throw Error(`Missing ${name}`);
  return found;
}
const click=(node:HTMLButtonElement)=>act(async()=>node.click());
const select=(node:HTMLSelectElement,value:string)=>act(async()=>{
  node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));
});
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  mocks.arena.mockReturnValue(undefined);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

it('opens a compact opt-in composer with exact disciple, venue and consent before sending',async()=>{
  const {world,disciple,rival,outsider,venue}=fixture(),{host,render,cleanup}=mount();
  const send=vi.fn<SectChallengeRequestAction>().mockResolvedValue(true);
  try{
    await render(<SectChallengePanel world={world} busy={false} onRequest={send}/>);
    expect(host.querySelector('select')).toBeNull();
    await click(button(host,'递踢馆帖'));
    const person=host.querySelector('select');
    if(!person)throw Error('Missing disciple field');
    expect(button(host,'送出踢馆帖').disabled).toBe(true);
    await select(person,disciple.id);
    const venuePicker=host.querySelectorAll('select')[1];
    if(!venuePicker)throw Error('Missing target field');
    await select(venuePicker,rival.id);
    expect(host.textContent).toContain(`约在${venue.name}，请${outsider.name}应战。回帖应允后才动身。`);
    expect(send).not.toHaveBeenCalled();
    await click(button(host,'送出踢馆帖'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(world,disciple.id,rival.id);
    expect(host.textContent).toContain('帖子已递出，等对方回话。');
  }finally{await cleanup();}
});

it('binds inbound reply to the exact offer, rejects duplicate clicks, and does not show an old failure',async()=>{
  const {offer,update}=fixture(),{host,render,cleanup}=mount();
  const inbound=update({pending:offer,history:[]});
  const traveling=update({pending:{...offer,phase:'traveling'},history:[]},offer.createdTick+1);
  let complete:((ok:boolean)=>void)|undefined;
  const answer=vi.fn<SectChallengeAnswerAction>().mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  try{
    await render(<SectChallengePanel world={inbound} busy={false} onAnswer={answer}/>);
    expect(host.textContent).toContain('对方等候回帖');
    const accept=button(host,'应战');
    expect(accept.className).toContain('min-h-11');
    await act(async()=>{accept.click();accept.click();});
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith(inbound,offer.id,true);
    await render(<SectChallengePanel world={traveling} busy={false} onAnswer={answer}/>);
    await act(async()=>complete?.(false));
    expect(host.textContent).toContain('尚未比试');
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect([...host.querySelectorAll('button')].some(row=>row.textContent==='应战')).toBe(false);
  }finally{await cleanup();}
});

it('only shows factual results and opens the original admitted arena on demand',async()=>{
  const {disciple,outsider,venue,offer,result,update}=fixture(),{host,render,cleanup}=mount();
  const base={id:offer.id,createdTick:offer.createdTick,expiresTick:offer.expiresTick,direction:offer.direction,
    challengerId:offer.challengerId,defenderId:offer.defenderId,challengerSectId:offer.challengerSectId,
    defenderSectId:offer.defenderSectId,siteId:offer.siteId,resolvedTick:result.resolvedTick};
  try{
    const refused=update({history:[{...base,outcome:'refused'}]},result.resolvedTick);
    await render(<SectChallengePanel world={refused} busy={false}/>);
    expect(host.textContent).toContain('未有比试');
    expect(host.textContent).not.toContain('胜出');
    const accepted=update({history:[result]},result.resolvedTick);
    mocks.arena.mockReturnValue({key:result.eventId,kind:'sect_challenge',siteId:venue.id,siteName:venue.name,
      tick:result.resolvedTick,theme:'countryside',season:'spring',historical:false,
      left:{id:outsider.id,name:outsider.name},right:{id:disciple.id,name:disciple.name},damages:[],outcome:'right'});
    await render(<SectChallengePanel world={accepted} busy={false}/>);
    expect(mocks.arena.mock.lastCall?.[2]).toEqual({kind:'sect_challenge',eventId:result.eventId});
    expect(host.textContent).toContain(`${disciple.name}胜出。${outsider.name}受伤，气血 -6。`);
    expect(host.textContent).toContain('名望 +1');
    expect(host.querySelector('[data-visual-duel-arena]')).toBeNull();
    await click(button(host,'看斗法'));
    expect(host.querySelector('[data-visual-duel-arena] canvas')).not.toBeNull();
  }finally{await cleanup();}
});
