import { publicChronicleChapters } from '../engine/coldHistoryEngine';
import { useEffect, useRef, useState } from 'react';
import {
  ANNOTATION_MAX_NOTE_CHARS, availableAnnotationTargets, bookmarkableEvent, bookmarkLocation, visibleBookmarks, visibleMapAnnotations,
} from '../engine/annotationsEngine';
import type { WorldState } from '../types/world';
import { annotationWriteIsCurrent } from './annotationUi';
import type { NotebookStamp, NoteCommand, NoteStatus } from './annotationUi';

const field = 'min-h-11 min-w-0 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100';
const button = 'min-h-11 rounded border border-slate-700 bg-slate-950 px-2 text-xs font-medium text-slate-100 disabled:opacity-40';
const block = 'min-w-0 space-y-2 rounded border border-slate-800 bg-slate-950/45 p-2.5';
const messages: Record<NoteStatus, string> = {
  saved: '已保存到当前分支。', stale: '分支或该回合的进度已变化，没有写入。请重新核对。', readonly: '当前时点只读或正在推演，没有写入。',
  interrupted: '未写入。', error: '写入未完成，原记录未改动。', unavailable_event: '该事件不是当前分支可用的公开纪事。',
  unknown_target: '只有当前修士已知的地点或地格可批注。', invalid_text: `批注须非空、不含控制字符，且不超过 ${ANNOTATION_MAX_NOTE_CHARS} 字。`,
  not_found: '该记录不再存在于当前分支。', duplicate: '当前分支已有相同书签。', limit: '当前分支记录已达上限，请先移除不再需要的条目。',
};

type Target = Extract<NoteCommand, { kind: 'add_note' }>['target'];
type Draft = { kind: 'bookmark'; eventId: string } | { kind: 'note'; target: string; text: string } | { kind: 'edit'; noteId: string; text: string }
  | { kind: 'remove'; label: string; command: Extract<NoteCommand, { kind: 'remove_note' | 'remove_bookmark' }> };

export function availableBookmarkEvents(world: WorldState) {
  const ids = new Set([
    ...world.events.map(({ id }) => id),
    ...world.chronicleArchive.anchors.map(({ id }) => id),
    ...publicChronicleChapters(world).flatMap(({ anchors }) => anchors.map(({ id }) => id)),
  ]);
  return [...ids].flatMap((id) => {
    const event = bookmarkableEvent(world, id);
    return event ? [event] : [];
  }).sort((a, b) => b.eventTick - a.eventTick || a.eventId.localeCompare(b.eventId));
}

function readTarget(raw: string): Target | undefined {
  if (raw.startsWith('site:') && raw.length > 5) return { kind: 'site', locationId: raw.slice(5) };
  if (raw.startsWith('tile:') && raw.length > 5) return { kind: 'tile', tileId: raw.slice(5) };
}

