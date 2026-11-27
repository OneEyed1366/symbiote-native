// What the mounted probe publishes, so the test can drive it from outside the components

export const probe: {
  show?: (isShown: boolean) => void;
  fadeFirstRow?: (opacity: number) => void;
} = {};

// What the live hooks of the mounted screen did, counted from inside their worklets
export const live: {
  frames: number;
  reactions: number;
  tagOfRef?: () => number | null;
} = { frames: 0, reactions: 0 };

// What the Worklets babel plugin leaves on a function, written by hand as the runner has no plugin
export const workletOf = <T extends (...args: never[]) => unknown>(
  worklet: T,
  closure: unknown[],
  hash: number,
): T => Object.assign(worklet, { __closure: closure, __workletHash: hash });

export const publishedBy = <K extends keyof typeof probe>(
  name: K,
): NonNullable<(typeof probe)[K]> => {
  const found = probe[name];
  if (found === undefined) {
    throw new Error(`the probe never published ${name}`);
  }
  return found;
};
