import { afterEach, describe, expect, it, vi } from 'vitest';

function concatParts(parts: unknown[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = parts.map(part =>
    typeof part === 'string'
      ? encoder.encode(part)
      : new Uint8Array(part as ArrayBufferLike),
  );
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

class FakeNativeBlob {
  readonly size: number;
  readonly type: string;
  private readonly parts: unknown[];

  constructor(parts: unknown[] = [], options: { type?: string } = {}) {
    this.parts = parts;
    this.type = options.type ?? '';
    this.size = concatParts(parts).byteLength;
  }

  slice(start?: number, end?: number, contentType?: string): FakeNativeBlob {
    const bytes = concatParts(this.parts).slice(start, end);
    return new FakeNativeBlob([bytes], { type: contentType });
  }

  async bytes(): Promise<Uint8Array> {
    return concatParts(this.parts);
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(await this.bytes());
  }
}

// requireNativeModule() only resolves on-device — faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/sqlite's native-fakes.ts.
vi.mock('./native-module', () => ({
  expoBlob: { Blob: FakeNativeBlob },
}));

const { Blob } = await import('./blob');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('constructor', () => {
  it('throws without the new operator', () => {
    // JS class constructors already reject a plain call — `new.target` in the constructor body
    // is unreachable defensive code kept only for parity with upstream's own source.
    // @ts-expect-error — intentionally calling the constructor as a plain function
    expect(() => Blob.call(null)).toThrow();
  });

  it('defaults to an empty blob', () => {
    const blob = new Blob();
    expect(blob.size).toBe(0);
  });

  it('rejects a non-object, non-undefined blobParts', () => {
    expect(() => new Blob('nope' as never)).toThrow(
      /non-null object or undefined/,
    );
  });

  it('converts an ArrayBuffer part to a Uint8Array before storing', async () => {
    const buffer = new TextEncoder().encode('hi').buffer as ArrayBuffer;
    const blob = new Blob([buffer]);
    expect(await blob.text()).toBe('hi');
  });

  it('concatenates string and typed-array parts', async () => {
    const blob = new Blob(['a', new TextEncoder().encode('b')]);
    expect(await blob.text()).toBe('ab');
  });
});

describe('slice', () => {
  it('returns an instance of our own Blob class, not the raw native one', () => {
    const blob = new Blob(['hello']);
    const sliced = blob.slice(0, 2);
    expect(sliced).toBeInstanceOf(Blob);
  });

  it('slices the underlying bytes', async () => {
    const blob = new Blob(['hello world']);
    expect(await blob.slice(0, 5).text()).toBe('hello');
  });
});

describe('arrayBuffer', () => {
  it('returns a genuine ArrayBuffer', async () => {
    const blob = new Blob(['hi']);
    const buffer = await blob.arrayBuffer();
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(buffer)).toBe('hi');
  });
});

describe('stream', () => {
  it('reads the whole blob through the default (non-BYOB) path', async () => {
    const blob = new Blob(['hello world']);
    const reader = blob.stream().getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const text = chunks.map(c => new TextDecoder().decode(c)).join('');
    expect(text).toBe('hello world');
  });
});

describe('misc', () => {
  it('toString reports [object Blob]', () => {
    expect(new Blob().toString()).toBe('[object Blob]');
  });

  it('static length is 0', () => {
    expect(Blob.length).toBe(0);
  });
});
