import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {App} from '../src/App';
import {WorldPulseBar} from '../src/components/WorldPulseBar';
import {projectWorldPulse} from '../src/components/worldPulseModel';
import {resolveWorldPulseFocusSite,type WorldPulseFocusRequest} from '../src/components/mapPulseFocus';
import {createInitialWorld} from '../src/data/initialWorld';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimeline,readTimelineHead} from '../src/engine/timelineEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const witness='npc-1',opponent='elder-taixu-1',outsider='npc-6',site='loc-taixu';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'守在此地等下一月。'};
const hidden='旁人不得求见此句密语';
function month(world:WorldState,decision?:LLMDecisionPayload){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,actor.id===witness&&decision?decision:rest])),
    undefined,'utility');
}
function actualClash(){
  const initial=createInitialWorld(1,'spirit-bloom');
  const world=month(initial,{chosenAction:'DUEL',targetCultivatorId:opponent,innerMonologue:'与实地在场者交手。'});
  const event=world.events.find(row=>row.tick===world.tick&&row.category==='combat'&&row.locationId===site&&row.actorIds.includes(opponent));
  if(!event)throw Error('No actual native clash at the original place');
  return {initial,world,event};
}

describe('world pulse across actual story, cockpit and ordinary sandbox surfaces',()=>{
  it('leaves the default two-button story alone and uses one matching status strip in both advanced surfaces',()=>{
    const story=renderToStaticMarkup(<App/>);
    expect(story.match(/<button\b/g)).toHaveLength(2);
    expect(story).toContain('data-story-home');
    expect(story).not.toContain('天地气运');
    expect(story).not.toContain('在地图定位');
    const ordinary=renderToStaticMarkup(<App initialWorkspace="map"/>);
    const cockpit=renderToStaticMarkup(<App initialCockpit/>);
    const world=createInitialWorld(),view=projectWorldPulse(world,witness,false);
    for(const surface of [ordinary,cockpit]){
      expect(surface.match(/>\s*天地气运\s*<\/h2>/gu)).toHaveLength(1);
      expect(surface).toContain(`仙历 ${world.year}年${world.month}月`);
      expect(surface).toContain(`${view.season}季`);
      expect(surface).toContain('天下第一人');
      expect(surface).toContain('正魔气运均值');
      if(view.champion)expect(surface).toContain(view.champion.name);
      expect(surface.match(/<meter[^>]+min="-100"[^>]+max="100"/gu)).toHaveLength(2);
    }
    expect(ordinary.match(/role="tab"/gu)).toHaveLength(5);
    expect(cockpit).toContain('data-panoramic-cockpit');
    expect(cockpit).not.toContain('role="tab"');
  });

  it('uses a real current-month native clash with an exact drawable place and does not treat it as a permanent alert',()=>{
    const {world,event}=actualClash(),before=encodeWorldSave(world);
    const own=projectWorldPulse(world,witness,true),remote=projectWorldPulse(world,outsider,true);
    const risk=own.risks.find(row=>row.kind==='clash'&&row.siteName===world.locations.find(item=>item.id===site)?.name);
    if(!risk)throw Error('No alert tied to native duel');
    expect(risk.id.startsWith('clash:')).toBe(true);
    expect(remote.risks.some(row=>row.id===risk.id)).toBe(false);
    const full=projectWorldPulse(world,outsider,false);
    expect(full.risks).toContainEqual(risk);
    const scope=`main:${world.tick}:map`;
    const request:WorldPulseFocusRequest={world,scopeKey:scope,viewerId:witness,fog:true,riskId:risk.id,token:1};
    const binding={world,scopeKey:scope,viewerId:witness,fog:true,active:true};
    expect(resolveWorldPulseFocusSite(request,binding)).toMatchObject({id:site});
    expect(resolveWorldPulseFocusSite(request,{...binding,active:false})).toBeUndefined();
    expect(resolveWorldPulseFocusSite(request,{...binding,scopeKey:'same-date:other-branch'})).toBeUndefined();
    const next=month(world),nextRead=projectWorldPulse(next,witness,true);
    expect(nextRead.risks.some(entry=>entry.id===risk.id)).toBe(false);
    expect(event.tick).toBe(world.tick);
    expect(encodeWorldSave(world)).toBe(before);
  });

  it('keeps a real current alert private-free, and rejects a same-month branch snapshot from the former rendered alert',()=>{
    const {world}=actualClash(),pulse=projectWorldPulse(world,witness,false),risk=pulse.risks.find(row=>row.kind==='clash');
    if(!risk)throw Error('Actual public clash required');
    const initial=createTimeline(world),branched=forkTimeline(initial,world.tick,
      {type:'WHISPER_MIND',targetCultivatorId:outsider,whisperText:hidden});
    const sibling=readTimelineHead(branched);
    if(!sibling)throw Error('Actual same-month branch required');
    const scoped=projectWorldPulse(sibling,witness,false);
    expect(scoped.risks).toContainEqual(risk);
    expect(JSON.stringify(scoped)).not.toContain(hidden);
    expect(scoped.risks).toEqual(projectWorldPulse(executeGodIntervention(world,{
      type:'WHISPER_MIND',targetCultivatorId:outsider,whisperText:hidden,
    }),witness,false).risks);
    const focus=vi.fn(),oldMarkup=renderToStaticMarkup(<WorldPulseBar view={pulse} onFocusAlert={focus}/>);
    expect(oldMarkup).toContain(`aria-label="在地图定位：${risk.siteName} · ${risk.label}"`);
    const history=renderToStaticMarkup(<WorldPulseBar view={scoped} historical canFocus={false} onFocusAlert={focus}/>);
    expect(history).toContain('历史一帧');
    expect(history).toContain(risk.siteName);
    expect(history).not.toContain('在地图定位：');
    expect(focus).not.toHaveBeenCalled();
    expect(resolveWorldPulseFocusSite({world,scopeKey:'main:2:map',viewerId:witness,fog:false,riskId:risk.id,token:1},
      {world:sibling,scopeKey:'main:2:map',viewerId:witness,fog:false,active:true})).toBeUndefined();
  });
});
