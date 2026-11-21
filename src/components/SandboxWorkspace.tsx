import { BookOpen, ChevronDown, Globe2, Landmark, Map, Users } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { chooseWorkspaceSection } from './workspacePreferences';

export const SANDBOX_VIEWS = [
  { id: 'map', label: '地图', Icon: Map }, { id: 'people', label: '人物', Icon: Users },
  { id: 'chronicle', label: '纪事', Icon: BookOpen }, { id: 'sect', label: '宗门', Icon: Landmark },
  { id: 'world', label: '世界', Icon: Globe2 },
] as const;
export type WorkspaceId = (typeof SANDBOX_VIEWS)[number]['id'];

export function SandboxWorkspace({ active, onChange, views, panelLead, autoFocusTab = true, hideActiveContent = false }: {
  active: WorkspaceId; onChange: (view: WorkspaceId) => void; views: Record<WorkspaceId, ReactNode>;
  panelLead?: ReactNode; autoFocusTab?: boolean; hideActiveContent?: boolean;
}) {
  const uid = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = SANDBOX_VIEWS.findIndex(({ id }) => id === active);
  const previousView = useRef(active);
  useEffect(() => {
    if (previousView.current === active) return;
    previousView.current = active;
    // Also returns focus to the visible tab after a panel-local navigation shortcut.
    if (autoFocusTab) buttons.current[activeIndex]?.focus({ preventScroll: true });
  }, [active, activeIndex, autoFocusTab]);
  const change = (next: WorkspaceId) => {
    onChange(next);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    let index = activeIndex;
    if (event.key === 'ArrowRight') index = (activeIndex + 1) % SANDBOX_VIEWS.length;
    else if (event.key === 'ArrowLeft') index = (activeIndex + SANDBOX_VIEWS.length - 1) % SANDBOX_VIEWS.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = SANDBOX_VIEWS.length - 1;
    else return;
    event.preventDefault();
    change(SANDBOX_VIEWS[index].id);
    buttons.current[index]?.focus({ preventScroll: true });
  };
  return (
    <>
      <nav aria-label="沙盒工作区" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:static lg:border-t-0 lg:border-b lg:pb-0">
        <div role="tablist" aria-label="工作区" onKeyDown={key} className="mx-auto grid w-full max-w-6xl grid-cols-5 gap-1 px-2 py-1 sm:px-4 lg:w-fit lg:gap-3">
          {SANDBOX_VIEWS.map(({ id, label, Icon }, index) => (
            <button key={id} id={`${uid}-tab-${id}`} ref={(node) => { buttons.current[index] = node; }}
              type="button" role="tab" aria-selected={active === id} aria-controls={`${uid}-panel-${id}`} tabIndex={active === id ? 0 : -1}
              onClick={() => change(id)} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 sm:text-xs lg:flex-row lg:gap-2 lg:px-6 ${active === id ? 'bg-amber-400/15 text-amber-200' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Icon aria-hidden="true" className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-[76rem] flex-1 px-2.5 pt-2.5 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:pb-6">
        {SANDBOX_VIEWS.map(({ id }) => <section key={id} id={`${uid}-panel-${id}`} role="tabpanel" aria-labelledby={`${uid}-tab-${id}`}
          hidden={active !== id} className="min-w-0" data-workspace={id}>
          {active === id && panelLead}
          {id === 'map' && <MapWorkspaceContent hidden={active === id && hideActiveContent}>{views.map}</MapWorkspaceContent>}
          {id !== 'map' && active === id && !hideActiveContent && views[id]}
        </section>)}
      </main>
    </>
  );
}

function MapWorkspaceContent({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  // Keep the map mounted across ordinary workspace changes. An invalidated
  // chronicle handoff must not keep displaying its former frame.
  return hidden ? <div hidden>{children}</div> : children;
}

export interface WorkspaceSection {
  id: string;
  label: string;
  content: ReactNode;
}

export const resolveWorkspaceOpen = (
  sections: readonly Pick<WorkspaceSection, 'id'>[],
  initialOpen?: string,
  rememberedOpen?: string | null,
  forcedOpen?: string,
): string | null => chooseWorkspaceSection(sections.map(({ id }) => id), initialOpen, rememberedOpen, forcedOpen) ?? null;

const desktopQuery = '(min-width: 640px)';
function readDesktopWorkspace(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(desktopQuery).matches;
}
function listenDesktopWorkspace(change: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const media = window.matchMedia(desktopQuery);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }
  media.addListener(change);
  return () => media.removeListener(change);
}
const mobileWorkspaceSnapshot = () => false;
const accordionButton = 'flex min-h-11 w-full min-w-0 items-center justify-between gap-2 break-words rounded-md border px-3 text-left text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300';

export function WorkspaceSections({ label, sections, initialOpen, rememberedOpen, forcedOpen, onOpenChange, headingRef, moreAfterContent = false }: {
  label: string; sections: WorkspaceSection[]; initialOpen?: string; rememberedOpen?: string | null;
  forcedOpen?: string; onOpenChange?: (id: string | null) => void; headingRef?: Ref<HTMLHeadingElement>; moreAfterContent?: boolean;
}) {
  const [localOpen, setLocalOpen] = useState<string | null>();
  const open = resolveWorkspaceOpen(sections, initialOpen, rememberedOpen === undefined ? localOpen : rememberedOpen, forcedOpen);
  const desktop = useSyncExternalStore(listenDesktopWorkspace, readDesktopWorkspace, mobileWorkspaceSnapshot);
  const uid = useId();
  const more = useRef<HTMLDetailsElement>(null);
  const moreSummary = useRef<HTMLElement>(null);
  const activeButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<{ id: string | null }>();
  const primary = sections.find(({ id }) => id === open);
  const isForced = open !== null && open === forcedOpen;
  const secondary = sections.filter(({ id }) => id !== open);

  useEffect(() => {
    if (desktop) { pendingFocus.current = undefined; return; }
    if (pendingFocus.current?.id !== open) return;
    pendingFocus.current = undefined;
    if (more.current) more.current.open = false;
    (open ? activeButton.current : moreSummary.current)?.focus();
  }, [desktop, open]);

  const toggle = (item: WorkspaceSection) => {
    if (isForced) return; // Programmatic focus does not rewrite the saved preference.
    const next = open === item.id ? null : item.id;
    if (!desktop) pendingFocus.current = { id: next };
    setLocalOpen(next);
    onOpenChange?.(next);
  };
  const trigger = (item: WorkspaceSection, mobilePrimary = false) => (
    <h3>
      <button type="button" id={`${uid}-switch-${item.id}`} ref={mobilePrimary ? activeButton : undefined}
        aria-expanded={open === item.id} aria-controls={`${uid}-${item.id}`}
        aria-disabled={isForced ? true : undefined}
        onClick={() => toggle(item)}
        className={`${accordionButton} ${open === item.id ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800'}`}>
        {item.label}<ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${open === item.id ? 'rotate-180' : ''}`} />
      </button>
    </h3>
  );
  const pane = (item: WorkspaceSection) => (
    <div id={`${uid}-${item.id}`} role="region" aria-labelledby={`${uid}-switch-${item.id}`} hidden={open !== item.id}
      className="min-w-0 py-2">{open === item.id ? item.content : null}</div>
  );

  const mobileMore = !isForced && secondary.length > 0 ? (
    <details ref={more} className="min-w-0 rounded-md border border-slate-800 bg-slate-950/60">
      <summary ref={moreSummary} className="min-h-11 cursor-pointer rounded-md px-3 py-3 text-xs font-semibold text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">更多内容</summary>
      <div className="min-w-0 space-y-1 px-2 pb-2">
        {secondary.map((item) => <div key={item.id} className="min-w-0">{trigger(item)}{pane(item)}</div>)}
      </div>
    </details>
  ) : null;

  return (
    <section aria-label={label} className="min-w-0 space-y-2">
      <h2 ref={headingRef} tabIndex={-1} className="break-words px-0.5 text-sm font-semibold text-slate-200">{label}</h2>
      {desktop ? (isForced ? sections.filter(({ id }) => id === open) : sections).map((item) => <div key={item.id} className="min-w-0">{trigger(item)}{pane(item)}</div>) : <>
        {primary && trigger(primary, true)}
        {!moreAfterContent && mobileMore}
        {primary && pane(primary)}
        {moreAfterContent && mobileMore}
      </>}
    </section>
  );
}
