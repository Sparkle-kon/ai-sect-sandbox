import { createAnomalyStoryFunnel } from './anomalyStoryFunnel';
import { createProtagonistStoryFunnel } from './protagonistStoryFunnel';
import { storyTriggerAuditPhase19_20 } from './storyTriggerAuditPhase19_20';
import { storyTriggerAuditPhase21_22 } from './storyTriggerAuditPhase21_22';
import { runStoryTriggerAudit } from './storyTriggerAuditRunner';
import { createStoryTriggerFunnel } from './storyTriggerFunnel';

const args = (globalThis as typeof globalThis & {process?:{argv?:string[]}}).process?.argv?.slice(2) ?? [];
if (args.length > 2 || args.some(value => !/^\d+$/u.test(value))) {
  throw new Error('Use seed and months as nonnegative integer arguments');
}
const seed = Number(args[0] ?? 13071), ticks = Number(args[1] ?? 300);
const ordinary = createStoryTriggerFunnel();
const protagonist = createProtagonistStoryFunnel();
const relay = createAnomalyStoryFunnel();
const report = runStoryTriggerAudit({
  seed, ticks, probes: [...storyTriggerAuditPhase19_20, ...storyTriggerAuditPhase21_22],
  onCompletedTurn(turn) { ordinary.observe(turn); protagonist.observe(turn); relay.observe(turn); },
  onProgress(point) { console.error(JSON.stringify({ kind: 'completed-months', ...point })); },
});
console.log(JSON.stringify({ report, details: { native: ordinary.summary(), protagonist: protagonist.summary(), relay: relay.summary() } }, null, 2));
