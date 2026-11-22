import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ChronicleReading } from '../engine/novelGenerator';
import type { ChronicleBookSource } from './chronicleBookSources';
import { PublicDialogueTranscript } from './PublicDialogueTranscript';

export interface ChronicleBookPageProps {
  reading: ChronicleReading;
  resolveSources: (ids: readonly string[], priorChapterId?: string) => readonly ChronicleBookSource[];
}

interface ParagraphProps {
  text: string;
  continuity?: 'opening' | 'closing';
  sources: readonly ChronicleBookSource[];
  noteNumber: number;
  open: boolean;
  setOpen: (value: boolean) => void;
}

function ChronicleBookParagraph({text,continuity,sources,noteNumber,open,setOpen}:ParagraphProps) {
  const noteId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open && sources.length) heading.current?.focus();
  }, [open, sources.length]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const handleEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    close();
  };
  return <>
    <p data-chronicle-continuity={continuity} className="whitespace-pre-wrap break-words">
      <span data-chronicle-paragraph-text>{text}</span>
      {sources.length > 0 && (
        <button ref={trigger} type="button" aria-label={`第 ${noteNumber} 条史料注`} aria-expanded={open}
          aria-controls={noteId} onClick={() => open ? close() : setOpen(true)} onKeyDown={handleEscape}
          className="inline-grid min-h-11 min-w-11 place-items-center rounded align-baseline font-serif text-[0.625rem] leading-none text-amber-200/65 hover:bg-amber-300/10 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
          〔注{noteNumber}〕
        </button>
      )}
    </p>
    {sources.length > 0 && <aside id={noteId} hidden={!open} aria-labelledby={`${noteId}-heading`} onKeyDown={handleEscape}
      className="ml-1 space-y-2 border-l border-amber-300/40 pl-3 text-sm leading-6 text-slate-200">
      {open && <>
        <h6 ref={heading} tabIndex={-1} id={`${noteId}-heading`} className="font-medium text-amber-100 outline-none">注{noteNumber} · 原录</h6>
        <ol className="space-y-3">
          {sources.map((source, index) => (
            <li key={index} className="min-w-0 break-words">
              <p className="text-xs text-slate-400">
                {source.chapterNumber !== undefined && `上回史料 · 第 ${source.chapterNumber} 章 · `}仙历 {source.year} 年 {source.month} 月
              </p>
              <p className="text-amber-100">{source.title}</p>
              {source.detail && <p className="whitespace-pre-wrap">{source.detail}</p>}
              {source.dialogue && <PublicDialogueTranscript provenance={source.dialogue} />}
            </li>
          ))}
        </ol>
        <button type="button" onClick={close}
          className="min-h-11 rounded px-2 text-xs text-amber-200 hover:bg-amber-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
          收起此注
        </button>
      </>}
    </aside>}
  </>;
}

/** The editor groups the prose; only that exact paragraph's proven receipts belong in its marginal note. */
export function ChronicleBookPage({ reading, resolveSources }: ChronicleBookPageProps) {
  const [openNote, setOpenNote] = useState<string>();
  const title = <h4 className="break-words font-serif text-lg font-semibold tracking-[0.12em] text-amber-100 sm:text-xl">{reading.title}</h4>;
  if (!reading.beats.length)
    return <header className="space-y-3">{title}<p className="text-sm text-slate-400">本章没有可写成场景的公开史料。</p></header>;

  let noteNumber = 0;
  const paragraph = (key: string, text: string, ids: readonly string[], continuity?: 'opening' | 'closing', priorChapterId?: string) => {
    const sources = ids.length ? priorChapterId === undefined ? resolveSources(ids) : resolveSources(ids,priorChapterId) : [];
    // Private component identity only; never serialized to the document.
    const note = JSON.stringify([key,priorChapterId,ids,text,sources]);
    return <ChronicleBookParagraph key={note} text={text} continuity={continuity} sources={sources}
      noteNumber={sources.length ? ++noteNumber : 0} open={openNote === note}
      setOpen={value=>setOpenNote(value ? note : undefined)} />;
  };
  const opening = reading.continuity?.opening;
  const closing = reading.continuity?.closing;

  return <div data-chronicle-prose className="mx-auto max-w-[44rem] space-y-4 px-0.5 font-serif text-[0.9375rem] leading-[1.95] tracking-[0.025em] text-slate-100 sm:space-y-5 sm:px-3 sm:text-base sm:leading-[2.05]">
    {title}
    {opening && paragraph('continuityOpening',opening.text,[opening.eventId],'opening',opening.chapterId)}
    {reading.beats.map((beat,index) => (
      <div key={`${beat.kind}:${index}`} data-chronicle-beat={beat.kind} className="min-w-0 space-y-3">
        {beat.kind === 'focal' && beat.title &&
          <h5 className="break-words pb-0.5 pt-1 text-[0.9375rem] font-semibold tracking-[0.10em] text-amber-100">{beat.title}</h5>}
        {beat.paragraphs.map((text,paragraphIndex) =>
          paragraph(`${index}:${paragraphIndex}`,text,beat.paragraphEventIds[paragraphIndex] ?? []))}
      </div>
    ))}
    {closing && paragraph('continuityClosing',closing.text,[closing.eventId],'closing')}
  </div>;
}
