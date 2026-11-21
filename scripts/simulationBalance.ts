import { runBalanceSimulation, runSiegeBalanceFixture, tuneSimulationBalance } from '../src/engine/balanceEngine';

declare const process: { argv: string[]; stdout: { write(text: string): unknown }; stderr: { write(text: string): unknown }; exitCode?: number };

function parseArguments(args: string[]) {
  let ticks = 500;
  let seeds = [0, 2031, 4_294_967_295];
  let tune = false;
  for (const argument of args) {
    if (argument === '--tune') { tune = true; continue; }
    if (/^--ticks=\d+$/u.test(argument)) {
      ticks = Number(argument.slice(8));
      if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > 1000) throw new RangeError('轮数须为 1–1000。');
      continue;
    }
    if (/^--seeds=\d+(,\d+)*$/u.test(argument)) {
      seeds = [...new Set(argument.slice(8).split(',').map(Number))];
      if (seeds.length > 5 || !seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff)) {
        throw new RangeError('最多使用 5 个不同的 32 位无符号种子。');
      }
      continue;
    }
    throw new TypeError('参数：--ticks=500 --seeds=0,2031 --tune');
  }
  return { ticks, seeds, tune };
}

try {
  const { ticks, seeds, tune } = parseArguments(process.argv.slice(2));
  const report = tune ? tuneSimulationBalance({ seeds, ticks }) : {
    samples: seeds.map((seed) => runBalanceSimulation({ seed, ticks })),
    siegeFixture: runSiegeBalanceFixture(seeds[0]),
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : '平衡检查失败。') + '\n');
  process.exitCode = 1;
}
