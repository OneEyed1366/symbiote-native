import type { IFileSystemHandle } from './types';

// This project's tsconfig carries no DOM lib (RN ships its own Streams polyfill, typed only in
// Flow upstream — react-native/flow/streams.js.flow — with no TypeScript ambient declaration
// reachable here), so the WHATWG `UnderlyingByteSource`/`UnderlyingSink`/
// `ReadableByteStreamController` names aren't in scope. These local structural types match the
// spec shape `new ReadableStream(source)`/`new WritableStream(sink)` expect at the call site.
type IReadableByteStreamController = {
  readonly byobRequest: {
    view: ArrayBufferView | null;
    respond(bytesWritten: number): void;
  } | null;
  close(): void;
  enqueue(chunk: Uint8Array): void;
};

export class FileSystemReadableStreamSource {
  handle: IFileSystemHandle;
  size: number = 1024;
  type = 'bytes' as const;

  constructor(handle: IFileSystemHandle) {
    this.handle = handle;
  }

  cancel() {
    this.handle.close();
  }

  pull(controller: IReadableByteStreamController) {
    const theView = controller.byobRequest?.view;
    if (!theView) {
      const bytes = this.handle.readBytes(this.size);
      if (bytes.length === 0) {
        controller.close();
        return;
      }
      controller.enqueue(bytes);
      return;
    }

    // TODO: Optimize by adding a native method that can write into a TypedArray at a given offset.
    const bytes = this.handle.readBytes(
      theView.byteLength - theView.byteOffset,
    );
    if (bytes.length === 0) {
      controller.close();
      controller.byobRequest.respond(0);
      return;
    }
    if (theView instanceof Uint8Array) {
      theView.set(bytes, theView.byteOffset);
    } else {
      const array = new Uint8Array(theView.buffer);
      for (let i = 0; i < bytes.length; i++) {
        array[i + (theView.byteOffset ?? 0)] = bytes[i]!;
      }
    }
    controller.byobRequest.respond(bytes.length);
  }
}

export class FileSystemWritableSink {
  handle: IFileSystemHandle;

  constructor(handle: IFileSystemHandle) {
    this.handle = handle;
  }

  abort() {
    this.close();
  }

  close() {
    this.handle.close();
  }

  write(chunk: Uint8Array) {
    this.handle.writeBytes(chunk);
  }
}
