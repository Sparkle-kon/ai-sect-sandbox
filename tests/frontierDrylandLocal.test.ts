import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {resolveDrylandNativeLayer} from '../src/engine/frontierActions';
import {resolveFrontierMovementAction} from '../src/engine/frontierMovementEngine';
import {availableFrontierDrylandLocalActions,canPayDrylandHaul,creditDrylandStock,debitDrylandStock,drylandStock,
  payDrylandHaul,projectFrontierDrylandLocal,resolveFrontierDrylandLocalAction} from '../src/engine/frontierDrylandLocalEngine';
import {validateFrontierDrylandLocal,validateFrontierDrylandLocalShape} from '../src/engine/frontierDrylandLocalValidation';
import {FRONTIER_DRYLAND_COSTS as C,type FrontierDrylandCustody,type FrontierDrylandLocalMove} from '../src/engine/frontierDrylandTerms';
import type {FrontierMovementMove,FrontierSiteId} from '../src/engine/frontierTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const west='npc-1',ridge='npc-8',wr='western-saltwell',rr='plateau-thunderridge';
const fail=(label:string):never=>{throw new Error(label);};
const say=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'在实到处只用确有资粮。',...fields});
const person=(w:WorldState,id:string)=>w.cultivators.find(row=>row.id===id)!;
const next=(w:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={})=>
  advanceWorldTick(w,Object.fromEntries(w.cultivators.map(row=>[row.id,orders[row.id]??say('REST')])),()=>.99,'utility');
