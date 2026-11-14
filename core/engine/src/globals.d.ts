// Runtime globals provided by the Hermes/RN host but absent from the ES2022 lib.
declare function queueMicrotask(callback: () => void): void;

declare function setTimeout(handler: () => void, timeout?: number): number;
declare function clearTimeout(handle: number | undefined): void;

declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare const process: {
  env: Record<string, string | undefined>;
};

declare const performance: {
  now(): number;
};

// Installed by RN's `setUpDOM`, and the base of `MediaQueryList`
declare class Event {
  constructor(type: string, init?: { bubbles?: boolean; cancelable?: boolean });
  readonly type: string;
}
declare class AbortSignal extends EventTarget {
  readonly aborted: boolean;
}
declare class AbortController {
  readonly signal: AbortSignal;
  abort(): void;
}
declare class EventTarget {
  addEventListener(
    type: string,
    listener: ((event: Event) => void) | null,
    options?: { once?: boolean; signal?: AbortSignal } | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: ((event: Event) => void) | null,
    options?: boolean,
  ): void;
  dispatchEvent(event: Event): boolean;
}
