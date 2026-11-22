import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { labelAction,labelPublicMapAction,labelTraceAction } from '../src/components/actionLabels';
import { projectMapEntityPopover } from '../src/components/mapEntityPopoverModel';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import type { ActionType,LLMDecisionPayload,WorldState } from '../src/types/world';

const inspect=(world:WorldState,actor=world.cultivators[0])=>renderToStaticMarkup(
  <AgentInspector world={world} cultivator={actor} workspaceSection="profile" onSelectCultivator={()=>undefined}/>,
);

describe('Chinese action presentation without renaming or disclosing native commands',()=>{
  it.each([
    ['CULTIVATE','吐纳修炼'],['BREAKTHROUGH','破境冲关'],['EXPLORE','御剑游历'],['SOCIALIZE','品茗论道'],
    ['DUEL','生死斗法'],['SCHEMING','暗中谋划'],['REST','闭关调息'],
    ['ASCENSION','叩飞升天关'],['DAO_PATH','修习本命道途'],['FRONTIER_DRYLAND','旱地水牧'],
  ] satisfies Array<[ActionType,string]>)('translates %s without exposing that code in the status badge',(action,copy)=>{
    const world=createInitialWorld(12),actor=world.cultivators[0];
    actor.currentAction=action;
    const html=inspect(world);
    expect(labelAction(action)).toBe(copy);
    expect(html).toContain(`当前：${copy}`);
    expect(html).not.toContain(action);
  });

  it('fails closed on unknown or inherited names; an already fallen actor still has her independent life status',()=>{
    for(const unknown of [undefined,null,'CULTIVATE_LATER','constructor','__proto__','toString',{action:'CULTIVATE'}]){
      expect(labelAction(unknown)).toBe('行事中');
      expect(labelPublicMapAction(unknown)).toBe('行事中');
      expect(labelTraceAction(unknown)).toBe('未公开行动');
    }
    const world=createInitialWorld(12),actor=world.cultivators[0];
    actor.currentAction='UNATTESTED_ACT' as ActionType;
    expect(inspect(world)).toContain('当前：行事中');
    expect(inspect(world)).not.toContain('UNATTESTED_ACT');
    actor.alive=false;actor.hp=0;
    expect(inspect(world)).toContain('已陨落');
    expect(inspect(world)).not.toContain('当前：行事中');
  });

  it('keeps the original map and trace scope instead of expanding it to every translated action',()=>{
    const world=createInitialWorld(12),actor=world.cultivators[0],view=createTerrainMapView(world,actor,false);
    const target={kind:'actor' as const,id:actor.id};
    actor.currentAction='CULTIVATE';
    expect(projectMapEntityPopover(world,view,target)).toMatchObject({kind:'actor',actionLabel:'吐纳修炼'});
    for(const action of ['FORBIDDEN_ART','CULTIVATION_CLAN','IMMORTAL_AUCTION','SCHEMING'] as const){
      actor.currentAction=action;
      expect(labelAction(action)).not.toBe('行事中');
      const publicRead=projectMapEntityPopover(world,view,target);
      expect(publicRead).toMatchObject({kind:'actor',actionLabel:'行事中'});
      expect(JSON.stringify(publicRead)).not.toContain(labelAction(action));
      expect(labelTraceAction(action)).toBe('未公开行动');
    }
    expect(labelTraceAction('redacted')).toBe('未公开行动');
    expect(labelTraceAction('CULTIVATE')).toBe('修炼');
    expect(labelTraceAction('REST')).toBe('调息');
  });

  it.each(['utility','deferred'] as const)('reads a real %s action, leaving strict save and trace wires unchanged',mode=>{
    const base=createInitialWorld(12),actor=base.cultivators[0];
    const command:LLMDecisionPayload={chosenAction:'CULTIVATE',innerMonologue:'不歇行功。'};
    const world=advanceWorldTick(base,{[actor.id]:command},()=>.8,mode,undefined,
      {modelActors:new Set(mode==='deferred'?[actor.id]:[])});
    const current=world.cultivators.find(row=>row.id===actor.id)!;
    expect(current.currentAction).toBe('CULTIVATE');
    expect(world.decisionTrace.records.find(row=>row.actorId===actor.id&&row.tick===world.tick))
      .toMatchObject({chosenAction:'CULTIVATE',source:mode==='deferred'?'model':'utility',applied:true});
    const before=encodeWorldSave(world);
    expect(inspect(world,current)).toContain('当前：吐纳修炼');
    expect(encodeWorldSave(world)).toBe(before);
    expect(decodeWorldSave(before).cultivators.find(row=>row.id===current.id)?.currentAction).toBe('CULTIVATE');
  });
});
