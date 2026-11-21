import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { ServiceRetirementPanel } from '../src/components/ServiceRetirementPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveServiceRetirementAction } from '../src/engine/serviceRetirementEngine';

function fixture() {
  const world = createInitialWorld();
  world.tick = 16;
  const [sect] = world.sects;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const successor = world.cultivators.find(({ id, sectId }) => id !== leader.id && sectId === sect.id)!;
  leader.name = '实际退居者';
  successor.name = '已确认新掌门';
  const ui = (actor = leader) => renderToStaticMarkup(<ServiceRetirementPanel world={world} cultivator={actor} />);
  const retire = () => resolveServiceRetirementAction(world, leader, { innerMonologue: '', chosenAction: 'SECT_SERVICE', serviceMove: 'retire' });
  return { world, sect, leader, successor, ui, retire };
}

describe('voluntary service retirement existing character details', () => {
  it('adds only a selected actual retirement fold and preserves rank without claiming an unassigned successor', () => {
    const { world, sect, leader, successor, ui, retire } = fixture();
    expect(ui()).toBe('');
    expect(retire()).toBeTruthy();
    const markup = renderToStaticMarkup(<AgentInspector world={world} cultivator={leader} workspaceSection="profile" onSelectCultivator={() => {}} />);
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">告老退居与自愿复出/);
    expect(ui()).toContain('当前已主动退居，不承接公职');
    expect(ui()).toContain('退居时记录位阶');
    expect(ui()).toContain('· 掌门 · 变更 Tick #16');
    expect(ui()).toContain('已实际卸任：掌门职责、宗门议事职责');
    expect(ui()).toContain('最早可于 Tick #19 审核自愿复出');
    expect(ui()).not.toContain('当前公职：掌门');
    expect(ui()).not.toContain('本轮交接记录');
    sect.succession = { tick: 17, method: 'election', previousLeaderId: leader.id, leaderId: successor.id, supporterIds: [] };
    expect(ui()).not.toContain('本轮交接记录');
    sect.succession.tick = 16;
    expect(ui()).toContain('本轮交接记录：已确认新掌门接任掌门');
    expect(renderToStaticMarkup(<App />)).not.toContain('告老退居与自愿复出');
  });

  it('shows actual voluntary return independent from prior rank and does not restore lost role', () => {
    const { world, sect, leader, successor, retire, ui } = fixture();
    expect(retire()).toBeTruthy();
    const old = structuredClone(world);
    world.tick = 19;
    sect.leaderId = successor.id;
    leader.sectRank = '长老';
    expect(ui()).toContain('此时符合自愿复出条件，须本人另行决定');
    expect(resolveServiceRetirementAction(world, leader, { innerMonologue: '', chosenAction: 'SECT_SERVICE', serviceMove: 'return' })).toBeTruthy();
    expect(ui()).toContain('当前未退居，实际任事以派任为准');
    expect(ui()).toContain('Tick #19 · 本人自愿复出 · 当时记录位阶 掌门');
    expect(ui()).not.toContain('当前公职：掌门');
    expect(ui()).toContain('复出只是重新可任事，不自动恢复旧职');
    const historic = renderToStaticMarkup(<ServiceRetirementPanel world={old} cultivator={old.cultivators.find(({ id }) => id === leader.id)!} />);
    expect(historic).toContain('当前已主动退居');
    expect(historic).not.toContain('Tick #19 · 本人自愿复出');
  });

  it('shows only selected release proof; death is a historical note rather than renewed retirement', () => {
    const { world, leader, successor, retire, ui } = fixture();
    expect(retire()).toBeTruthy();
    expect(ui(successor)).toBe('');
    const site = world.locations.find(({ id }) => id === leader.locationId)!;
    site.name = '旧驻守地点';
    const old = world.serviceRetirement.history[0];
    old.guardLocationId = site.id;
    old.stewardSchoolIds = ['hidden-steward-id'];
    old.infirmaryShiftIds = ['hidden-shift-id'];
    leader.alive = false; leader.hp = 0;
    expect(ui()).toContain('已陨落，以下为生前任事留档');
    expect(ui()).toContain('驻守职责（旧驻守地点）');
    expect(ui()).toContain('道统护持 1 处');
    expect(ui()).toContain('静养院值守 1 班');
    expect(ui()).not.toContain('审核自愿复出');
    expect(ui()).not.toContain('hidden-steward-id');
    expect(ui()).not.toContain('hidden-shift-id');
  });
});
