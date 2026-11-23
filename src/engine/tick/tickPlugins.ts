/** A named deterministic step registered at an explicit position within its stage. */
export interface TickPlugin<Context, BoundArguments extends unknown[] = []> {
  readonly id: string;
  readonly run: (context: Context, ...args: BoundArguments) => void;
}

export function defineTickPlugins<Context, BoundArguments extends unknown[] = []>(
  plugins: readonly TickPlugin<Context, BoundArguments>[],
): readonly TickPlugin<Context, BoundArguments>[] {
  const ids = new Set<string>();
  return Object.freeze(plugins.map(({ id, run }) => {
    if (id.trim().length === 0 || ids.has(id)) {
      throw new Error(`Invalid or duplicate tick plugin: ${id}`);
    }
    ids.add(id);
    return Object.freeze({ id, run });
  }));
}

export function runTickPlugins<Context, BoundArguments extends unknown[] = []>(
  context: Context, plugins: readonly TickPlugin<Context, BoundArguments>[], ...args: BoundArguments
): void {
  for (const { run } of plugins) run(context, ...args);
}
