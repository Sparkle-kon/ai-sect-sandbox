import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { useWorldSimulationController } from '../src/controllers/useWorldSimulationController';
import { cloneWorldWithColdHistory } from '../src/engine/coldHistoryEngine';
import { llmScheduler } from '../src/engine/llmScheduler';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { encodeWorldSave } from '../src/engine/storageEngine';
import { readTimelineSnapshot } from '../src/engine/timelineEngine';
import type { WorldState } from '../src/types/world';

const strict = (world: WorldState) => encodeWorldSave(cloneWorldWithColdHistory(world));

const onActivate = () => {};
const onHistoricalPreview = () => {};
const onPreviewContextChange = () => {};

function renderWithChat(managed: WorldState) {
  let stage = 0, controller: ReturnType<typeof useWorldSimulationController> | undefined;
  function Harness() {
    const current = useWorldSimulationController({
      playbackEnabled: false, inspectCampaign: false, onActivate, onHistoricalPreview, onPreviewContextChange,
    });
    controller = current;
    if (stage === 0) {
      stage++;
      if (!current.replaceWorld(managed, current.authority.current, current.saveContextVersion.current))
        throw new Error('Expected native managed world activation');
    } else if (stage === 1) {
      stage++;
      current.changeLlmConfig({
        enabled: false, sectChatEnabled: true, apiBaseUrl: 'https://sect-race-qa.invalid/v1',
        apiKey: 'mock-not-a-real-secret', model: 'controller-chat-fixture',
      });
    }
    return <output data-tick={current.world.tick}/>;
  }
  renderToStaticMarkup(<Harness />);
  if (!controller) throw new Error('Expected a mounted real React controller');
  return controller;
}
type Slot = { postId: string; senderId: string };
function seats(options?: RequestInit): readonly Slot[] {
  const body = JSON.parse(String(options?.body ?? '')) as { messages: readonly { role: string; content: string }[] };
  const raw = body.messages.find(row => row.role === 'user')?.content;
  if (!raw) throw new Error('Expected the scheduled chat request');
  const batch = JSON.parse(raw) as { slots: readonly Slot[] };
  if (!batch.slots?.length) throw new Error('Expected a genuine public chat seat');
  return batch.slots;
}
const providerReply = (slots: readonly Slot[], text: string) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ messages: slots.map(({ postId, senderId }) => ({ postId, senderId, text })) }) } }],
}));

it('迟到的群聊模型回复不会在重置后落入新的世界或时间线', async () => {
  const managed = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!managed?.sectManagement) throw new Error('Expected the real managed opening');
  const responders: (() => void)[] = [], orders: AbortSignal[] = [];
  const transport = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    const slots = seats(options);
    if (!options?.signal) throw new Error('Expected a cancellable chat request');
    orders.push(options.signal);
    return new Promise<Response>(resolve => responders.push(() => resolve(providerReply(slots, '这封旧信不该跑进另一条时间线。'))));
  });
  vi.stubGlobal('fetch', transport);
  llmScheduler.resetTickBudget();
  try {
    const active = renderWithChat(managed);
    expect(active.authority.current).toBe(managed);
    expect(active.llmConfig).toMatchObject({ enabled: false, sectChatEnabled: true });
    const first = strict(managed);
    const posting = active.handleStepTick();
    await vi.waitFor(() => expect(transport).toHaveBeenCalled(), { timeout: 2_000 });
    expect(orders).not.toHaveLength(0);
    expect(orders.every(signal => !signal.aborted)).toBe(true);
    const settled = active.authority.current;
    expect(settled.tick).toBe(managed.tick + 1);
    expect(settled.sectManagement?.chat?.months.at(-1)?.posts.every(post => post.source === 'template')).toBe(true);
    expect(active.stepInFlight.current).toBe(false);
    const revision = active.saveContextVersion.current;
    active.handleReset();
    const restarted = active.authority.current, timeline = active.history.current;
    expect(active.saveContextVersion.current).toBeGreaterThan(revision);
    expect(restarted).not.toBe(managed);
    expect(restarted.sectManagement).toBeUndefined();
    expect(orders.every(signal => signal.aborted)).toBe(true);
    const rebooted = strict(restarted);
    responders.forEach(release => release());
    await posting;
    await vi.waitFor(() => expect(llmScheduler.getSnapshot().active).toBe(0));
    expect(active.authority.current).toBe(restarted);
    expect(active.history.current).toBe(timeline);
    expect(strict(active.authority.current) === rebooted, 'reset authority bytes').toBe(true);
    const retained = readTimelineSnapshot(timeline, restarted.tick);
    if (!retained) throw new Error('Expected the reset timeline snapshot');
    expect(strict(retained) === rebooted, 'reset timeline bytes').toBe(true);
    expect(strict(managed) === first, 'original managed snapshot bytes').toBe(true);
    expect(timeline.branches[0].snapshots).toHaveLength(1);
    expect(active.stepInFlight.current).toBe(false);
  } finally {
    vi.unstubAllGlobals();
    llmScheduler.resetTickBudget();
  }
});


it('同一当月收到合法回信后，当前世界与本线快照都更新发言，已派差事不重算', async () => {
  const managed = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  const discipleId = managed?.sectManagement?.foundingDiscipleIds[1];
  if (!managed || !discipleId) throw new Error('Expected the actual second founding disciple');
  const delivered = '先把饭煮熟，再议什么大道。';
  const transport = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => providerReply(seats(options), delivered));
  vi.stubGlobal('fetch', transport);
  llmScheduler.resetTickBudget();
  try {
    const active = renderWithChat(managed);
    const assignments = [{ discipleId, jobId: 'kitchen' }] as const;
    const admitted = await active.confirmSectMeeting(managed, active.history.current.activeBranchId,
      active.saveContextVersion.current, assignments);
    expect(admitted).toBe(true);
    const native = active.authority.current;
    expect(native.tick).toBe(managed.tick + 1);
    expect(native.sectManagement?.latestReport?.rows).toMatchObject([{ discipleId, jobId: 'kitchen' }]);
    await vi.waitFor(() => expect(active.authority.current.sectManagement?.chat?.months.at(-1)?.posts
      .some(post => post.source === 'llm' && post.text === delivered)).toBe(true));
    const narrated = active.authority.current;
    expect(transport).toHaveBeenCalled();
    expect(narrated.tick).toBe(native.tick);
    expect(narrated.random).toBe(native.random);
    expect(narrated.events).toBe(native.events);
    expect(narrated.sectManagement?.latestReport).toBe(native.sectManagement?.latestReport);
    const at = readTimelineSnapshot(active.history.current, narrated.tick);
    expect(at?.sectManagement?.chat).toEqual(narrated.sectManagement?.chat);
    expect(active.history.current.branches[0].snapshots).toHaveLength(2);
  } finally {
    vi.unstubAllGlobals();
    llmScheduler.resetTickBudget();
  }
});
