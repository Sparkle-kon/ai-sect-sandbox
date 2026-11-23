import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveGuidedBellWatchTurn, type GuidedBellWatchTurn } from '../controllers/guidedWorldTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectBellWatch } from '../engine/bellWatch';
import type { BellWatchOption } from '../types/bellWatch';
import type { Cultivator } from '../types/world';

type Simulation = ReturnType<typeof useWorldSimulationController>;
type BellWatchView = NonNullable<ReturnType<typeof projectBellWatch>>;

const actionLabel: Record<BellWatchOption['bellWatchMove'], string> = {
  inspect: '亲自查楼',
  reroute: '沿旧信路报平安',
};

export function BellWatchStory({ view, viewpoint, busy = false, onChoose }: {
  readonly view: BellWatchView;
  readonly viewpoint?: string;
  readonly busy?: boolean;
  readonly onChoose?: (option: BellWatchOption) => boolean;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const accepted = useRef<{ view: BellWatchView; value: boolean }>({ view, value: false });
  if (accepted.current.view !== view) accepted.current = { view, value: false };
  const lease = accepted.current;
  const chooserVisible = Boolean(onChoose && view.options.length);

  useEffect(() => {
    if (!chooserVisible && restoreFocus.current) {
      restoreFocus.current = false;
      if (document.activeElement === document.body) heading.current?.focus();
    }
  }, [chooserVisible]);

  return <section aria-labelledby={id} className="min-w-0 space-y-2 border-l border-amber-400/40 pl-3 [overflow-wrap:anywhere]">
    <h3 ref={heading} tabIndex={-1} id={id} className="font-serif text-base font-semibold text-amber-100">
      {view.title}
    </h3>
    {viewpoint && <p className="text-xs text-slate-300">随{viewpoint}所见</p>}
    <p className="font-serif text-sm leading-7 text-slate-200">{view.body}</p>
    {onChoose && chooserVisible && <div role="group" aria-label="这一步如何走" className="flex flex-wrap gap-2">
      {view.options.map(option => <button key={option.bellWatchMove} type="button" disabled={busy}
        className="xianxia-control min-h-[44px] max-w-full rounded-md border border-amber-300/40 px-3 py-1 text-sm text-amber-100 hover:bg-amber-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-60"
        onClick={event => {
          if (busy || event.detail > 1 || accepted.current !== lease || lease.value) return;
          const focused = event.currentTarget === document.activeElement;
          lease.value = true;
          let acquired = false;
          try { acquired = onChoose(option); }
          finally {
            if (acquired) restoreFocus.current = focused;
            else lease.value = false;
          }
        }}
        onKeyDown={event => {
          if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
        }}>
        {actionLabel[option.bellWatchMove]}
      </button>)}
    </div>}
  </section>;
}

export function useBellWatchStory(sim: Simulation, active: boolean, viewer: Cultivator | undefined, surface: 'story' | 'cockpit') {
  const { world, timeline, preview } = sim;
  const branchId = timeline.activeBranchId;
  const revision = sim.saveContextVersion.current;
  const visible = Boolean(active && !preview && viewer && world.cultivators.includes(viewer));
  const scope = useRef({ visible, viewer, surface, stamp: 0 });
  if (scope.current.visible !== visible || scope.current.viewer !== viewer || scope.current.surface !== surface) {
    scope.current = { visible, viewer, surface, stamp: scope.current.stamp + 1 };
  }
  const stamp = scope.current.stamp;
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const view = useMemo(() => visible && viewer ? projectBellWatch(world, viewer) : undefined, [visible, viewer, world]);
  if (!viewer || !view) return undefined;

  const busy = pending || sim.isRunning || sim.isStepping || sim.fastForwardLocked;
  const choose = (option: BellWatchOption): boolean => {
    if (inFlight.current || busy || !scope.current.visible || scope.current.stamp !== stamp ||
      sim.browsing.current || sim.stepInFlight.current || sim.fastForwardRun.current || sim.campaignGuard.current ||
      sim.history.current !== timeline || sim.authority.current !== world || sim.saveContextVersion.current !== revision) return false;

    const order: GuidedBellWatchTurn = { kind: 'bell-watch', world, branchId, revision, actorId: viewer.id, option };
    if (!resolveGuidedBellWatchTurn(order, world, branchId, revision)) return false;

    inFlight.current = true;
    setPending(true);
    void sim.handleStepTick(order).catch(() => {
      // Only the subsequent native state may say the actor took a step or the news arrived.
    }).finally(() => {
      inFlight.current = false;
      setPending(false);
    });
    return true;
  };

  return <BellWatchStory key={viewer.id} view={view} viewpoint={viewer.name} busy={busy} onChoose={choose} />;
}
