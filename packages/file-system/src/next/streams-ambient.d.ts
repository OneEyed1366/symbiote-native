// React Native ships its own ambient global types (react-native/src/types/globals.d.ts) that
// this project's tsconfig picks up ahead of any DOM lib, and that file declares `Blob`, `File`,
// `Response`, `AbortSignal`, `URL` (all readonly except `search` — see path-utilities.ts's own
// note), but NOT `ReadableStream`/`WritableStream` at all, and its `AbortSignal` class predates
// the spec's `reason` property. RN's own Streams runtime (react-native/flow/streams.js.flow) has
// no TypeScript counterpart. These are minimal structural declarations for the shapes this
// package's `/next` surface actually constructs and reads — not a full spec-complete polyfill.

declare global {
  class ReadableStream<R = unknown> {
    constructor(underlyingSource?: unknown, strategy?: unknown);
    readonly locked: boolean;
    cancel(reason?: unknown): Promise<void>;
    getReader(): unknown;
    pipeThrough(transform: unknown, options?: unknown): ReadableStream;
    pipeTo(destination: unknown, options?: unknown): Promise<void>;
    tee(): [ReadableStream<R>, ReadableStream<R>];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  class WritableStream<W = unknown> {
    constructor(underlyingSink?: unknown, strategy?: unknown);
    readonly locked: boolean;
    abort(reason?: unknown): Promise<void>;
    close(): Promise<void>;
    getWriter(): unknown;
  }

  interface AbortSignal {
    readonly reason?: unknown;
  }
}

export {};
