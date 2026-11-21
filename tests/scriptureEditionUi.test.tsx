import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { ScriptureEditionPanel } from '../src/components/ScriptureEditionPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { registerScriptureOriginal, resolveScriptureAction } from '../src/engine/scriptureEngine';
import type { ScriptureEdition, Technique } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 8;
  const [actor, annotator, hiddenAuthor] = world.cultivators;
  const sect = world.sects.find(({ id }) => id === actor.sectId)!;
  const local = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const distant = world.locations.find(({ id }) => id !== local.id && !world.sects.some(({ headquartersId }) => headquartersId === id))!;
  local.name = '可核对的宗门阁址';
  distant.name = '不可公开的异本地点';
  annotator.name = '本地署名者';
  hiddenAuthor.name = '异地不可见署名者';
  actor.locationId = local.id;
  actor.techniqueMastery = 65;
  actor.spiritStones = 60;
  actor.authoredTechnique = undefined;
  const text: Technique = { id: 'harmony-canon', name: '和光原典', spiritRoot: '木', createdTick: 1, authorId: annotator.id };
  actor.technique = { ...text };
  sect.pavilion.push({ ...text });
  world.tick = 1;
  registerScriptureOriginal(world, text, 'pavilion', local.id, sect.id);
  world.tick = 8;
  const misread: ScriptureEdition = { id: 'private-id-misread', originalId: text.id!, authorId: annotator.id,
    kind: 'misread', locationId: local.id, createdTick: 4 };
  world.scriptures.editions.push(misread,
    { ...misread, id: 'private-id-local-gloss', kind: 'gloss', createdTick: 5 },
    { ...misread, id: 'private-id-remote', kind: 'corrected', authorId: hiddenAuthor.id, locationId: distant.id, createdTick: 6 });
  actor.activeEdition = { originalId: text.id!, editionId: misread.id, kind: 'misread' };
  const html = (person = actor) => renderToStaticMarkup(<ScriptureEditionPanel world={world} actor={person} />);
  return { world, actor, annotator, hiddenAuthor, local, distant, misread, html };
}

describe('scripture catalog and local correction display', () => {
  it('compares the actual immutable original with visible attributed editions and truthful active tradeoffs', () => {
    const { html } = fixture();
    const output = html();
    expect(output).toMatch(/<details(?![^>]*\bopen)[^>]*><summary[^>]*>经义校勘/);
    expect(output).toContain('底本 · 和光原典');
    expect(output).toContain('藏经阁传本 · 灵根 木');
    expect(output).toContain('可核对的宗门阁址');
    expect(output).toContain('当前采用：偏读异本 · 战斗 -12% · 修习 +14%');
    expect(output).toContain('据本笺注 · 本地署名者');
    expect(output).toContain('采用后：战斗 +2% · 修习 +4%');
    expect(output).not.toContain('异地不可见署名者');
    expect(output).not.toContain('不可公开的异本地点');
    expect(output).not.toContain('private-id');
  });

  it('only advertises a valid comparison and shows the recorded corrected lineage after a real action', () => {
    const { world, actor, misread, distant, html } = fixture();
    expect(html()).toContain('熟练度至少 65/100、25 灵石');
    expect(html()).toContain('此本在当前位置可对照校订');
    actor.locationId = distant.id;
    expect(html()).toContain('此处无可校订的异本');
    expect(html()).toContain('当前采用：偏读异本');
    actor.locationId = misread.locationId;
    const correctedEvent = resolveScriptureAction(world, actor, { chosenAction: 'SCRIPTURE', editionMove: 'compare', targetScriptureEditionId: misread.id, innerMonologue: '' });
    expect(correctedEvent).not.toBeNull();
    expect(actor.spiritStones).toBe(35);
    const made = world.scriptures.editions.find(({ parentEditionId }) => parentEditionId === misread.id)!;
    expect(html()).toContain('据本校订');
    expect(html()).toContain('所据版本：偏读异本');
    expect(html()).toContain('校验见证：藏经阁底本 · 可核对的宗门阁址');
    expect(html()).not.toContain('此本在当前位置可对照校订');
    resolveScriptureAction(world, actor, { chosenAction: 'SCRIPTURE', editionMove: 'adopt', targetScriptureEditionId: made.id, innerMonologue: '' });
    expect(html()).toContain('当前采用：据本校订 · 战斗 +8% · 修习 +8%');
    actor.alive = false;
    expect(html()).toContain('当前无生效异本');
  });

  it('keeps the catalog out of the homepage, unrelated profiles, and actors who never practiced the original', () => {
    const { world, actor, annotator, html } = fixture();
    const inspect = (person: typeof actor, workspaceSection: 'profile' | 'cultivation') => renderToStaticMarkup(
      <AgentInspector world={world} cultivator={person} onSelectCultivator={() => undefined} workspaceSection={workspaceSection} />);
    expect(renderToStaticMarkup(<App />)).not.toContain('经义校勘');
    expect(inspect(actor, 'profile')).not.toContain('经义校勘');
    expect(inspect(annotator, 'cultivation')).not.toContain('经义校勘');
    expect(inspect(actor, 'cultivation')).toContain('载入经义校勘');
    expect(html(annotator)).toBe('');
  });
});
