import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  canDownloadShareSave, sameStorageReview, ShareSavePrivacyConfirmation, ShareSavePrivacySummary, WorldStoragePanel,
} from '../src/components/WorldStoragePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyAnnotation } from '../src/engine/annotationsEngine';
import { inspectShareSavePrivacy, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { createTimeline } from '../src/engine/timelineEngine';

const personalThought = '仅限本人·原始心声';
const personalNote = '这条地图批注不应展示';
const privateBranch = '绝密原支名字';

function fixture() {
  let world = createInitialWorld(9187);
  const actor = world.cultivators[0];
  actor.innerMonologue = personalThought;
  const saved = applyAnnotation(world, actor.id, {
    kind: 'add_note', target: { kind: 'site', locationId: actor.locationId }, text: personalNote,
  });
  if (!saved.ok) throw new Error('expected real annotation');
  world = saved.world;
  return world;
}

describe('counts-only share privacy inside existing JSON file preflight', () => {
  it('does not render a privacy summary or either download before existing manual preflight', () => {
    const world = fixture();
    const markup = renderToStaticMarkup(<WorldStoragePanel world={world} busy={false}
      sourceBranch={{ branchId: 'branch-real', label: privateBranch, timelineId: 'timeline-real' }}
      onRestore={() => false} onNewWorld={() => false} />);
    expect(markup).toContain('预检当前世界 JSON');
    expect(markup).not.toContain('下载已预检 JSON');
    expect(markup).not.toContain('准备脱敏分享副本');
    expect(markup).not.toContain('确认并下载脱敏副本');
    for (const secret of [personalNote, personalThought, privateBranch]) expect(markup).not.toContain(secret);
  });

  it('renders only counts on manual preflight and a separate eligible confirm after actual verified review', () => {
    const world = fixture();
    const onPrepare = vi.fn(), onConfirm = vi.fn(), onCancel = vi.fn();
    const summary = inspectShareSavePrivacy(world);
    const before = renderToStaticMarkup(<ShareSavePrivacySummary inspection={summary} onPrepare={onPrepare} />);
    expect(before).toMatch(/地图私密批注：<\/dt><dd>1<\/dd>/);
    expect(before).toContain('热、冷档章节正文');
    expect(before).toContain('世界 JSON 不含时间线分支名称');
    expect(before).toContain('人物名称、流言、封缄记录、章节标题及其他叙事文字可能仍在');
    expect(before).toContain('不保证复演出相同行动');
    expect(before).toContain('准备脱敏分享副本');
    expect(before).not.toContain('确认并下载脱敏副本');

    const review = prepareShareSavePrivacy(world);
    expect(canDownloadShareSave(review)).toBe(true);
    const confirm = renderToStaticMarkup(<ShareSavePrivacyConfirmation review={review} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(confirm).toContain('已核对：人物、地点、宗门、村镇的数目都没变');
    expect(confirm).toContain('仍由第三方保管的款物也照旧');
    expect(confirm).toContain('化身绑定：无 · 待执行指令：无');
    expect(confirm).toContain('只下载新副本到本机，不上传');
    expect(confirm).toContain('确认并下载脱敏副本');
    expect(confirm).toContain('取消脱敏副本预览');
    for (const secret of [personalNote, personalThought, privateBranch, world.cultivators[0].name]) {
      expect(before + confirm).not.toContain(secret);
    }
    expect(onPrepare).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fails closed for invalid, unverified and oversized reviews, and expires on any exact context component', () => {
    const world = fixture();
    const copy = prepareShareSavePrivacy(world);
    const noOp = () => undefined;
    for (const review of [
      { ...copy, status: 'invalid_source' as const },
      { ...copy, status: 'invalid_copy' as const },
      { ...copy, protectedStateVerified: false },
      { ...copy, redactedBytes: copy.limitBytes + 1 },
      { ...copy, redactedBytes: null },
    ]) {
      expect(canDownloadShareSave(review)).toBe(false);
      const markup = renderToStaticMarkup(<ShareSavePrivacyConfirmation review={review} onConfirm={noOp} onCancel={noOp} />);
      expect(markup).not.toContain('确认并下载脱敏副本');
    }
    const timeline = createTimeline(world);
    const stamp = { world, version: 19, branchId: 'branch-a', timelineId: 'timeline-a' };
    const review = { stamp, timeline, result: copy };
    expect(sameStorageReview(review, { ...stamp }, timeline)).toBe(true);
    expect(sameStorageReview(review, { ...stamp }, { ...timeline })).toBe(false);
    expect(sameStorageReview(review, { ...stamp, world: structuredClone(world) }, timeline)).toBe(false);
    expect(sameStorageReview(review, { ...stamp, version: 20 }, timeline)).toBe(false);
    expect(sameStorageReview(review, { ...stamp, branchId: 'branch-b' }, timeline)).toBe(false);
    expect(sameStorageReview(review, { ...stamp, timelineId: 'timeline-b' }, timeline)).toBe(false);
  });
});
