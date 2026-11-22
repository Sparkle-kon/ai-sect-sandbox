import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {triggerTribulation} from '../src/engine/tribulationEngine';
import {MAP_HEIGHT,MAP_WIDTH,type MapCamera} from '../src/components/mapCamera';
import {interpolatePulseCamera,resolveWorldPulseFocusSite,WORLD_PULSE_CAMERA_DURATION_MS,
  type WorldPulseFocusRequest} from '../src/components/mapPulseFocus';

function trialFixture(){
  const world=createInitialWorld();
  const actor=world.cultivators[0];
  const site=world.locations.find(site=>site.id===actor.locationId);
  actor.realm='筑基';
  actor.realmStage=9;
  actor.qiProgress=100;
  const event=triggerTribulation(world,actor);
  if(!actor.tribulation||!site||!event)throw Error('Expected a canonical trial at an actual site');
  world.events.push(event);
  const current={world,scopeKey:'9:main:live',viewerId:actor.id,fog:true,active:true};
  const request:WorldPulseFocusRequest={world,scopeKey:current.scopeKey,viewerId:actor.id,fog:true,
    riskId:`trial:${actor.tribulation.id}`,token:1};
  return {world,actor,site,current,request};
}

describe('scoped world-pulse camera intent',()=>{
  it('resolves the actual local trial and never trusts a fabricated alert ID',()=>{
    const {site,current,request}=trialFixture();
    expect(resolveWorldPulseFocusSite(request,current)).toBe(site);
    expect(resolveWorldPulseFocusSite({...request,riskId:`${request.riskId}-fake`},current)).toBeUndefined();
  });

  it('rejects stale world, branch, archive, viewer, fog, and inactive map scopes',()=>{
    const {world,current,request}=trialFixture();
    for(const changed of [{...current,world:structuredClone(world)},{...current,scopeKey:'9:branch-1:live'},
      {...current,scopeKey:`9:main:${world.tick}`},{...current,viewerId:world.cultivators[1].id},
      {...current,viewerId:null},{...current,fog:false},{...current,active:false}]){
      expect(resolveWorldPulseFocusSite(request,changed)).toBeUndefined();
    }
  });

  it('looks up current alert state instead of trusting a former active risk even under an unchanged request reference',()=>{
    const {actor,current,request}=trialFixture();
    if(!actor.tribulation)throw Error('Expected an active native trial');
    expect(resolveWorldPulseFocusSite(request,current)).toBeDefined();
    actor.tribulation.stage='failed';
    expect(resolveWorldPulseFocusSite(request,current)).toBeUndefined();
  });
});

describe('bounded presentation-only pulse camera tween',()=>{
  const from=Object.freeze<MapCamera>({x:-720,y:-100,zoom:2});
  const to=Object.freeze<MapCamera>({x:-3000,y:-1800,zoom:4});
  const duration=WORLD_PULSE_CAMERA_DURATION_MS;

  it('retains exact endpoints without mutating them or amplifying an invalid clock',()=>{
    for(const elapsed of [-Infinity,-7,0,NaN])expect(interpolatePulseCamera(from,to,elapsed)).toBe(from);
    for(const elapsed of [duration,duration+1,Infinity])expect(interpolatePulseCamera(from,to,elapsed)).toBe(to);
    expect(duration).toBe(280);
  });

  it('ease-out moves towards the new zoom and pan quickly without crossing camera rails',()=>{
    const half=interpolatePulseCamera(from,to,duration/2);
    expect(half).toEqual({x:-2715,y:-1587.5,zoom:3.75});
    let previous=from;
    for(let t=1;t<=duration;t++){
      const next=interpolatePulseCamera(from,to,t);
      expect(next.zoom).toBeGreaterThanOrEqual(previous.zoom);
      expect(next.x).toBeLessThanOrEqual(previous.x);
      expect(next.y).toBeLessThanOrEqual(previous.y);
      expect(next.x).toBeGreaterThanOrEqual(MAP_WIDTH*(1-next.zoom)-1e-10);
      expect(next.y).toBeGreaterThanOrEqual(MAP_HEIGHT*(1-next.zoom)-1e-10);
      previous=next;
    }
  });
});
