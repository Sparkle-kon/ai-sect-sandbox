// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {AgentInspector} from '../src/components/AgentInspector';
import {LocalCourtyardCanvas} from '../src/components/LocalCourtyardCanvas';
import {MapEntityPopover} from '../src/components/MapEntityPopover';
import {MapSidebarDossier} from '../src/components/MapSidebarDossier';
import {buildLocalCourtyard} from '../src/components/localCourtyardModel';
import {drawCourtyardQuirkTags} from '../src/components/localCourtyardRenderer';
import {projectMapEntityPopover} from '../src/components/mapEntityPopoverModel';
import {sectQuirkLabels} from '../src/components/sectQuirkLabels';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';

const fixture=()=>{
  const world=createInitialWorld(30301),actor=world.cultivators[0];
  actor.quirks=['glutton','lost'];actor.innerMonologue='这件私事无可奉告。';
  return {world,actor,view:createTerrainMapView(world,actor,false)};
};

it('projects two public catalog labels without unlocking personal thought or invisible actors',()=>{
  const {world,actor,view}=fixture();
  const render=(section:'profile'|'mind')=>renderToStaticMarkup(<AgentInspector world={world}
    cultivator={actor} onSelectCultivator={vi.fn()} workspaceSection={section}/>);
  expect(render('profile')).toContain('aria-label="怪癖"');
  expect(render('profile')).toContain('吃货');
  expect(render('profile')).toContain('路痴');
  expect(render('mind')).not.toContain('aria-label="怪癖"');

  const target={kind:'actor',id:actor.id} as const;
  const data=projectMapEntityPopover(world,view,target);
  if(data?.kind!=='actor')throw Error('Missing visible native actor');
  const popover=renderToStaticMarkup(<MapEntityPopover data={data} anchor={{x:50,y:50}} pinned={false}
    actions={[]} onClose={vi.fn()} onFocus={vi.fn()} onCommit={vi.fn()}/>);
  const dossier=renderToStaticMarkup(<MapSidebarDossier data={{actor:data,destiny:[],actions:[]}}/>);
  for(const html of [popover,dossier]){
    expect(html).toContain('吃货');expect(html).toContain('路痴');
    expect(html).not.toContain('glutton');expect(html).not.toContain(actor.innerMonologue);
  }
  expect(projectMapEntityPopover(world,{...view,liveActors:[]},target)).toBeUndefined();
  delete actor.quirks;
  expect(render('profile')).not.toContain('aria-label="怪癖"');
  expect(projectMapEntityPopover(world,view,target)).not.toHaveProperty('quirkLabels');
  expect(sectQuirkLabels(['constructor','glutton','glutton','bogus','lost','miser'])).toEqual(['吃货','路痴']);
  expect(sectQuirkLabels('lost')).toEqual([]);
});

it('paints the primary label above the actual sprite and exposes both in courtyard selection',async()=>{
  const {world,actor,view}=fixture();
  const plan=buildLocalCourtyard(world,view,actor.locationId,{viewer:actor});
  const person=plan?.actors.find(row=>row.id===actor.id);
  if(!plan||!person)throw Error('Missing occupied native courtyard');
  expect(person.quirkLabels).toEqual(['吃货','路痴']);
  const fillText=vi.fn(),pen={fillText,save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),roundRect:vi.fn(),fill:vi.fn()};
  drawCourtyardQuirkTags(pen as unknown as CanvasRenderingContext2D,plan);
  expect(fillText).toHaveBeenCalledTimes(1);
  expect(fillText).toHaveBeenCalledWith('吃货',person.x,person.y-27,22);

  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  try{
    await act(async()=>root.render(<LocalCourtyardCanvas plan={plan}/>));
    const button=[...host.querySelectorAll('button')].find(node=>node.textContent?.startsWith(actor.name));
    if(!button)throw Error('Missing semantic persona button');
    await act(async()=>button.click());
    const labels=host.querySelector('[aria-label="庭院图中所选"] [aria-label="怪癖"]');
    expect(labels?.textContent).toBe('吃货路痴');
  }finally{
    await act(async()=>root.unmount());host.remove();getContext.mockRestore();vi.unstubAllGlobals();
  }
  view.trailPositions.set(actor.id,{x:0,y:0});
  expect(buildLocalCourtyard(world,view,actor.locationId,{viewer:actor})?.actors.some(row=>row.id===actor.id)).toBe(false);
});
