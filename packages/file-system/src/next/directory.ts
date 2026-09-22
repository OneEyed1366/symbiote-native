import { File } from './file';
import { expoFileSystemNext } from './native-module';
import { Paths } from './paths';
import { FileSystemWatcher } from './watcher';
import type {
  IFileSystemWatchEvent,
  IFileSystemWatchOptions,
  IFileSystemWatchSubscription,
} from './types';

/**
 * Represents a directory on the filesystem.
 *
 * A `Directory` instance can be created for any path, and does not need to exist on the
 * filesystem during creation.
 */
export class Directory extends expoFileSystemNext.FileSystemDirectory {
  static pickDirectoryAsync: (initialUri?: string) => Promise<Directory>;

  /**
   * Creates an instance of a directory. It can be created for any path, and does not need to
   * exist on the filesystem during creation.
   */
  constructor(...uris: (string | File | Directory)[]) {
    super(Paths.join(...uris));
    this.validatePath();
  }

  /** Directory containing this directory. */
  get parentDirectory() {
    return new Directory(Paths.join(this.uri, '..'));
  }

  /**
   * Lists the contents of a directory. Calling this method if the parent directory does not
   * exist will throw an error.
   */
  override list(): (Directory | File)[] {
    return super
      .listAsRecords()
      .map(({ isDirectory, uri }) =>
        isDirectory ? new Directory(uri) : new File(uri),
      );
  }

  /** Directory name. */
  get name() {
    return Paths.basename(this.uri);
  }

  override createFile(name: string, mimeType: string | null): File {
    return new File(super.createFile(name, mimeType).uri);
  }

  override createDirectory(name: string): Directory {
    return new Directory(super.createDirectory(name).uri);
  }

  /**
   * Watches this directory for changes to its contents or the directory itself. On iOS,
   * child changes are surfaced as a coarse-grained `modified` event on the directory itself, so
   * filtering for child-level `created`, `deleted`, or `renamed` events is not reliable. The
   * watcher automatically stops when the directory is deleted or renamed. To stop watching
   * manually, call `remove()` on the returned subscription.
   */
  watch(
    callback: (event: IFileSystemWatchEvent<File | Directory>) => void,
    options?: IFileSystemWatchOptions,
  ): IFileSystemWatchSubscription {
    return new FileSystemWatcher<File | Directory>(
      this.uri,
      callback,
      options,
      (uri, isDirectory) => (isDirectory ? new Directory(uri) : new File(uri)),
    );
  }
}

Directory.pickDirectoryAsync = async function (initialUri?: string) {
  const directory = (await expoFileSystemNext.pickDirectoryAsync(initialUri))
    .uri;
  return new Directory(directory);
};
