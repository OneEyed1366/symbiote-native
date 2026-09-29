// Same seam as `svelte-suite-bridge.ts`: a mounted component's own `$state` has no outside
// handle, so the probe registers its setter here and the itest drives shuffles through it

export type ISetFlipItems = (next: readonly string[]) => void;

let setter: ISetFlipItems | undefined;

export function registerSetFlipItems(next: ISetFlipItems): void {
  setter = next;
}

export function flipItemsSetter(): ISetFlipItems {
  if (setter === undefined) throw new Error('the probe never initialised');
  return setter;
}
