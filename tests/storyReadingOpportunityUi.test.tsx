// @vitest-environment jsdom
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {ApprenticeshipReunionStoryCard} from '../src/components/ApprenticeshipReunionStoryCard';
import {BattlefieldAftermathStoryCard} from '../src/components/BattlefieldAftermathStoryCard';
import {selectReadingOpportunity} from '../src/components/StoryReadingOpportunity';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableApprenticeshipReunionActions,projectApprenticeshipReunion} from '../src/engine/apprenticeshipReunion';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const director=<button type="button">沿旧路转一转</button>;

it('shows an actually offered native apprenticeship choice above the generic director invitation',()=>{
  const teacher='npc-1',student='npc-2';
  const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
    ({chosenAction,innerMonologue:'按此处的人事作答。',...fields});
  const turn=(world:WorldState,choices:Record<string,LLMDecisionPayload>={})=>
    advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??order('REST')])),()=>.99);
  const member=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;

  let world=createInitialWorld(13071,'classic');
  world=turn(world,{[student]:order('EXPLORE',{targetLocationId:'loc-taixu'})});
  while(world.tick<12)world=turn(world,{[teacher]:order('CULTIVATE')});
  const ask=availableApprenticeshipReunionActions(member(world,student),world)
    .find(row=>row.apprenticeshipReunionMove==='ask'&&row.targetCultivatorId===teacher);
  if(!ask)throw new Error('Expected the actual learner to be able to approach');
  world=turn(world,{[student]:order(ask.action,{apprenticeshipReunionMove:'ask',targetCultivatorId:teacher})});
  const view=projectApprenticeshipReunion(world,member(world,teacher));
  if(!view)throw new Error('Expected the requested teacher to hold the response option');
  expect(view.options.some(row=>row.apprenticeshipReunionMove==='refuse')).toBe(true);
  expect(projectApprenticeshipReunion(world,{...member(world,teacher)})?.options).toBeUndefined();
  const rendered=renderToStaticMarkup(selectReadingOpportunity([{
    hasLegalChoice:view.options.length>0,card:<ApprenticeshipReunionStoryCard view={view} onChoose={()=>{}}/>,
  }],director));
  const canvas=new DOMParser().parseFromString(rendered,'text/html');
  const additional=canvas.querySelector('details');
  expect(additional?.open).toBe(false);
  expect(canvas.querySelector('section button')?.textContent).toContain('婉拒收徒');
  expect(additional?.querySelector('button')?.textContent).toBe('沿旧路转一转');
  additional?.querySelector('summary')?.click();
  expect(additional?.open).toBe(true);
  expect(canvas.querySelectorAll('details')).toHaveLength(1);
});

it('does not replace the existing priority for closeouts or when there is no competing director invitation',()=>{
  const closeout=<BattlefieldAftermathStoryCard view={{siteId:'site',siteName:'残阵边',options:[],
    receipt:{title:'歇在旧阵边',description:'此人已经歇下。'}}}/>;
  const candidate={card:closeout,hasLegalChoice:false};
  expect(selectReadingOpportunity([candidate],director)).toBe(director);
  expect(selectReadingOpportunity([candidate],undefined)).toBeUndefined();
  expect(selectReadingOpportunity([{...candidate,hasLegalChoice:true}],undefined)).toBeUndefined();
});
