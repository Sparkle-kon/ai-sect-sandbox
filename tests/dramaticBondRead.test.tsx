import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectDramaticBondArcs} from '../src/engine/dramaticBondEngine';
import {actualCommonBond,actualDefenderWinsLethally,actualPrivateBond,bondSite,bondTurn,secondId}
  from './dramaticBondNativeFixture';
import {StoryFirstHome} from '../src/components/StoryFirstHome';
import {CockpitStoryStage} from '../src/components/CockpitStoryStage';
import {ActorDramaticBondRead,type PublicBondArc,type PersonalBondRead} from '../src/components/DramaticBondRead';

const proof:PublicBondArc={actorIds:['private-a','private-b'],names:['闻笛','岑闻溪'],
  title:'两人再到渡口',summary:'闻笛与岑闻溪曾在渡口合练；隔了数月，两人又在这里交手。',
  lastTick:11,milestones:[{tick:11,year:1002,month:2,siteName:'照水渡口',text:'最后，岑闻溪占了上风。'}]};
const own:PersonalBondRead={actorId:'private-a',scenes:[{title:'向师长求教',text:'这一页只记当事人亲见的原事。',tick:10}]};
function extractAside(markup:string){
  return markup.match(/<aside aria-label="公开故事支线"[\s\S]*?<\/aside>/)?.[0];
}

describe('scoped public subplot and optional exact personal reading',()=>{
  it('keeps the same short public aside in both original story surfaces without changing who is protagonist or mobile actions',()=>{
    const home=renderToStaticMarkup(<StoryFirstHome leadName="叶连翘" subplot={proof} onContinue={vi.fn()} onMore={vi.fn()}/>);
    const stage=renderToStaticMarkup(<CockpitStoryStage world={createInitialWorld(12)} subplot={proof}/>);
    expect(extractAside(home)).toBe(extractAside(stage));
    expect(extractAside(home)).toContain(proof.summary);
    expect(home).toContain('主角：叶连翘');
    expect(stage).toContain('主角未定');
    expect(home.match(/<button/g)).toHaveLength(2);
    expect(stage).not.toContain('<button');
    expect(home+stage).not.toContain('private-');
    expect(home+stage).not.toContain(own.scenes[0].text);
  });
  it('mounts no subplot or new controls when the exact public projection has no results',()=>{
    const home=renderToStaticMarkup(<StoryFirstHome onContinue={vi.fn()} onMore={vi.fn()}/>);
    expect(extractAside(home)).toBeUndefined();
    expect(home.match(/<button/g)).toHaveLength(2);
    const onlyOther=renderToStaticMarkup(<ActorDramaticBondRead actorId="other" publicArcs={[proof]} personal={own}/>);
    expect(onlyOther).toBe('');
  });
  it('keeps rendered public aside byte-identical across real private-only sibling divergence but not genuine lethal proof',()=>{
    const {clash}=actualCommonBond();
    const publicRead=(world:ReturnType<typeof bondTurn>)=>projectDramaticBondArcs(world,{
      viewerId:secondId,currentVisibleSiteIds:new Set([bondSite]),
    })[0];
    const home=(subplot:PublicBondArc|undefined)=>extractAside(renderToStaticMarkup(
      <StoryFirstHome subplot={subplot} onContinue={vi.fn()} onMore={vi.fn()}/>));
    const unaffected=publicRead(bondTurn(clash)),privateOnly=publicRead(actualPrivateBond(clash));
    expect(unaffected).toBeDefined();
    expect(home(unaffected)).toBe(home(privateOnly));
    const lethal=publicRead(actualDefenderWinsLethally(clash).world);
    expect(lethal).toBeDefined();
    expect(home(lethal)).not.toBe(home(unaffected));
    expect(home(lethal)).toContain('未能离开战地');
  });
  it('keeps own private direct proof visibly separate, and does not pass it to another dossier',()=>{
    const mine=renderToStaticMarkup(<ActorDramaticBondRead actorId="private-a" publicArcs={[proof]} personal={own}/>);
    expect(mine).toContain('仅本人可见 · 亲历');
    expect(mine).toContain(own.scenes[0].text);
    expect(mine).toContain('照水渡口');
    expect(mine).toContain('后来所见：最后，岑闻溪占了上风');
    const theirs=renderToStaticMarkup(<ActorDramaticBondRead actorId="private-b" publicArcs={[proof]} personal={own}/>);
    expect(theirs).toContain(proof.summary);
    expect(theirs).not.toContain(own.scenes[0].text);
    expect(theirs).not.toContain('仅本人可见');
    expect(theirs).not.toContain('private-');
  });
});
