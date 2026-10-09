// Fake clock and host for the press-machine tests
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  createPressHandlers,
  createPressRuntime,
  type IFrameCallback,
  type IPressHost,
  type IPressMachineConfig,
} from './pressable';

type IScheduled = {
  due: number;
  callback: () => void;
  cancelled: boolean;
};

export function makeClock(): {
  schedule: IPressHost['schedule'];
  now: () => number;
  advance: (ms: number) => void;
  pending: () => number;
} {
  let now = 0;
  const scheduled: IScheduled[] = [];
  return {
    schedule(callback, ms) {
      const entry: IScheduled = { due: now + ms, callback, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    now: () => now,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = scheduled
          .filter(entry => !entry.cancelled && entry.due <= target)
          .sort((a, b) => a.due - b.due)[0];
        if (due === undefined) break;
        now = due.due;
        due.cancelled = true;
        due.callback();
      }
      now = target;
    },
    pending: () => scheduled.filter(entry => !entry.cancelled).length,
  };
}

export function eventAt(x = 0, y = 0): ISymbioteEvent {
  const target = createElement('RCTView');
  return {
    type: 'press',
    target,
    currentTarget: target,
    nativeEvent: { pageX: x, pageY: y },
    stopPropagation: () => {},
  };
}

// What `UIManager.measure` reports for the responder; `delay` is ms after the grant, none = sync
export type IMeasuredFrame = {
  width: number;
  height: number;
  pageX: number;
  pageY: number;
  delay?: number | 'never';
};

const DEFAULT_FRAME: IMeasuredFrame = {
  width: 50,
  height: 50,
  pageX: 0,
  pageY: 0,
};

// `frame` omitted measures a 50x50 view at the origin, `null` gives a host with no measurer
export function makeHarness(
  overrides: Partial<IPressMachineConfig> = {},
  frame: IMeasuredFrame | null = DEFAULT_FRAME,
) {
  const clock = makeClock();
  const log: string[] = [];
  const runtime = createPressRuntime();
  const config: IPressMachineConfig = {
    delayLongPress: 500,
    unstable_pressDelay: 0,
    hitSlop: 0,
    pressRetentionOffset: 30,
    onPress: () => log.push('press'),
    onPressIn: () => log.push('in'),
    onPressOut: () => log.push('out'),
    onLongPress: () => log.push('long'),
    ...overrides,
  };
  const measure = (callback: IFrameCallback): void => {
    if (frame === null || frame.delay === 'never') return;
    const deliver = (): void =>
      callback(0, 0, frame.width, frame.height, frame.pageX, frame.pageY);
    if (frame.delay === undefined) deliver();
    else clock.schedule(deliver, frame.delay);
  };
  const host: IPressHost = {
    setPressed: pressed => log.push(pressed ? 'pressed:true' : 'pressed:false'),
    getMeasureFn: () => (frame === null ? undefined : measure),
    schedule: clock.schedule,
    now: clock.now,
  };
  return {
    clock,
    log,
    runtime,
    handlers: createPressHandlers(config, runtime, host),
  };
}
