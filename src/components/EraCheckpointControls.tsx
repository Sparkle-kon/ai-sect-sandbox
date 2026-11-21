import type { EraManifest } from '../engine/eraCheckpointEngine';

export type EraCheckpointFileChoice = 'manifest' | number;
interface EraCheckpointControlsProps {
  disabled?: boolean;
  readOnly?: boolean;
  canPrepare?: boolean;
  working?: boolean;
  onCancelWork?: () => void;
  prepared?: EraManifest;
  reviewed?: EraManifest;
  selectedFile?: EraCheckpointFileChoice;
  onPrepare: () => void;
  onSelectFile: (value: EraCheckpointFileChoice | undefined) => void;
  onDownload: (value: EraCheckpointFileChoice) => void;
  onFiles: (files: File[]) => void;
}

const action = 'min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-900 px-2 text-left text-xs text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-50';
const proof = 'min-w-0 whitespace-normal [overflow-wrap:anywhere]';

export function EraCheckpointSummary({ manifest, mode }: { manifest: EraManifest; mode: 'export' | 'restore' }) {
  return (
    <div aria-label={mode === 'export' ? '待下载的检查点摘要' : '待载入的核验摘要'} className="space-y-1.5 rounded border border-slate-800 p-2 text-xs leading-relaxed text-slate-300">
      <p className="text-slate-100">{mode === 'export' ? '文件已准备。请下载清单及全部分块。' : '整套文件已核验，尚未载入。'}</p>
      <p>仙历 {manifest.year} 年 {manifest.month} 月 · 第 {manifest.tick} 轮 · {manifest.parts.length} 块 · {manifest.payloadBytes.toLocaleString('zh-CN')} 字节</p>
      <p className={proof}>文件记载的来源分支：<code>{manifest.source.branchId}</code> · {manifest.source.timelineId ? '附有来源时间线标识' : '未记录来源时间线标识'}。</p>
      <p className={proof}>规则系列：<code>{manifest.ruleset}</code>。</p>
      <p className={proof}>打包规则版本：<code>{manifest.engineRuleVersion}</code></p>
      <p className={proof}>内容校验值（SHA-256）：<code>{manifest.payloadSha256}</code></p>
      <p>校验用于核对文件是否完整，不证明作者或历史推演所用的规则。</p>
    </div>
  );
}

const encodeChoice = (value?: EraCheckpointFileChoice): string => value === undefined ? '' : value === 'manifest' ? value : `part:${value}`;

export function EraCheckpointControls({
  disabled = false, readOnly = false, canPrepare = true, working = false, onCancelWork, prepared, reviewed, selectedFile,
  onPrepare, onSelectFile, onDownload, onFiles,
}: EraCheckpointControlsProps) {
  const validSelection = prepared && (selectedFile === 'manifest' || prepared.parts.some(({ index }) => index === selectedFile))
    ? selectedFile : undefined;
  return <details className="min-w-0 rounded border border-slate-800 bg-slate-950/50">
    <summary className="min-h-11 cursor-pointer px-2 py-2.5 text-xs font-semibold text-sky-100 [overflow-wrap:anywhere]">年代检查点（.era）</summary>
    <div className="space-y-2 px-2 pb-2 text-xs leading-relaxed text-slate-300">
      <p>请把清单和全部分块一同保管。完整检查点包含私密游戏记录；核验只在本机进行。</p>
      <button type="button" className={action} disabled={disabled || !canPrepare} onClick={onPrepare}>准备年代检查点</button>
      {working && onCancelWork && <button type="button" className={action} onClick={onCancelWork}>取消检查点核验</button>}
      {prepared && <>
        <EraCheckpointSummary manifest={prepared} mode="export" />
        <div className="grid min-w-0 gap-1.5 sm:grid-cols-2 sm:items-end">
          <label className="grid min-w-0 gap-1">选择一个文件
            <select className="min-h-11 min-w-0 w-full rounded border border-slate-700 bg-slate-900 px-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-50"
              disabled={disabled} value={encodeChoice(validSelection)} onChange={(event) => {
                const raw = event.currentTarget.value;
                onSelectFile(raw === 'manifest' ? 'manifest' : prepared.parts.find(({ index }) => encodeChoice(index) === raw)?.index);
              }}>
              <option value="">请选择</option>
              <option value="manifest">清单（.era）</option>
              {prepared.parts.map(({ index }, ordinal) => <option value={encodeChoice(index)} key={index}>分块 {ordinal + 1}（{prepared.parts.length === 1 ? '.json' : '.era-part'}）</option>)}
            </select>
          </label>
          <button type="button" className={action} disabled={disabled || validSelection === undefined}
            onClick={() => { if (validSelection !== undefined) onDownload(validSelection); }}>下载所选文件</button>
        </div>
      </>}
      {!readOnly && <label className="grid min-w-0 gap-1">
        选择清单与全部分块进行核验
        <input type="file" multiple accept=".era,.era-part,.json" disabled={disabled}
          className="min-h-11 min-w-0 w-full max-w-full rounded border border-slate-700 bg-slate-900 px-1.5 text-sm file:min-h-11 file:rounded file:bg-slate-800 file:px-2 file:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-50"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length) onFiles(files);
          }} />
      </label>}
      {reviewed && <EraCheckpointSummary manifest={reviewed} mode="restore" />}
    </div>
  </details>;
}
