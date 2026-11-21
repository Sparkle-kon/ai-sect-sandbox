import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EraCheckpointControls, EraCheckpointSummary } from '../src/components/EraCheckpointControls';
import type { EraManifest } from '../src/engine/eraCheckpointEngine';

const noAction = () => { throw new Error('rendering must not read, write, download or apply a file'); };
const callbacks = { onPrepare: noAction, onSelectFile: noAction, onDownload: noAction, onFiles: noAction };
const hash = 'a'.repeat(64);
const ruleHash = 'b'.repeat(64);
const manifest = {
  format: 'ai-sect-era-checkpoint', version: 1, ruleset: 'sect-world-checkpoint-v1', engineRuleVersion: ruleHash, id: 'c'.repeat(64),
  source: { branchId: 'branch-2', label: 'private-slot-label-not-for-display', timelineId: 'private-timeline-id' },
  tick: 1201, year: 1101, month: 1, payloadBytes: 9 * 1024 ** 2,
  payloadSha256: hash, parts: [0, 1, 2].map((index) => ({ index, byteLength: (index < 2 ? 4 : 1) * 1024 ** 2, sha256: hash })),
} satisfies EraManifest;

describe('portable checkpoints inside the existing save workspace', () => {
  it('has one initially closed fold with a native multipart file selector and no side effects', () => {
    const html = renderToStaticMarkup(<EraCheckpointControls {...callbacks} />);
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
    expect(html).toContain('年代检查点（.era）');
    expect(html).toContain('请把清单和全部分块一同保管');
    expect(html).toMatch(/type="file" multiple="" accept="\.era,\.era-part,\.json"/);
    expect(html).not.toContain('下载所选文件');
  });

  it('requires one explicit exact file choice and provides no multi-download shortcut', () => {
    const unchosen = renderToStaticMarkup(<EraCheckpointControls {...callbacks} prepared={manifest} selectedFile={9} />);
    expect(unchosen).toMatch(/<button type="button"[^>]*disabled=""[^>]*>下载所选文件/);
    const chosen = renderToStaticMarkup(<EraCheckpointControls {...callbacks} prepared={manifest} selectedFile={0} />);
    expect(chosen).toContain('value="part:0" selected="">分块 1（.era-part）');
    expect(chosen).toContain('清单（.era）');
    expect(chosen.match(/>下载所选文件<\/button>/g)).toHaveLength(1);
    expect(chosen).not.toContain('下载全部');
  });

  it('shows precise verified provenance and makes clear verification is not application or authorship', () => {
    const html = renderToStaticMarkup(<EraCheckpointSummary manifest={manifest} mode="restore" />);
    expect(html).toContain('整套文件已核验，尚未载入');
    expect(html).toContain('仙历 1101 年 1 月 · 第 1201 轮 · 3 块');
    expect(html).toContain('branch-2');
    expect(html).toContain('sect-world-checkpoint-v1');
    expect(html).toContain(hash);
    expect(html).toContain(ruleHash);
    expect(html).toContain('不证明作者或历史推演所用的规则');
    expect(html).not.toMatch(/private-|<button/);
  });
});