const domain=(w:WorldState)=>w.frontier!.drylands!;
const paired=(w:WorldState,move:FrontierMovementMove,a:FrontierSiteId,b:FrontierSiteId)=>{
  travel(w,west,move,a);travel(w,ridge,move,b);
};
function travel(w:WorldState,id:string,frontierMove:FrontierMovementMove,targetFrontierSiteId:FrontierSiteId){
  expect(resolveFrontierMovementAction(w,person(w,id),say('FRONTIER',{frontierMove,targetFrontierSiteId})),
    frontierMove+' '+targetFrontierSiteId+' @'+w.tick).not.toBeNull();
}
function act(w:WorldState,id:string,frontierDrylandMove:FrontierDrylandLocalMove,extra:Partial<LLMDecisionPayload>={},rng=()=>.99){
  const a=person(w,id);
  return resolveFrontierDrylandLocalAction(w,a,say('FRONTIER_DRYLAND',{frontierDrylandMove,
    targetFrontierSiteId:a.locationId as FrontierSiteId,...extra}),{attemptNativeLayer:(world,actor)=>resolveDrylandNativeLayer(world,actor,rng)});
}
function checked(w:WorldState,custody:readonly FrontierDrylandCustody[]=[]){
  validateFrontierDrylandLocalShape(JSON.parse(JSON.stringify(domain(w))) as unknown,'frontier.drylands.shape',fail);
  validateFrontierDrylandLocal(w,custody,fail);
}
function nativeFoundations(){
  let w=createInitialWorld(1,'spirit-bloom');
  const gather=say('GATHER_HERBS',{targetHerbId:'earth_root'});
  for(let i=0;i<8;i++)w=next(w,{[west]:gather,[ridge]:gather});
  expect([w.tick,person(w,west).herbs.earth_root,person(w,ridge).herbs.earth_root]).toEqual([9,9,8]);
  w=next(w,{[west]:say('EXPLORE',{targetLocationId:'loc-market'}),[ridge]:say('EXPLORE',{targetLocationId:'loc-market'})});
  expect([person(w,west).locationId,person(w,ridge).locationId]).toEqual(['loc-market','loc-market']);
  w=next(w,{[west]:say('EXPLORE',{targetLocationId:'loc-taixu'}),[ridge]:say('EXPLORE',{targetLocationId:'loc-tianji'})});
  expect([person(w,west).locationId,person(w,ridge).locationId]).toEqual(['loc-taixu','loc-tianji']);
  w=next(w,{[west]:say('CULTIVATE')});expect(person(w,west)).toMatchObject({qiProgress:100,realm:'元婴',realmStage:4});
  w=next(w);paired(w,'enter','frontier-west-gate','frontier-ridge-gate');
  expect(w.frontier?.drylands).toBeUndefined();
  expect(projectFrontierDrylandLocal(w,person(w,west))?.resident).toBe(false);
  w=next(w);paired(w,'travel','frontier-west-trail','frontier-ridge-saddle');
  w=next(w);paired(w,'travel','frontier-west-home','frontier-ridge-home');
  w=next(w);paired(w,'settle','frontier-west-home','frontier-ridge-home');
  w=next(w);paired(w,'travel','frontier-west-trail','frontier-ridge-quarry');
  w=next(w);paired(w,'travel','frontier-west-well','frontier-ridge-pasture');
  expect(act(w,west,'open_well')).toBeNull();
  w=next(w);return w;
}
function firstHarvests(){
  let w=nativeFoundations();
  expect(w.month).toBe(7);
  const western=person(w,west),high=person(w,ridge);
  const roots=western.herbs.earth_root,stones=western.spiritStones;
  expect(act(w,west,'open_well')).not.toBeNull();
  expect([stones-western.spiritStones,roots-western.herbs.earth_root]).toEqual([12,2]);
  expect(domain(w).well).toMatchObject({readyTick:w.tick+1,water:0});
  expect(act(w,west,'draw_water')).toBeNull();
  const rRoots=high.herbs.earth_root,rStones=high.spiritStones;
  expect(act(w,ridge,'tend_herd')).not.toBeNull();
  expect([rStones-high.spiritStones,rRoots-high.herbs.earth_root]).toEqual([6,1]);
  expect(domain(w).herd).toMatchObject({count:2,work:2,expiresTick:w.tick+C.herdMonths});
  w=next(w);
  expect(domain(w).well?.water).toBe(0);
  expect(act(w,west,'draw_water')).not.toBeNull();expect(domain(w).well?.water).toBe(1);
  travel(w,ridge,'travel','frontier-ridge-quarry');
  expect(act(w,ridge,'quarry_stone')).toBeNull();
  w=next(w);
  expect(act(w,west,'draw_water')).not.toBeNull();expect(domain(w).well?.water).toBe(4);
  expect(act(w,ridge,'quarry_stone')).not.toBeNull();
  expect(drylandStock(w,rr,'stormstone')).toBe(2);
  expect(domain(w).herd?.work).toBe(1);
  expect(act(w,ridge,'quarry_stone')).toBeNull();
  checked(w);return w;
}
describe('E45 distinct local water, livestock and ordinary layer proofs',()=>{
  it('opens real resident sites, measures finite water before any output, and retains private warehouse scope',()=>{
    let w=firstHarvests();
    w=next(w);travel(w,west,'travel','frontier-west-saltbed');
    w=next(w);
    const hp=person(w,west).hp;
    expect(act(w,west,'gather_salt')).not.toBeNull();
    expect([domain(w).well?.water,drylandStock(w,wr,'rift_salt'),person(w,west).hp]).toEqual([2,2,hp-4]);
    expect(act(w,west,'gather_salt')).toBeNull();
    expect(projectFrontierDrylandLocal(w,person(w,west))?.well?.water).toBe(2);
    expect(projectFrontierDrylandLocal(w,person(w,west))).not.toHaveProperty('stock');
    expect(projectFrontierDrylandLocal(w,structuredClone(person(w,west)))).toBeUndefined();
    expect(projectFrontierDrylandLocal(w,person(w,'npc-6'))).toBeUndefined();
    checked(w);
    const raw=encodeEraWorldSave(w);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
    const forged=structuredClone(w);domain(forged).well!.water++;
    expect(()=>checked(forged)).toThrow('frontier.drylands.local.replay');
  });

  it('requires finite actually paid protection on the real July labour, with proper end-exclusive horizons',()=>{
    let w=firstHarvests();
    w=next(w);travel(w,ridge,'travel','frontier-ridge-pasture');
    w=next(w);w=next(w);expect(w.month).toBe(12);
    expect(act(w,ridge,'feed_herd',{frontierDrylandFeed:'salt'})).toBeNull();
    expect(act(w,ridge,'feed_herd',{frontierDrylandFeed:'root'})).not.toBeNull();
    w=next(w);travel(w,ridge,'travel','frontier-ridge-saddle');
    w=next(w);travel(w,ridge,'travel','frontier-ridge-ward');
    w=next(w);expect(w.month).toBe(3);
    let noWard=structuredClone(w);
    const roots=person(w,ridge).herbs.earth_root;
    expect(act(w,ridge,'charge_ward')).not.toBeNull();
    expect(person(w,ridge).herbs.earth_root).toBe(roots-1);
    expect(drylandStock(w,rr,'stormstone')).toBe(1);
    expect(domain(w).ward).toMatchObject({charges:1,expiresTick:w.tick+C.wardMonths});
    for(const site of ['frontier-ridge-saddle','frontier-ridge-pasture','frontier-ridge-quarry'] as const){
      w=next(w);noWard=next(noWard); travel(w,ridge,'travel',site);travel(noWard,ridge,'travel',site);
    }
    w=next(w);noWard=next(noWard);expect(w.month).toBe(7);
    expect(act(noWard,ridge,'quarry_stone')).toBeNull();
    expect(act(w,ridge,'quarry_stone')).not.toBeNull();
    expect([domain(w).ward?.charges,drylandStock(w,rr,'stormstone')]).toEqual([0,3]);
    checked(w);checked(noWard);
    // Same true unworked timeline hits both previously paid legal deadlines the following August.
    noWard=next(noWard);w=next(w);expect(w.tick).toBe(domain(w).ward?.expiresTick);
    expect(w.tick).toBe(domain(w).herd?.expiresTick);
    expect(availableFrontierDrylandLocalActions(person(noWard,ridge),noWard).some(row=>row.frontierDrylandMove==='quarry_stone')).toBe(false);
  });

  it('keeps trade prep finite and does not attempt a same-realm layer until a real declared custody credit',()=>{
    let w=firstHarvests();
    w=next(w);paired(w,'travel','frontier-west-saltbed','frontier-ridge-home');
    w=next(w);expect(act(w,west,'gather_salt')).not.toBeNull();travel(w,ridge,'travel','frontier-ridge-saddle');
    w=next(w);paired(w,'travel','frontier-west-well','frontier-ridge-ward');
    w=next(w);expect(act(w,west,'draw_water')).not.toBeNull();travel(w,ridge,'travel','frontier-ridge-warehouse');
    w=next(w);travel(w,west,'travel','frontier-west-trail');
    const agreementId='isolated-custody-proof',refId=`${agreementId}-${rr}`;
    expect(canPayDrylandHaul(w,person(w,ridge),rr)).toBe(true);
    expect(payDrylandHaul(w,person(w,ridge),rr,refId)).toBe(true);
    expect(payDrylandHaul(w,person(w,ridge),rr,refId)).toBe(false);
    const slices=debitDrylandStock(w,rr,'stormstone',2)!;
    // Only the standalone local/custody validator is exercised here. The native two-shipments test proves spatial delivery.
    const outstanding:FrontierDrylandCustody={agreementId,refId,actorId:ridge,from:rr,loadedTick:w.tick,slices};
    checked(w,[outstanding]);
    w=next(w);travel(w,west,'travel','frontier-west-trial');
    w=next(w);expect(act(w,west,'attempt_layer')).toBeNull();
    const didArrive={...outstanding,to:wr,landedTick:w.tick} as const;
    expect(creditDrylandStock(w,wr,slices)).toBe(true);
    expect(creditDrylandStock(w,wr,slices)).toBe(false);
    const backlash=structuredClone(w),beforeWater=domain(w).well!.water;
    const result=act(w,west,'attempt_layer',{},()=>0);
    expect(result).toMatchObject({category:'breakthrough',locationId:'frontier-west-trial',witnessScope:'participants'});
    expect(act(backlash,west,'attempt_layer',{},()=>.99)).toMatchObject({category:'breakthrough',title:expect.stringContaining('反噬')});
    expect(person(w,west)).toMatchObject({realm:'元婴',realmStage:5,qiProgress:0});
    expect(person(backlash,west)).toMatchObject({realm:'元婴',realmStage:4,qiProgress:45});
    for(const branch of [w,backlash]){
      expect(domain(branch).well?.water).toBe(beforeWater-2);
      expect(drylandStock(branch,wr,'stormstone')).toBe(1);
      expect(act(branch,west,'attempt_layer')).toBeNull();
      checked(branch,[didArrive]);
      expect(()=>checked(branch,[outstanding])).toThrow('frontier.drylands.local.stock.negative');
    }
  });
});
