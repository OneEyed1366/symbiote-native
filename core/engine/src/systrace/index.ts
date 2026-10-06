// `Systrace.js` of RN: profiler markers that reach the host's trace only while it is tracing

// The tag RN files its React markers under, `1 << 13`
const TRACE_TAG_REACT = 8_192;

type IEventName = string | (() => string);
type IEventArgs = Record<string, string> | null | undefined;

declare global {
  var nativeTraceIsTracing: ((tag: number) => boolean) | undefined;
  var nativeTraceBeginSection:
    ((tag: number, name: string, args: IEventArgs) => void) | undefined;
  var nativeTraceEndSection:
    ((tag: number, args: IEventArgs) => void) | undefined;
  var nativeTraceBeginAsyncSection:
    | ((tag: number, name: string, cookie: number, args: IEventArgs) => void)
    | undefined;
  var nativeTraceEndAsyncSection:
    | ((tag: number, name: string, cookie: number, args: IEventArgs) => void)
    | undefined;
  var nativeTraceCounter:
    ((tag: number, name: string, value: number) => void) | undefined;
  var __RCTProfileIsProfiling: boolean | undefined;
}

let asyncCookie = 0;

const nameOf = (eventName: IEventName): string =>
  typeof eventName === 'function' ? eventName() : eventName;

function isEnabled(): boolean {
  return globalThis.nativeTraceIsTracing
    ? globalThis.nativeTraceIsTracing(TRACE_TAG_REACT)
    : Boolean(globalThis.__RCTProfileIsProfiling);
}

function setEnabled(_doEnable: boolean): void {}

function beginEvent(eventName: IEventName, args?: IEventArgs): void {
  if (isEnabled()) {
    globalThis.nativeTraceBeginSection?.(
      TRACE_TAG_REACT,
      nameOf(eventName),
      args,
    );
  }
}

function endEvent(args?: IEventArgs): void {
  if (isEnabled()) globalThis.nativeTraceEndSection?.(TRACE_TAG_REACT, args);
}

function beginAsyncEvent(eventName: IEventName, args?: IEventArgs): number {
  const cookie = asyncCookie;
  if (isEnabled()) {
    asyncCookie++;
    globalThis.nativeTraceBeginAsyncSection?.(
      TRACE_TAG_REACT,
      nameOf(eventName),
      cookie,
      args,
    );
  }
  return cookie;
}

function endAsyncEvent(
  eventName: IEventName,
  cookie: number,
  args?: IEventArgs,
): void {
  if (isEnabled()) {
    globalThis.nativeTraceEndAsyncSection?.(
      TRACE_TAG_REACT,
      nameOf(eventName),
      cookie,
      args,
    );
  }
}

function counterEvent(eventName: IEventName, value: number): void {
  if (isEnabled()) {
    globalThis.nativeTraceCounter?.(TRACE_TAG_REACT, nameOf(eventName), value);
  }
}

export const Systrace = {
  isEnabled,
  setEnabled,
  beginEvent,
  endEvent,
  beginAsyncEvent,
  endAsyncEvent,
  counterEvent,
};
