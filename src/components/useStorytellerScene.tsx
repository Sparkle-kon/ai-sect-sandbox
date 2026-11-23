import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { resolveGuidedStorytellerTurn, type GuidedStorytellerTurn } from '../controllers/guidedWorldTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectStoryteller, STORYTELLER_STYLES, type configureStoryteller } from '../engine/storytellerDirector';

type DirectorScene = NonNullable<ReturnType<typeof projectStoryteller>>;
type DirectorChoice = DirectorScene['options'][number]['decision'];
type DirectorStyle = Parameters<typeof configureStoryteller>[1];
type Simulation = ReturnType<typeof useWorldSimulationController>;

export function StorytellerStyleSetting({ style, busy = false, onChange }: {
  style?: DirectorStyle;
  busy?: boolean;
  onChange: (style: DirectorStyle) => boolean;
}) {
  const description = useId();
  return <label className="mb-3 grid min-w-0 gap-1 text-sm text-slate-200">
    <span className="text-amber-100">故事节奏</span>
    <select className="xianxia-control min-h-[44px] min-w-0 max-w-full rounded-md border border-amber-300/35 bg-slate-950 px-2
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-60"
      value={style ?? ''} aria-describedby={description} disabled={busy} onChange={event => {
        const choice = STORYTELLER_STYLES.find(row => row.id === event.currentTarget.value);
        if (choice) onChange(choice.id);
      }}>
      {!style && <option value="" disabled>选择故事节奏</option>}
      {STORYTELLER_STYLES.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
    </select>
    <span id={description} className="text-xs leading-5 text-slate-300">换一种江湖起伏，不会推进月份。</span>
  </label>;
}

export function StorytellerChoiceScene({ view, busy = false, retry = 0, onChoose }: {
  view: DirectorScene;
  busy?: boolean;
  retry?: number;
  onChoose: (decision: DirectorChoice, restoreFocus: boolean) => boolean;
}) {
  const heading = useId();
  const attempts = useRef({ view, retry, accepted: false });
  if (attempts.current.view !== view || attempts.current.retry !== retry) attempts.current = { view, retry, accepted: false };
  const lease = attempts.current;
  if (!view.options.length) return null;

  return <section aria-labelledby={heading} className="xianxia-frame min-w-0 space-y-2 rounded-lg border border-amber-500/40 bg-slate-950/70 p-3 [overflow-wrap:anywhere]">
    <p className="text-xs text-amber-200">{view.actorName} · {view.siteName}</p>
    <h3 id={heading} className="font-serif text-lg font-semibold text-amber-100">{view.title}</h3>
    <p className="font-serif text-sm leading-7 text-slate-200">{view.body}</p>
    <div role="group" aria-label="这一步由你选" className="grid gap-2 sm:grid-cols-3">
      {view.options.map(option => <button key={option.decision.storytellerMove} type="button" disabled={busy}
        className="xianxia-control min-h-[44px] min-w-0 rounded-md border border-amber-300/40 px-2 py-1 text-sm text-amber-50
          hover:bg-amber-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-60"
        onClick={event => {
          if (busy || event.detail > 1 || attempts.current !== lease || lease.accepted) return;
          const focused = event.currentTarget === document.activeElement;
          lease.accepted = true;
          let accepted = false;
          try { accepted = onChoose(option.decision, focused); }
          finally { if (!accepted) lease.accepted = false; }
        }}
        onKeyDown={event => {
          if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
        }}>
        {option.label}
      </button>)}
    </div>
    <p className="text-xs text-slate-300">选定便翻到下个月。</p>
  </section>;
}

type Surface = 'story' | 'cockpit';

export function useStorytellerScene(sim: Simulation, active: boolean, blocked: boolean, surface: Surface,
  returnFocus: RefObject<HTMLElement>) {
  const { world, timeline, preview } = sim;
  const branchId = timeline.activeBranchId;
  const revision = sim.saveContextVersion.current;
  const visible = active && !preview && !blocked;
  const scope = useRef({ visible, surface, stamp: 0 });
  if (scope.current.visible !== visible || scope.current.surface !== surface) {
    scope.current = { visible, surface, stamp: scope.current.stamp + 1 };
  }
  const stamp = scope.current.stamp;
  const executing = useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ world: typeof world; retries: number }>();
  const view = useMemo(() => visible ? projectStoryteller(world) : undefined, [world, visible]);
  const offerId = view?.options[0]?.decision.storytellerOfferId;
  const lastPause = useRef<{ branchId: string; revision: number; offerId: string }>();
  const restore = useRef<{ world: typeof world; scope: number; branchId: string; revision: number }>();
  const { isRunning, setIsRunning } = sim;
  useEffect(() => {
    if (!offerId || !isRunning) return;
    const prior = lastPause.current;
    if (prior?.offerId === offerId && prior.branchId === branchId && prior.revision === revision) return;
    lastPause.current = { branchId, revision, offerId };
    setIsRunning(false);
  }, [offerId, branchId, revision, isRunning, setIsRunning]);
  useEffect(() => {
    const request = restore.current;
    if (!request || request.world === world) return;
    restore.current = undefined;
    if (request.scope === stamp && request.branchId === branchId && request.revision === revision && visible &&
      document.activeElement === document.body) returnFocus.current?.focus({ preventScroll: true });
  }, [world, stamp, branchId, revision, visible, returnFocus]);
  if (!view || !view.options.length) return undefined;
  const busy = pending || sim.isRunning || sim.isStepping || sim.fastForwardLocked;

  const choose = (option: DirectorChoice, restoreFocus: boolean): boolean => {
    if (busy || executing.current || !scope.current.visible || scope.current.stamp !== stamp ||
      sim.browsing.current || sim.stepInFlight.current || sim.fastForwardRun.current || sim.campaignGuard.current ||
      sim.history.current !== timeline || sim.authority.current !== world || sim.saveContextVersion.current !== revision) return false;
    const order: GuidedStorytellerTurn = { kind:'storyteller-choice', world, branchId, revision, actorId:view.actorId, option };
    if (!resolveGuidedStorytellerTurn(order, world, branchId, revision)) return false;
    executing.current = true;
    setPending(true);
    if (restoreFocus) restore.current = { world, scope: stamp, branchId, revision };
    const tryAgain = () => {
      if (sim.authority.current !== world || scope.current.stamp !== stamp) return;
      restore.current = undefined;
      setNotice(previous => ({ world, retries: previous?.world === world ? previous.retries + 1 : 1 }));
    };
    void sim.handleStepTick(order).then(tryAgain, tryAgain).finally(() => {
      executing.current = false;
      setPending(false);
    });
    return true;
  };

  return <>
    <StorytellerChoiceScene key={view.actorId} view={view} busy={busy} retry={notice?.world === world ? notice.retries : 0} onChoose={choose} />
    {notice?.world === world && <p role="status" className="text-xs text-amber-200">这一幕没能继续，请再试一次。</p>}
  </>;
}
