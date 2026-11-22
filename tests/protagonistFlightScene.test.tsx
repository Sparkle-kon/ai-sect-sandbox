import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {MapSidebarDossier} from '../src/components/MapSidebarDossier';
import {projectMapSidebarDossier} from '../src/components/mapSidebarDossierModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {resolveProtagonistFlightViewer} from '../src/components/useProtagonistFlightScene';
import {ProtagonistFlightScene} from '../src/components/ProtagonistFlightScene';
import {createInitialWorld} from '../src/data/initialWorld';
import type {PilgrimageOption} from '../src/engine/pilgrimageEngine';
import type {ProtagonistFlightView} from '../src/engine/protagonistFlightEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';

const view:ProtagonistFlightView={id:'hidden-flight',openedTick:7,status:'active',title:'扶危 · 三月逃亡',nextRound:2,rounds:[
  {tick:8,round:1,outcome:'moved',locationId:'private-route-node',points:[{x:100.1,y:110.2},{x:120.5,y:120.7}]},
]};
const options:PilgrimageOption[]=[
  {action:'PILGRIMAGE',pilgrimageMove:'advance',targetPilgrimageId:'hidden-journey'},
  {action:'PILGRIMAGE',pilgrimageMove:'camp',targetPilgrimageId:'hidden-journey'},
];

describe('the branch scene and the current protagonist label',()=>{
  it('shows only the real round and legal available paths; no automatic month or raw itinerary',()=>{
    const guide=vi.fn(async()=>true);
    const html=renderToStaticMarkup(<ProtagonistFlightScene view={view} options={options}
      controls={{busy:false,guide}} placeName={()=>'松灯集'}/>);
    expect(html).toContain('第 2 回合');
    expect(html).toContain('脚下又多赶过一段路');
    expect(html).toContain('最近记下的落脚处：松灯集');
    expect(html).toContain('继续赶路');
    expect(html).toContain('就地扎营');
    expect(html).not.toContain('收步撤离');
    expect(html).not.toMatch(/hidden-|private-route|100\.1/);
    expect(guide).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<ProtagonistFlightScene view={view} options={options}/>)).not.toContain('继续赶路');
  });

  it('keeps explained retreat, actual arrival and an unsupported ending separate',()=>{
    const retreat:ProtagonistFlightView={...view,status:'retreated',nextRound:undefined,rounds:[
      ...view.rounds,{tick:9,round:2,outcome:'retreated',reason:'guide_lost',points:[]},
    ]};
    const html=renderToStaticMarkup(<ProtagonistFlightScene view={retreat} options={options} controls={{busy:false,guide:vi.fn()}}/>);
    expect(html).toContain('已撤退');
    expect(html).toContain('向导的援手接不上了');
    expect(html).not.toContain('已脱险');
    expect(html).not.toContain('<button');
    const unknown=renderToStaticMarkup(<ProtagonistFlightScene view={{...view,status:'unfinished',nextRound:undefined}}/>);
    expect(unknown).toContain('未见抵达或撤离实录');
    expect(unknown).not.toContain('已脱险');
    expect(unknown).not.toContain('已撤退');
  });

  it('authorizes only the native possessed body in a story or selected workspace',()=>{
    const world=createInitialWorld(),[owner,other]=world.cultivators;
    expect(resolveProtagonistFlightViewer(world,false,owner)).toBeUndefined();
    world.playerAvatar.possessedId=owner.id;
    world.playerAvatar.possessionUntilTick=world.tick+1;
    expect(resolveProtagonistFlightViewer(world,false,other)).toBe(owner);
    expect(resolveProtagonistFlightViewer(world,true,owner)).toBe(owner);
    expect(resolveProtagonistFlightViewer(world,true,other)).toBeUndefined();
    expect(resolveProtagonistFlightViewer(world,true,{...owner})).toBeUndefined();
    world.tick++;
    expect(resolveProtagonistFlightViewer(world,false)).toBeUndefined();
  });

  it('shows zero earned protagonist on fresh seed and an earned one independently of the selected actor later',()=>{
    let world=createInitialWorld();
    const first=world.cultivators[0];
    const zero=projectMapSidebarDossier(world,first,createTerrainMapView(world,first,false),true);
    let html=renderToStaticMarkup(<MapSidebarDossier data={zero} onReadActor={vi.fn()}/>);
    expect(html).toContain('尚无主角');
    expect(html).toContain('当前选中');
    expect(html).not.toContain('本卷主角：');
    while(world.tick<5)world=advanceWorldTick(world);
    const selected=world.cultivators.find(actor=>actor.id==='npc-1')!;
    const after=projectMapSidebarDossier(world,selected,createTerrainMapView(world,selected,false),true);
    expect(after.leadName).toBe('叶连翘');
    expect(after.actor?.target.id).toBe(selected.id);
    html=renderToStaticMarkup(<MapSidebarDossier data={after} onReadActor={vi.fn()}/>);
    expect(html).toContain('本卷主角：叶连翘');
    expect(html).toContain(selected.name);
    expect(html).not.toContain('此处选中的正是本卷主角');
  });
});