export function ChronicleNotebookPanel({ world, actorId, branchId, readOnly, busy, onWrite }: {
  world: WorldState; actorId: string | null; branchId: string; readOnly: boolean; busy: boolean;
  onWrite: (command: NoteCommand, stamp: NotebookStamp, signal: AbortSignal) => Promise<NoteStatus>;
}) {
  const [draft, setDraft] = useState<Draft>();
  const [stamp, setStamp] = useState<NotebookStamp>();
  const [result, setResult] = useState<NoteStatus>();
  const [writing, setWriting] = useState(false);
  const active = useRef<AbortController>();
  const bookmarks = world.annotations ? visibleBookmarks(world) : [];
  const notes = world.annotations ? visibleMapAnnotations(world, actorId) : [];
  const events = readOnly ? [] : availableBookmarkEvents(world).filter((item) => !bookmarks.some(({ eventId }) => eventId === item.eventId));
  const targets = readOnly || !world.annotations ? { sites: [], tiles: [] } : availableAnnotationTargets(world, actorId);
  const stale = stamp !== undefined && (!annotationWriteIsCurrent(stamp, world, branchId, false) || stamp.actorId !== actorId);
  const blocked = readOnly || busy || writing;
  const activeDraft = readOnly || stamp?.branchId !== branchId ? undefined : draft;
  const snapshot = () => ({ world, branchId, actorId });

  useEffect(() => () => active.current?.abort(), []);

  const start = (next: Draft) => {
    if (blocked) return;
    setDraft(next);
    setStamp(snapshot());
    setResult(undefined);
  };
  const clear = () => { setDraft(undefined); setStamp(undefined); };
  const submit = async () => {
    if (blocked || stale || !stamp || !activeDraft || active.current) return;
    let command: NoteCommand | undefined;
    if (activeDraft.kind === 'bookmark') command = activeDraft.eventId ? { kind: 'add_bookmark', eventId: activeDraft.eventId } : undefined;
    if (activeDraft.kind === 'note') {
      const target = readTarget(activeDraft.target);
      if (target) command = { kind: 'add_note', target, text: activeDraft.text };
    }
    if (activeDraft.kind === 'edit') command = { kind: 'edit_note', noteId: activeDraft.noteId, text: activeDraft.text };
    if (activeDraft.kind === 'remove') command = activeDraft.command;
    if (!command) return;
    const controller = new AbortController();
    active.current = controller;
    setWriting(true);
    setResult(undefined);
    try {
      const status = await onWrite(command, stamp, controller.signal);
      if (!controller.signal.aborted && active.current === controller) {
        setResult(status);
        if (status === 'saved') clear();
      }
    } catch {
      if (!controller.signal.aborted) setResult('error');
    } finally {
      if (active.current === controller) {
        active.current = undefined;
        if (!controller.signal.aborted) setWriting(false);
      }
    }
  };
  const draftText = activeDraft?.kind === 'note' || activeDraft?.kind === 'edit' ? activeDraft.text : undefined;
  const invalidDraft = !activeDraft || (activeDraft.kind === 'bookmark' ? !events.some(({ eventId }) => eventId === activeDraft.eventId) :
    activeDraft.kind === 'note' ? !activeDraft.target || !activeDraft.text.trim() : activeDraft.kind === 'edit' ? !activeDraft.text.trim() : false);

  return (
    <section aria-label="本分支的书签与地图批注" className="min-w-0 space-y-2 rounded-xl border border-fuchsia-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-fuchsia-100">本分支的书签与地图批注</h4>
        <p className="text-xs text-slate-300">Tick #{world.tick} · {readOnly ? '历史只读' : '当前回合'}</p>
        <p className="text-xs text-slate-400">书签仅指向公开纪事。批注限于已知地点与地格，随当前分支存档；不从其他分支取用记录。</p>
      </header>
      <div className={block}>
        <h5 className="text-xs font-semibold text-fuchsia-100">公开纪事书签 · {bookmarks.length} 条</h5>
        {bookmarks.length ? <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {bookmarks.map((item) => {
            const location = bookmarkLocation(world, item.id, actorId);
            return <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 rounded bg-slate-900 p-2 text-xs">
              <span className="min-w-0 break-words">Tick #{item.eventTick} · {item.title}{location ? ` · ${location.name}` : ''}</span>
              {!readOnly && <button type="button" className={button} disabled={blocked} onClick={() => start({ kind: 'remove', label: item.title, command: { kind: 'remove_bookmark', bookmarkId: item.id } })}>移除书签</button>}
            </li>;
          })}
        </ul> : <p className="text-xs text-slate-400">本时点暂无书签。</p>}
        {!readOnly && <button type="button" className={button} disabled={blocked || !events.length}
          onClick={() => start({ kind: 'bookmark', eventId: '' })}>添加公开书签</button>}
      </div>
      <div className={block}>
        <h5 className="text-xs font-semibold text-fuchsia-100">可见地图批注 · {notes.length} 条</h5>
        {notes.length ? <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {notes.map(({ note, historical }) => <li key={note.id} className="min-w-0 space-y-1 rounded bg-slate-900 p-2 text-xs">
            <p className="break-words">{note.text}</p>
            <p className="break-words text-slate-400">{note.target.kind === 'site' ? note.target.siteName : '地格批注'}
              {historical ? ' · 原地点已不在地图上，保留记录地格' : ''} · 更新 Tick #{note.updatedTick}</p>
            {!readOnly && <div className="flex flex-wrap gap-1.5">
              <button type="button" className={button} disabled={blocked} onClick={() => start({ kind: 'edit', noteId: note.id, text: note.text })}>修改</button>
              <button type="button" className={button} disabled={blocked} onClick={() => start({ kind: 'remove', label: note.text, command: { kind: 'remove_note', noteId: note.id } })}>删除批注</button>
            </div>}
          </li>)}
        </ul> : <p className="text-xs text-slate-400">本时点没有可见批注。</p>}
        {!readOnly && <button type="button" className={button} disabled={blocked || !targets.sites.length && !targets.tiles.length}
          onClick={() => start({ kind: 'note', target: '', text: '' })}>添加地图批注</button>}
      </div>
      {activeDraft && <form className={block} aria-label="编辑本分支记录" onSubmit={(event) => { event.preventDefault(); if (!invalidDraft) void submit(); }}>
        {activeDraft.kind === 'bookmark' && <label className="grid min-w-0 gap-1 text-xs text-slate-300">公开纪事
          <select className={field} disabled={writing} value={activeDraft.eventId} onChange={(event) => setDraft({ ...activeDraft, eventId: event.currentTarget.value })}>
            <option value="">请选择</option>
            {events.map(({ eventId, eventTick, title }) => <option key={eventId} value={eventId}>Tick #{eventTick} · {title.slice(0, 80)}</option>)}
          </select>
        </label>}
        {activeDraft.kind === 'note' && <label className="grid min-w-0 gap-1 text-xs text-slate-300">批注位置
          <select className={field} disabled={writing} value={activeDraft.target} onChange={(event) => setDraft({ ...activeDraft, target: event.currentTarget.value })}>
            <option value="">请选择</option>
            <optgroup label="已知地点">{targets.sites.map(({ id, name }) => <option key={id} value={`site:${id}`}>{name}</option>)}</optgroup>
            <optgroup label="已知地格">{targets.tiles.map(({ id, col, row }) => <option key={id} value={`tile:${id}`}>第 {row + 1} 行，第 {col + 1} 列</option>)}</optgroup>
          </select>
        </label>}
        {draftText !== undefined && (activeDraft.kind === 'note' || activeDraft.kind === 'edit') && <label className="grid min-w-0 gap-1 text-xs text-slate-300">单行批注（最多 {ANNOTATION_MAX_NOTE_CHARS} 字）
          <textarea className={field} disabled={writing} rows={3} maxLength={ANNOTATION_MAX_NOTE_CHARS} value={draftText} onChange={(event) => setDraft({ ...activeDraft, text: event.currentTarget.value })} />
        </label>}
        {activeDraft.kind === 'remove' && <p className="break-words text-xs text-amber-200">从本分支移除「{activeDraft.label}」？不会删除纪事本身。</p>}
        {stale && <p className="text-xs text-amber-200">当前回合或修士视角已变化。请重新核对所选目标。</p>}
        <div className="flex flex-wrap gap-1.5">
          {stale ? <button type="button" className={button} disabled={blocked} onClick={() => setStamp(snapshot())}>重新核对本分支</button>
            : <button type="submit" className={button} disabled={blocked || invalidDraft}>{activeDraft.kind === 'remove' ? '确认移除记录' : '保存到当前分支'}</button>}
          <button type="button" className={button} disabled={writing} onClick={clear}>取消</button>
        </div>
      </form>}
      <p role="status" className="break-words text-xs text-fuchsia-200">{writing ? '正在写入当前分支…' : result ? messages[result] : ''}</p>
    </section>
  );
}
