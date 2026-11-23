// @vitest-environment jsdom
import {act,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {DirectorHighlightCard,projectDirectorHighlightStage,useDirectorHighlight} from '../src/components/useDirectorHighlight';
import {StoryFirstHome} from '../src/components/StoryFirstHome';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectDirectorHighlight} from '../src/engine/director/directorHighlights';
import {configureStoryteller} from '../src/engine/storytellerDirector';
import {advanceWorldTick} from '../src/engine/worldEngine';

const stubKey={kind:'encounter',sourceId:'not-rendered-encounter',actorId:'not-rendered-actor',siteId:'not-rendered-site',
  openedTick:2} as const;
const stubHighlight={...stubKey,key:stubKey,
  baseWeight:70,title:'断桥下的剑匣',teaser:'水声绕过断梁，匣上那道剑痕还未干。',
  options:[
    {id:'open',label:'解开剑匣',consequences:['technique','injury']},
    {id:'leave',label:'就此离去',consequences:[]},
  ],
} satisfies NonNullable<ReturnType<typeof projectDirectorHighlight>>;

it('renders a single scoped choice above the quiet reading area, with natural consequence labels and no ledger keys',()=>{
  const card=<DirectorHighlightCard view={stubHighlight} actorName="林照野" siteName="断桥" onChoose={()=>false}/>;
  const html=renderToStaticMarkup(<StoryFirstHome currentChoice={card} onContinue={()=>{}} onMore={()=>{}}/>);
  expect(html).toContain('断桥下的剑匣');
  expect(html).toContain('林照野 · 断桥');
  expect(html).toContain('关乎功法、气血');
  expect(html.match(/这一幕，由你决定/g)).toHaveLength(1);
  expect(html.match(/解开剑匣/g)).toHaveLength(1);
  expect(html).not.toMatch(/not-rendered-|\btechnique\b|实付|托管|凭据|原生/);
  const quiet={...stubHighlight,options:[
    {id:'rest',label:'背靠旧松歇一歇',consequences:[]},
    {id:'cultivate',label:'借此地吐纳',consequences:[]},
  ]};
  expect(renderToStaticMarkup(<DirectorHighlightCard view={quiet} actorName="林照野" onChoose={()=>false}/>)).toBe('');
});

it('settles a genuine fresh-world highlight on the current branch without taking possession or spending a month',async()=>{
  let world=createInitialWorld(13071);
  expect(configureStoryteller(world,'wandering_jianghu')).toBe(true);
  for(let month=0;month<8&&!projectDirectorHighlight(world);month++)world=advanceWorldTick(world);
  const view=projectDirectorHighlight(world);
  if(!view)throw new Error('Expected a playable monthly high point from seeded genuine ticks');
  const ground=projectDirectorHighlightStage(world,view);
  const actor=world.cultivators.find(row=>row.id===view.actorId);
  if(actor?.locationId===view.siteId){
    expect(ground?.siteId).toBe(view.siteId);
    expect(ground?.cast.map(row=>row.id)).toEqual([view.actorId]);
  }
  expect(projectDirectorHighlightStage(world,{...view,openedTick:view.openedTick-1})).toBeUndefined();
  expect(projectDirectorHighlightStage(world,{...view,siteId:'forged-site'})).toBeUndefined();
  const chosen=view.options.find(option=>option.consequences.length>0);
  if(!chosen)throw new Error('Expected an actual consequential option');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');
  document.body.append(host);
  const root=createRoot(host);
  let controller:ReturnType<typeof useWorldSimulationController>|undefined;
  let installed=false;
  function Harness(){
    const sim=useWorldSimulationController({playbackEnabled:false,inspectCampaign:false,
      onPreviewContextChange:()=>{},onHistoricalPreview:()=>{},onActivate:()=>{}});
    controller=sim;
    if(!installed){installed=true;sim.replaceWorld(world,sim.world,sim.saveContextVersion.current);}
    const returnFocus=useRef<HTMLButtonElement>(null);
    const card=useDirectorHighlight(sim,true,false,'story',returnFocus);
    return <><button ref={returnFocus}>回到这一页</button>{card?.card}</>;
  }
  try{
    await act(async()=>root.render(<Harness/>));
    const findChoice=()=>[...host.querySelectorAll('button')].find(node=>node.textContent?.startsWith(chosen.label));
    const formerlyVisible=findChoice(),initialController=controller;
    if(!formerlyVisible||!initialController)throw new Error('Missing the real focused actor’s option');
    expect(initialController.world).toBe(world);
    await act(async()=>initialController.handleTimelinePreview(world.tick));
    expect(findChoice()).toBeUndefined();
    formerlyVisible.dispatchEvent(new MouseEvent('click',{detail:0,bubbles:true}));
    expect(controller?.world).toBe(world);
    await act(async()=>controller?.handleTimelinePreview(null));
    const button=findChoice();
    if(!button)throw new Error('Expected the current choice to return after leaving history');
    const beforeAvatar=structuredClone(world.playerAvatar);
    button.focus();
    const repeat=new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true});
    button.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    await act(async()=>{
      button.dispatchEvent(new MouseEvent('click',{detail:0,bubbles:true}));
      button.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    });
    expect(controller?.world).not.toBe(world);
    expect(controller?.world.tick).toBe(world.tick);
    expect(controller?.world.playerAvatar).toEqual(beforeAvatar);
    expect(controller?.world.storyteller?.highlights?.filter(row=>
      row.sourceId===view.sourceId&&row.actorId===view.actorId&&row.chosen===chosen.id)).toHaveLength(1);
    expect(document.activeElement?.textContent).toBe('回到这一页');
  }finally{
    await act(async()=>root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
