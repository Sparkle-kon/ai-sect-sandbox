import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { resolveGuidedCalamityArrayTurn, type GuidedCalamityArrayTurn } from '../controllers/guidedCalamityArrayTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { availableCalamityArrayChoices, calamityArrayStoryReceipt, type CalamityArrayOption } from '../engine/calamityArray';
import type { Cultivator, WorldState } from '../types/world';

const Card = lazy(async () => ({ default: (await import('./CalamityArrayCard')).CalamityArrayCard }));
type Sim = ReturnType<typeof useWorldSimulationController>;
type Stage = {
  world: WorldState; branchId: string; revision: number; token: number; actorId: string;
  siteName: string; option: CalamityArrayOption;
  receipt?: { title: string; description: string };
};

export function useCalamityArrayStory(sim: Sim, active: boolean, viewer: Cultivator | undefined) {
  const [stage, setStage] = useState<Stage>();
  const [pending, setPending] = useState(false);
  const inProgress = useRef(false);
  const { world, timeline } = sim;
  const branchId = timeline.activeBranchId, revision = sim.saveContextVersion.current;
  const visible = active && !sim.preview && Boolean(viewer && world.cultivators.includes(viewer));
  const scope = useRef({ visible, actorId: viewer?.id, token: 0 });
  if (scope.current.visible !== visible || scope.current.actorId !== viewer?.id)
    scope.current = { visible, actorId: viewer?.id, token: scope.current.token + 1 };
  const token = scope.current.token;
  const options = useMemo(() => visible && viewer ? availableCalamityArrayChoices(world, viewer) : [], [world, viewer, visible]);
  if (!visible || !viewer) return undefined;
  const current = stage?.world === world && stage.branchId === branchId && stage.revision === revision &&
    stage.actorId === viewer.id && stage.token === token ? stage : undefined;
  const siteName = current?.siteName ?? world.locations.find(row => row.id === options[0]?.targetLocationId)?.name;
  if (!siteName || !current && !options.length) return undefined;

  const sameScope = () => scope.current.visible && scope.current.actorId === viewer.id && scope.current.token === token &&
    !sim.browsing.current && sim.history.current.activeBranchId === branchId && sim.saveContextVersion.current === revision;
  const busy = pending || sim.isRunning || sim.isStepping || sim.fastForwardLocked;
  const canStart = () => !inProgress.current && !busy && sameScope() && sim.authority.current === world &&
    sim.history.current === timeline && !sim.stepInFlight.current && !sim.fastForwardRun.current && !sim.campaignGuard.current;

  const advance = (option: CalamityArrayOption, order?: GuidedCalamityArrayTurn) => {
    inProgress.current = true;
    setPending(true);
    void sim.handleStepTick(order).then(() => {
      const after = sim.authority.current;
      if (!sameScope() || after.tick !== world.tick + 1) return;
      const receipt = calamityArrayStoryReceipt(after, viewer.id, option, order ? 'intent' : 'settlement');
      if (!receipt) return;
      setStage({ world: after, branchId, revision, token, actorId: viewer.id, siteName, option,
        receipt: order ? undefined : receipt });
    }).catch(() => {
      // The simulation controller already presents its own failed-turn state.
    }).finally(() => {
      inProgress.current = false;
      setPending(false);
    });
    return true;
  };

  const choose = (option: CalamityArrayOption) => {
    if (current || !canStart()) return false;
    const request: GuidedCalamityArrayTurn = { kind: 'calamity-array', world, branchId, revision, actorId: viewer.id, option };
    return Boolean(resolveGuidedCalamityArrayTurn(request, world, branchId, revision) && advance(option, request));
  };
  return <Suspense fallback={null}><Card view={{ siteName, options: current ? [] : options,
    queued: current && !current.receipt ? current.option.calamityArrayStance : undefined }}
    receipt={current?.receipt} busy={busy} onChoose={choose}
    onAdvance={current && !current.receipt ? () => canStart() && advance(current.option) : undefined}
    onContinue={current?.receipt ? () => setStage(undefined) : undefined}/></Suspense>;
}
