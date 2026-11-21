import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableAlchemy} from '../src/engine/alchemyEngine';
import {possessAvatar,queueAvatarOrder} from '../src/engine/avatarEngine';
import {isOrdinaryActionEvidence,ordinaryActionAttention} from '../src/engine/ordinaryActionEvidence';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const act=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按本月原生规则。',...extra});
const actor=(world:WorldState,id='npc-1')=>world.cultivators.find(row=>row.id===id)!;
const next=(world:WorldState,selected:LLMDecisionPayload,options:{captureTrace?:boolean}={},id='npc-1')=>
  advanceWorldTick(world,{...Object.fromEntries(world.cultivators.map(row=>[row.id,act('REST')])),[id]:selected},
    () => .99,'utility',undefined,options);
const raw=(world:WorldState)=>JSON.stringify({format:'ai-sect-sandbox',version:1,world});

describe('durable exact ordinary effect evidence',()=>{
  it('caps the streak at three without traces, uses only the last actual month, and resets after a failed choice',()=>{
    let world=createInitialWorld(2031);
    actor(world).qiProgress=0;
    expect(ordinaryActionAttention(actor(world),2)).toEqual({run:0});
    for(let run=1;run<=4;run++){
      world=next(world,act('CULTIVATE'),{captureTrace:false});
      expect(actor(world).ordinaryActionEvidence).toEqual({action:'CULTIVATE',tick:world.tick,streak:Math.min(run,3)});
      expect(ordinaryActionAttention(actor(world),world.tick+1)).toEqual({last:'CULTIVATE',run:Math.min(run,3)});
    }
    expect(world.decisionTrace.records).toHaveLength(0);
    expect(ordinaryActionAttention(actor(world),world.tick+2)).toEqual({run:0});
    const old=actor(world).ordinaryActionEvidence;
    world=next(world,act('SOCIALIZE',{targetCultivatorId:'not-present'}),{captureTrace:false});
    expect(actor(world).currentAction).toBe('SOCIALIZE'); // Attempt label alone is never proof.
    expect(actor(world).ordinaryActionEvidence).toEqual(old);
    expect(ordinaryActionAttention(actor(world),world.tick+1)).toEqual({run:0});
    world=next(world,act('CULTIVATE'),{captureTrace:false});
    expect(actor(world).ordinaryActionEvidence).toEqual({action:'CULTIVATE',tick:world.tick,streak:1});
    expect(actor(decodeWorldSave(encodeWorldSave(world))).ordinaryActionEvidence).toEqual(actor(world).ordinaryActionEvidence);
  });

  it('records real herb transfer, social source and actually reached location, but not a full-health no-op rest',()=>{
    let world=createInitialWorld(2031);
    const initial=actor(world),peer=world.cultivators.find(row=>row.id!==initial.id&&row.locationId===initial.locationId)!;
    expect(peer).toBeDefined();
    world=next(world,act('REST'));
    expect(actor(world).ordinaryActionEvidence).toBeUndefined();
    const gathered=availableAlchemy(actor(world),world).find(choice=>choice.action==='GATHER_HERBS'&&choice.targetHerbId);
    expect(gathered).toBeDefined();
    const herb=gathered!.targetHerbId!, prior=actor(world).herbs[herb];
    world=next(world,act('GATHER_HERBS',{targetHerbId:herb}));
    expect(actor(world).herbs[herb]).toBeGreaterThan(prior);
    expect(actor(world).ordinaryActionEvidence).toMatchObject({action:'GATHER_HERBS',tick:world.tick,streak:1});
    world=next(world,act('SOCIALIZE',{targetCultivatorId:peer.id}));
    expect(world.events.find(row=>row.id===`evt-${world.tick}-${initial.id}-social`)?.actorIds).toEqual([initial.id,peer.id]);
    expect(actor(world).ordinaryActionEvidence).toMatchObject({action:'SOCIALIZE',tick:world.tick,streak:1});
    const site='loc-market';
    world=next(world,act('EXPLORE',{targetLocationId:site}));
    expect(actor(world).locationId).toBe(site);
    expect(actor(world).ordinaryActionEvidence).toMatchObject({action:'EXPLORE',tick:world.tick,streak:1});
    expect(Object.keys(actor(world).ordinaryActionEvidence!).sort()).toEqual(['action','streak','tick']);
  });

  it('lets a genuine avatar REST heal and consume its order without ordinary confidence',()=>{
    let world=createInitialWorld(2031);
    const original=actor(world);
    original.hp=Math.round(original.maxHp*.45);
    const oldHp=original.hp;
    expect(possessAvatar(world,original.id)).toBe(true);
    expect(queueAvatarOrder(world,'REST')).toBe(true);
    world=next(world,act('CULTIVATE'));
    expect(actor(world).hp).toBeGreaterThan(oldHp);
    expect(actor(world).currentAction).toBe('REST');
    expect(world.playerAvatar.pendingOrder).toBeUndefined();
    expect(world.decisionTrace.records.find(row=>row.actorId===original.id)?.source).toBe('avatar');
    expect(actor(world).ordinaryActionEvidence).toBeUndefined();
  });

  it('keeps older files neutral, rejects future or fabricated fields and contradicting retained native traces',()=>{
    const newborn=createInitialWorld(2031);
    expect(actor(decodeWorldSave(raw(newborn))).ordinaryActionEvidence).toBeUndefined();
    expect(isOrdinaryActionEvidence({action:'REST',tick:1,streak:3},100)).toBe(false);
    expect(isOrdinaryActionEvidence({action:'REST',tick:Infinity,streak:1},100)).toBe(false);
    let world=next(newborn,act('CULTIVATE'));
    expect(actor(world).ordinaryActionEvidence).toMatchObject({action:'CULTIVATE',tick:world.tick});
    for(const change of [{tick:world.tick+1},{streak:4},{action:'DUEL'},{privateText:'do not persist'}]){
      const edited=structuredClone(world);
      Object.assign(actor(edited).ordinaryActionEvidence!,change);
      expect(()=>decodeWorldSave(raw(edited))).toThrow('ordinaryActionEvidence');
    }
    const forged=structuredClone(world);
    Object.assign(actor(forged).ordinaryActionEvidence!,{action:'REST'});
    expect(()=>decodeWorldSave(raw(forged))).toThrow('cultivators.ordinaryActionEvidence.trace');
    world=decodeWorldSave(encodeWorldSave(world));
    expect(ordinaryActionAttention(actor(world),world.tick+1)).toEqual({last:'CULTIVATE',run:1});
  });
});
