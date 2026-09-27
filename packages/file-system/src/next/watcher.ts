import type { EventSubscription } from 'expo-modules-core';

import type { Directory } from './directory';
import type { File } from './file';
import {
  expoFileSystemNext,
  type INativeFileSystemWatcherEvent,
} from './native-module';
import { DEFAULT_WATCH_DEBOUNCE_MS } from './types';
import type {
  IFileSystemWatchEvent,
  IFileSystemWatchOptions,
  IFileSystemWatchSubscription,
} from './types';

type ITargetFactory<T> = (uri: string, isDirectory: boolean) => T;

function normalizePath(path: string): string {
  return path.replace(/\/+$/, '');
}

/**
 * @hidden
 * Internal implementation of file system watching. Use `File.watch()` or `Directory.watch()` instead.
 */
export class FileSystemWatcher<
  T extends File | Directory,
> implements IFileSystemWatchSubscription {
  private nativeWatcher: InstanceType<
    typeof expoFileSystemNext.FileSystemWatcher
  > | null;
  private subscription: EventSubscription | null = null;
  private removed = false;
  private readonly normalizedWatchedPath: string;

  constructor(
    path: string,
    callback: (event: IFileSystemWatchEvent<T>) => void,
    options: IFileSystemWatchOptions = {},
    private readonly targetFactory: ITargetFactory<T>,
  ) {
    this.normalizedWatchedPath = normalizePath(path);
    this.nativeWatcher = new expoFileSystemNext.FileSystemWatcher(path, {
      debounce: options.debounce ?? DEFAULT_WATCH_DEBOUNCE_MS,
      events: options.events,
    });

    this.subscription = this.nativeWatcher.addListener(
      'change',
      (raw: INativeFileSystemWatcherEvent) => {
        const event = this.mapEvent(raw);
        const isWatchedTarget =
          normalizePath(raw.path) === this.normalizedWatchedPath;

        if (!options.events || options.events.includes(event.type)) {
          callback(event);
        }

        if (
          (event.type === 'deleted' || event.type === 'renamed') &&
          isWatchedTarget
        ) {
          this.remove();
        }
      },
    );

    try {
      this.nativeWatcher.start();
    } catch (error) {
      this.subscription.remove();
      this.subscription = null;
      this.nativeWatcher = null;
      throw error;
    }
  }

  private mapEvent(
    raw: INativeFileSystemWatcherEvent,
  ): IFileSystemWatchEvent<T> {
    return {
      type: raw.type,
      target: this.targetFactory(raw.path, raw.isDirectory),
      newTarget: raw.newPath
        ? this.targetFactory(
            raw.newPath,
            raw.newPathIsDirectory ?? raw.isDirectory,
          )
        : undefined,
      nativeEventFlags: raw.nativeEventFlags,
    };
  }

  remove(): void {
    if (this.removed) {
      return;
    }
    this.removed = true;

    this.subscription?.remove();
    this.subscription = null;

    this.nativeWatcher?.stop();
    this.nativeWatcher = null;
  }
}
