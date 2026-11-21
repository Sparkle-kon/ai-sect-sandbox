import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EraDesignFields, EraDesignPanel, EraDesignPreview, eraDesignDraftFromBuffer, makeEraDesignBuffer } from '../src/components/EraDesignPanel';
import { ScenarioPanel } from '../src/components/ScenarioPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { eraDesignCatalog, ERA_DESIGN_STORAGE_KEY, previewEraDesignDraft, readEraDesignDraft, writeEraDesignDraft } from '../src/engine/eraDesignDraft';

function conflictingDraft() {
  const world = createInitialWorld(2031, 'classic');
  const catalog = eraDesignCatalog(world.random.seed, 'classic');
  const shared = catalog.depletionSites.find(site => catalog.northSites.some(entry => entry.id === site.id))!;
  const buffer = makeEraDesignBuffer({ seed: world.random.seed, profileId: 'classic', anchor: { year: world.year, month: world.month } });
  buffer.year = String(world.year + 1);
  buffer.month = String(world.month);
  buffer.depletion = { siteId: shared.id, qi: '10', jade: '0' };
  buffer.move = { destinationId: shared.id, memberIds: catalog.danxiaMembers.slice(0, 3).map(member => member.id), stones: '50' };
  return { world, catalog, shared, buffer };
}

describe('bounded author chronology', () => {
  it('mounts one closed draft section inside existing ScenarioPanel without new apply controls', () => {
    const { world } = conflictingDraft();
    const inner = renderToStaticMarkup(<EraDesignPanel world={world} />);
    expect(inner).toMatch(/^<details class=/);
    expect(inner).toContain('写下纪元条件');
    expect(inner).toContain('这些是作者设定，不是自然实录');
    expect(inner).toContain('打开本机草案');
    expect(inner).not.toMatch(/<details[^>]* open|确认载入|开局按钮|保存到本机草案/);
    const parent = renderToStaticMarkup(<ScenarioPanel world={world} busy={false} onApply={() => { throw Error('must not apply'); }} />);
    expect(parent.match(/写下纪元条件/g)).toHaveLength(1);
    expect(parent).toContain('离线预演');
  });

  it('keeps real named candidates and no world IDs in the editable DOM, and rejects incomplete dates or fields', () => {
    const { catalog, shared, buffer } = conflictingDraft();
    const html = renderToStaticMarkup(<EraDesignFields buffer={buffer} catalog={catalog} onChange={() => {}} />);
    expect(html).toContain('目标月（1–12）');
    expect(html).toContain(shared.name);
    expect(html).toMatch(/value="[0-9]+" selected=""/);
    expect(html).not.toContain(shared.id);
    for (const member of catalog.danxiaMembers) expect(html).not.toContain(member.id);
    expect(() => eraDesignDraftFromBuffer({ ...buffer, year: '' })).toThrow(/目标年/);
    expect(() => eraDesignDraftFromBuffer({ ...buffer, month: '13' })).toThrow(/目标月/);
    expect(() => eraDesignDraftFromBuffer({ ...buffer, move: undefined })).toThrow(/两至三项/);
  });

  it('shows the native same-land conflict and still round-trips a detached local draft', () => {
    const { world, buffer } = conflictingDraft();
    const draft = eraDesignDraftFromBuffer(buffer);
    const liveBefore = JSON.stringify(world);
    const current = { year: world.year + 1, month: world.month };
    const preview = previewEraDesignDraft(draft, current);
    expect(preview.ready).toBe(false);
    expect(preview.issues.map(item => item.code)).toContain('insufficient_land_support');
    const html = renderToStaticMarkup(<EraDesignPreview preview={preview} />);
    expect(html).toContain('草案有冲突：不能用于开局，仍可保存草案');
    expect(html).toContain('作者设定');
    expect(html).toContain('拟址剩余灵气 10');
    expect(html).toContain('还未开启新纪元'.replace('还未', '尚未'));
    expect(html).not.toMatch(/<button|loc-vein-north|<form/);
    const cells = new Map([['original-world-save', 'untouched']]);
    const storage = { getItem: (key:string) => cells.get(key) ?? null, setItem: (key:string, value:string) => { cells.set(key, value); } };
    expect(writeEraDesignDraft(draft, storage)).toBe(true);
    const reopened = readEraDesignDraft(storage)!;
    expect(reopened).toEqual(draft);
    expect(makeEraDesignBuffer(reopened).anchor).toEqual(buffer.anchor);
    expect(cells.get('original-world-save')).toBe('untouched');
    expect(cells.has(ERA_DESIGN_STORAGE_KEY)).toBe(true);
    expect(JSON.stringify(world)).toBe(liveBefore);
  });
});
