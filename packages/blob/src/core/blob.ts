import { expoBlob } from './native-module';
import {
  DEFAULT_CHUNK_SIZE,
  isTypedArray,
  normalizedContentType,
  preprocessOptions,
} from './utils';
import type { IBlobPart, IBlobPropertyBag } from './types';

function inputMapping(blobPart: IBlobPart): IBlobPart {
  if (blobPart instanceof ArrayBuffer) {
    return new Uint8Array(blobPart);
  }
  if (blobPart instanceof Blob || isTypedArray(blobPart)) {
    return blobPart;
  }
  return String(blobPart);
}

function assertArrayBuffer(
  buffer: ArrayBufferLike,
): asserts buffer is ArrayBuffer {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Blob data must be backed by an ArrayBuffer');
  }
}

function isBlob(value: unknown): value is Blob {
  return value instanceof Blob;
}

export class Blob extends expoBlob.Blob {
  constructor(
    blobParts?: IBlobPart[] | Iterable<IBlobPart>,
    options?: IBlobPropertyBag,
  ) {
    if (!new.target) {
      throw new TypeError("Blob constructor requires 'new' operator");
    }

    if (blobParts === undefined) {
      super([], preprocessOptions(options));
    } else if (blobParts === null || typeof blobParts !== 'object') {
      throw new TypeError(
        'Blob constructor requires blobParts to be a non-null object or undefined',
      );
    } else {
      const processedBlobParts: IBlobPart[] = [];
      for (const blobPart of blobParts) {
        processedBlobParts.push(inputMapping(blobPart));
      }
      super(processedBlobParts, preprocessOptions(options));
    }
  }

  override slice(start?: number, end?: number, contentType?: string): Blob {
    const normalizedType = normalizedContentType(contentType);
    const slicedBlob = super.slice(start, end, normalizedType);
    Object.setPrototypeOf(slicedBlob, Blob.prototype);
    if (!isBlob(slicedBlob)) {
      throw new Error('unreachable — just reassigned the prototype to Blob');
    }
    return slicedBlob;
  }

  stream(): ReadableStream {
    let getBlobBytes: (() => Promise<Uint8Array>) | null =
      this.bytes.bind(this);
    let offset = 0;
    let cachedBytes: Uint8Array | null = null;

    return new ReadableStream({
      type: 'bytes',
      async pull(controller) {
        if (!cachedBytes) {
          if (!getBlobBytes) {
            throw new Error('Cannot read from a closed stream');
          }
          cachedBytes = await getBlobBytes();
          getBlobBytes = null;
        }

        if (offset >= cachedBytes.length) {
          controller.close();
          cachedBytes = null;
          return;
        }

        if (controller.byobRequest?.view) {
          const view = new Uint8Array(
            controller.byobRequest.view.buffer,
            controller.byobRequest.view.byteOffset,
            controller.byobRequest.view.byteLength,
          );
          const end = Math.min(offset + view.byteLength, cachedBytes.length);
          const chunk = cachedBytes.subarray(offset, end);
          view.set(chunk, 0);
          controller.byobRequest.respond(chunk.length);
          offset = end;
          if (offset >= cachedBytes.length) {
            controller.close();
            cachedBytes = null;
          }
          return;
        }

        const end = Math.min(offset + DEFAULT_CHUNK_SIZE, cachedBytes.length);
        const chunk = cachedBytes.subarray(offset, end);
        assertArrayBuffer(chunk.buffer);
        controller.enqueue(
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        );
        offset = end;
      },
    });
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const bytes = await super.bytes();
    assertArrayBuffer(bytes.buffer);
    // The Blob spec requires a NEW ArrayBuffer even when its bounds match the TypedArray's.
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  }

  override toString(): string {
    return '[object Blob]';
  }

  static override get length(): number {
    return 0;
  }
}
