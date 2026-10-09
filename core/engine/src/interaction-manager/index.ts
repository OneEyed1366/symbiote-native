// The runtime is RN's own `InteractionManager`, forwarded through `react-native-host`
// TODO(rn-port): `Events` stays our copy, a standalone constant must not need the host at import

export const Events = {
  interactionStart: 'interactionStart',
  interactionComplete: 'interactionComplete',
} as const;

export type IInteractionEvent = (typeof Events)[keyof typeof Events];

export type ISimpleTask = {
  name: string;
  run: () => void;
};
export type IPromiseTask = {
  name: string;
  gen: () => Promise<unknown>;
};
export type ITask = ISimpleTask | IPromiseTask | (() => void);

export type IHandle = number;

export type ICancellable = {
  then: Promise<void>['then'];
  cancel: () => void;
};
