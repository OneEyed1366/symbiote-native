// Hand-ported from .vendors/expo/packages/expo-keep-awake/src/KeepAwake.types.ts (sdk-57).
// Upstream's KeepAwakeEvent#state is a web-only WakeLockSentinel-shaped value with no native
// analogue — native listeners rarely fire and never depend on `state`'s shape, so it's kept as
// a minimal placeholder rather than guessed at.
export type KeepAwakeEvent = {
  state: unknown;
};

export type KeepAwakeListener = (event: KeepAwakeEvent) => void;

export type KeepAwakeOptions = {
  listener?: KeepAwakeListener;
  suppressDeactivateWarnings?: boolean;
};
