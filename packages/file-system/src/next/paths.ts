import { Directory } from './directory';
import { expoFileSystemNext } from './native-module';
import { PathUtilities } from './path-utilities';
import type { IPathInfo } from './types';

export class Paths extends PathUtilities {
  /**
   * A place to store files that can be deleted by the system when the device runs low on
   * storage.
   */
  static get cache() {
    return new Directory(expoFileSystemNext.cacheDirectory);
  }

  /** The directory where assets bundled with the application are stored. */
  static get bundle() {
    return new Directory(expoFileSystemNext.bundleDirectory);
  }

  /** A place to store files that are safe from being deleted by the system. */
  static get document() {
    return new Directory(expoFileSystemNext.documentDirectory);
  }

  /** @platform ios */
  static get appleSharedContainers() {
    const containers: Record<string, string> =
      expoFileSystemNext.appleSharedContainers ?? {};
    const result: Record<string, Directory> = {};
    for (const appGroupId in containers) {
      if (containers[appGroupId]) {
        result[appGroupId] = new Directory(containers[appGroupId]);
      }
    }
    return result;
  }

  /** The total space on the device's internal storage, in bytes. */
  static get totalDiskSpace() {
    return expoFileSystemNext.totalDiskSpace;
  }

  /** The available space on the device's internal storage, in bytes. */
  static get availableDiskSpace() {
    return expoFileSystemNext.availableDiskSpace;
  }

  /** Returns an object that indicates if the specified path represents a directory. */
  static info(...uris: string[]): IPathInfo {
    return expoFileSystemNext.info(uris.join('/'));
  }
}
