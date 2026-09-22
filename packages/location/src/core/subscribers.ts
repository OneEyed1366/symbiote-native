import type { EventSubscription } from 'expo-modules-core';
import { expoLocation } from './native-module';
import type {
  ILocationCallback,
  ILocationErrorCallback,
  ILocationHeadingCallback,
  IMotionActivityCallback,
} from './types';

type IEventObject = { watchId: number; [key: string]: unknown };

let nextWatchId = 0;

class Subscriber<
  TCallback extends
    | ILocationCallback
    | ILocationHeadingCallback
    | ILocationErrorCallback
    | IMotionActivityCallback,
> {
  private callbacks: Record<number, TCallback> = {};
  private eventSubscription: EventSubscription | null = null;

  constructor(
    private eventName: string,
    private eventDataField: string,
  ) {}

  private maybeInitializeSubscription(): void {
    if (this.eventSubscription) return;
    this.eventSubscription = expoLocation.addListener(
      this.eventName,
      (event: unknown) => this.trigger(event as IEventObject),
    );
  }

  registerCallback(callback: TCallback): number {
    this.maybeInitializeSubscription();
    const id = ++nextWatchId;
    this.callbacks[id] = callback;
    return id;
  }

  registerCallbackForId(watchId: number, callback: TCallback): number {
    this.maybeInitializeSubscription();
    this.callbacks[watchId] = callback;
    return watchId;
  }

  unregisterCallback(id: number): void {
    if (!this.callbacks[id]) return;
    delete this.callbacks[id];
    void expoLocation.removeWatchAsync(id);
    this.releaseSubscriptionIfIdle();
  }

  /** Drops the local callback without calling native removeWatchAsync — used when another
   *  subscriber already tore down the same watchId natively. */
  forgetCallback(id: number): void {
    if (!this.callbacks[id]) return;
    delete this.callbacks[id];
    this.releaseSubscriptionIfIdle();
  }

  private releaseSubscriptionIfIdle(): void {
    if (Object.keys(this.callbacks).length === 0 && this.eventSubscription) {
      this.eventSubscription.remove();
      this.eventSubscription = null;
    }
  }

  private trigger(event: IEventObject): void {
    const callback = this.callbacks[event.watchId];
    if (callback) {
      (callback as (arg: unknown) => unknown)(event[this.eventDataField]);
    } else {
      void expoLocation.removeWatchAsync(event.watchId);
    }
  }
}

export const locationSubscriber = new Subscriber<ILocationCallback>(
  'Expo.locationChanged',
  'location',
);
export const headingSubscriber = new Subscriber<ILocationHeadingCallback>(
  'Expo.headingChanged',
  'heading',
);
export const locationErrorSubscriber = new Subscriber<ILocationErrorCallback>(
  'Expo.locationError',
  'reason',
);
export const motionActivitySubscriber = new Subscriber<IMotionActivityCallback>(
  'Expo.motionActivityChanged',
  'activity',
);

export function getCurrentWatchId(): number {
  return nextWatchId;
}
