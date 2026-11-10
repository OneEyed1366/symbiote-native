// `matchMedia(query)`: a live `MediaQueryList` over the same conditions the compiled rules use
// A query RN cannot answer reads `matches: false` for good, as a browser reads an unknown feature

import { ensureMediaEnvironment } from '../media-environment';
import { holdsCondition, holdsOnce, internConditions } from '../style-registry/media-conditions';
import type { IMediaCondition } from '../style-registry/media-evaluate';
import { callIsolated, onConditionFlip } from '../style-registry/media-subscriptions';
import { parseMediaQueryList } from './parse-media-query';

type IChangeHandler = (event: MediaQueryListEvent) => void;
type IMediaQueryListEventInit = {
  bubbles?: boolean;
  cancelable?: boolean;
  matches?: boolean;
  media?: string;
};

export class MediaQueryListEvent extends Event {
  readonly matches: boolean;
  readonly media: string;

  constructor(type: string, init: IMediaQueryListEventInit = {}) {
    super(type, init);
    this.matches = init.matches ?? false;
    this.media = init.media ?? '';
  }
}

const CHANGE_EVENT = 'change';

type IListener = (event: Event) => void;
type IListenerOptions = { once?: boolean; signal?: AbortSignal } | boolean;
// Capture is not tracked: nothing bubbles to a `MediaQueryList`, so it never changes who hears
type IRegistration = { type: string; listener: IListener; isOnce: boolean };

export class MediaQueryList extends EventTarget {
  readonly media: string;
  private readonly condition: IMediaCondition | undefined;
  // Interned with the first listener, so a list nobody listens to adds nothing to the table
  private conditionId: number | undefined;
  private stopWatching: (() => void) | undefined;
  private changeHandler: IChangeHandler | null = null;
  // `EventTarget` cannot say how many listeners it holds, so the list counts its own
  private registrations: IRegistration[] = [];
  private readonly legacyListeners = new Map<IChangeHandler, AbortController>();

  constructor(media: string, condition: IMediaCondition | undefined) {
    super();
    this.media = media;
    this.condition = condition;
  }

  get matches(): boolean {
    if (this.condition === undefined) return false;
    return this.conditionId === undefined
      ? holdsOnce(this.condition)
      : holdsCondition(this.conditionId);
  }

  get onchange(): IChangeHandler | null {
    return this.changeHandler;
  }

  set onchange(handler: IChangeHandler | null) {
    this.changeHandler = handler;
    this.sync();
  }

  // Watching starts with the first listener, so `matchMedia(q).matches` in a render leaks nothing
  override addEventListener(
    type: string,
    listener: IListener | null,
    options?: IListenerOptions,
  ): void {
    if (listener === null) return;
    const userSignal = typeof options === 'object' ? options.signal : undefined;
    if (userSignal?.aborted || this.find(type, listener) !== undefined) return;
    const entry: IRegistration = {
      type,
      listener,
      isOnce: typeof options === 'object' && options.once === true,
    };
    this.registrations.push(entry);
    userSignal?.addEventListener('abort', () => this.drop(entry), { once: true });
    super.addEventListener(type, listener, { once: entry.isOnce });
    this.sync();
  }

  override removeEventListener(type: string, listener: IListener | null): void {
    const entry = listener === null ? undefined : this.find(type, listener);
    if (entry !== undefined) this.drop(entry);
  }

  // A `once` listener leaves with its first delivery, so the count follows the dispatch
  override dispatchEvent(event: Event): boolean {
    const isDelivered = super.dispatchEvent(event);
    for (const entry of this.registrations.filter(held => held.isOnce && held.type === event.type)) {
      this.drop(entry);
    }
    return isDelivered;
  }

  addListener(listener: IChangeHandler): void {
    if (this.legacyListeners.has(listener)) return;
    const controller = new AbortController();
    this.legacyListeners.set(listener, controller);
    this.addEventListener(
      CHANGE_EVENT,
      event => {
        if (event instanceof MediaQueryListEvent) listener(event);
      },
      { signal: controller.signal },
    );
  }

  removeListener(listener: IChangeHandler): void {
    this.legacyListeners.get(listener)?.abort();
    this.legacyListeners.delete(listener);
  }

  private find(type: string, listener: IListener): IRegistration | undefined {
    return this.registrations.find(held => held.type === type && held.listener === listener);
  }

  private drop(entry: IRegistration): void {
    if (!this.registrations.includes(entry)) return;
    this.registrations = this.registrations.filter(held => held !== entry);
    super.removeEventListener(entry.type, entry.listener);
    this.sync();
  }

  // Subscribed to flips only while something listens, so an unmounted list is not kept alive
  private sync(): void {
    const isWanted =
      this.changeHandler !== null ||
      this.registrations.some(held => held.type === CHANGE_EVENT);
    if (!isWanted) {
      this.stopWatching?.();
      this.stopWatching = undefined;
      return;
    }
    if (this.stopWatching !== undefined || this.condition === undefined) return;
    this.conditionId ??= internConditions([this.condition])[0];
    if (this.conditionId === undefined) return;
    this.stopWatching = onConditionFlip(this.conditionId, () => {
      const event = new MediaQueryListEvent(CHANGE_EVENT, {
        matches: this.matches,
        media: this.media,
      });
      callIsolated(() => this.changeHandler?.(event));
      callIsolated(() => this.dispatchEvent(event));
    });
  }
}

export function matchMedia(query: string): MediaQueryList {
  const { text, condition } = parseMediaQueryList(query);
  if (condition !== undefined) ensureMediaEnvironment();
  return new MediaQueryList(text, condition);
}
