import { Component, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  bundleDirectory,
  cacheDirectory,
  copyAsync,
  createDownloadResumable,
  deleteAsync,
  documentDirectory,
  getFreeDiskStorageAsync,
  getInfoAsync,
  getTotalDiskCapacityAsync,
  moveAsync,
  readAsStringAsync,
  readDirectoryAsync,
  StorageAccessFramework,
  writeAsStringAsync,
} from '@symbiote-native/file-system/legacy';
import type { IFileSystemFileInfo } from '@symbiote-native/file-system/legacy';
import { Directory, File, Paths } from '@symbiote-native/file-system/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatGb(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

const DEMO_FILE_URI = `${documentDirectory}demo.txt`;
const DEMO_COPY_URI = `${documentDirectory}demo-copy.txt`;
const DEMO_MOVED_URI = `${documentDirectory}demo-moved.txt`;
const DEMO_FILE_CONTENT = 'Hello from the legacy file-system API.';
const DOWNLOAD_SOURCE_URL = 'https://picsum.photos/200/300';
const NEXT_FILE_CONTENT = 'hello from the modern API';

/**
 * @symbiote-native/file-system canary demo, in two sections: the LEGACY function-based API
 * (`/legacy` — read/write/copy/move/delete, directory listing, disk-space queries, resumable
 * download, Android Storage Access Framework) and the MODERN File/Directory/Paths shared-object
 * API (the package's default `/angular` surface). Same imperative shape as MediaLibraryScreen —
 * no Angular service wrapper exists for this package.
 */
@Component({
  selector: 'FileSystemScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="file-system-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">File System</text>
            <text testID="file-system-hero" class="hero-body">
              @symbiote-native/file-system — the legacy function-based API and
              the modern File/Directory/Paths shared-object API, side by side.
            </text>
          </view>
        </view>

        <text class="menu-eyebrow">LEGACY API</text>

        <view testID="file-system-directories-card" class="capability-card">
          <text class="capability-card-title">Directories</text>
          <view class="capability-row">
            <text class="capability-label">documentDirectory</text>
            <text testID="file-system-document-directory" class="value-text">{{
              documentDirectory
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">cacheDirectory</text>
            <text testID="file-system-cache-directory" class="value-text">{{
              cacheDirectory
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">bundleDirectory</text>
            <text testID="file-system-bundle-directory" class="value-text">{{
              bundleDirectory
            }}</text>
          </view>
        </view>

        <view testID="file-system-write-read-card" class="capability-card">
          <text class="capability-card-title">Write / read</text>
          <ActionButton
            testID="file-system-write"
            title="Write demo.txt"
            (press)="writeDemoFile()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="file-system-read"
            title="Read demo.txt"
            (press)="readDemoFile()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="file-system-write-read-status" class="value-text">{{
            writeReadStatusLabel()
          }}</text>
        </view>

        <view testID="file-system-info-list-card" class="capability-card">
          <text class="capability-card-title">Info / directory listing</text>
          <ActionButton
            testID="file-system-load-info"
            title="Get info"
            (press)="loadDemoFileInfo()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="file-system-info" class="value-text">{{
            infoLabel()
          }}</text>
          <ActionButton
            testID="file-system-load-directory"
            title="Read directory"
            (press)="loadDirectoryEntries()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="file-system-directory-count" class="value-text">{{
            directoryCountLabel()
          }}</text>
        </view>

        <view
          testID="file-system-copy-move-delete-card"
          class="capability-card"
        >
          <text class="capability-card-title">Copy / move / delete</text>
          <ActionButton
            testID="file-system-copy"
            title="Copy to demo-copy.txt"
            (press)="copyDemoFile()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="file-system-move"
            title="Move to demo-moved.txt"
            (press)="moveDemoFile()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="file-system-delete"
            title="Delete demo-moved.txt"
            (press)="deleteMovedFile()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="file-system-relocate-status" class="value-text">{{
            relocateStatus() ?? 'not run yet'
          }}</text>
        </view>

        <view testID="file-system-disk-space-card" class="capability-card">
          <text class="capability-card-title">Disk space</text>
          <ActionButton
            testID="file-system-refresh-disk-space"
            title="Refresh"
            (press)="refreshDiskSpace()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="file-system-disk-space" class="value-text">{{
            diskSpaceLabel()
          }}</text>
        </view>

        <view testID="file-system-download-card" class="capability-card">
          <text class="capability-card-title">Resumable download</text>
          <ActionButton
            testID="file-system-download-start"
            title="Download"
            (press)="startDownload()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="file-system-download-progress" class="value-text">{{
            downloadProgressLabel()
          }}</text>
        </view>

        @if (Platform.OS === 'android') {
          <view testID="file-system-saf-card" class="capability-card">
            <text class="capability-card-title">
              Storage Access Framework
            </text>
            <ActionButton
              testID="file-system-saf-request"
              title="Request directory access"
              (press)="requestSafDirectory()"
              [color]="lineColor"
            ></ActionButton>
            <text testID="file-system-saf-uri" class="value-text">{{
              safResultLabel()
            }}</text>
          </view>
        }

        <text class="menu-eyebrow">MODERN API (File / Directory / Paths)</text>

        <view testID="file-system-next-write-read-card" class="capability-card">
          <text class="capability-card-title">Write / read</text>
          <ActionButton
            testID="file-system-next-write"
            title="Write notes.txt"
            (press)="writeNextFile()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="file-system-next-read"
            title="Read notes.txt"
            (press)="readNextFile()"
            [color]="lineColor"
          ></ActionButton>
          <text
            testID="file-system-next-write-read-status"
            class="value-text"
            >{{ nextWriteReadStatusLabel() }}</text
          >
        </view>

        <view testID="file-system-next-info-card" class="capability-card">
          <text class="capability-card-title">File info</text>
          <ActionButton
            testID="file-system-next-refresh-info"
            title="Refresh"
            (press)="refreshNextFileInfo()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="file-system-next-info" class="value-text">{{
            nextFileInfoLabel()
          }}</text>
        </view>

        <view testID="file-system-next-directory-card" class="capability-card">
          <text class="capability-card-title">Directory</text>
          <ActionButton
            testID="file-system-next-create-directory"
            title="Create demo-dir"
            (press)="createNextDirectory()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="file-system-next-list-directory"
            title="List demo-dir"
            (press)="listNextDirectory()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="file-system-next-directory-list" class="value-text">{{
            nextDirectoryLabel()
          }}</text>
        </view>

        <view testID="file-system-next-download-card" class="capability-card">
          <text class="capability-card-title">Download</text>
          <ActionButton
            testID="file-system-next-download-start"
            title="Download"
            (press)="startNextDownload()"
            [color]="lineColor"
          ></ActionButton>
          <text
            testID="file-system-next-download-progress"
            class="value-text"
            >{{ nextDownloadProgressLabel() }}</text
          >
        </view>

        <view testID="file-system-next-paths-card" class="capability-card">
          <text class="capability-card-title">Paths disk space</text>
          <text testID="file-system-next-paths" class="value-text">{{
            nextPathsLabel()
          }}</text>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class FileSystemScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.FileSystem];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };
  readonly Platform = Platform;

  readonly documentDirectory = documentDirectory;
  readonly cacheDirectory = cacheDirectory;
  readonly bundleDirectory = bundleDirectory;

  // --- legacy: write / read ---
  private readonly writeError = signal<string | null>(null);
  private readonly readContent = signal<string | null>(null);
  private readonly readError = signal<string | null>(null);

  async writeDemoFile(): Promise<void> {
    try {
      await writeAsStringAsync(DEMO_FILE_URI, DEMO_FILE_CONTENT);
      this.writeError.set(null);
    } catch (error) {
      this.writeError.set(errorMessage(error));
    }
  }

  async readDemoFile(): Promise<void> {
    try {
      this.readContent.set(await readAsStringAsync(DEMO_FILE_URI));
      this.readError.set(null);
    } catch (error) {
      this.readError.set(errorMessage(error));
    }
  }

  writeReadStatusLabel(): string {
    if (this.writeError()) return `write error: ${this.writeError()}`;
    if (this.readError()) return `read error: ${this.readError()}`;
    return this.readContent() ?? 'not read yet';
  }

  // --- legacy: info / directory listing ---
  private readonly infoResult = signal<IFileSystemFileInfo | null>(null);
  private readonly infoError = signal<string | null>(null);
  private readonly dirEntryCount = signal<number | null>(null);
  private readonly dirError = signal<string | null>(null);

  async loadDemoFileInfo(): Promise<void> {
    try {
      this.infoResult.set(await getInfoAsync(DEMO_FILE_URI));
      this.infoError.set(null);
    } catch (error) {
      this.infoError.set(errorMessage(error));
    }
  }

  async loadDirectoryEntries(): Promise<void> {
    try {
      const entries = await readDirectoryAsync(documentDirectory ?? '');
      this.dirEntryCount.set(entries.length);
      this.dirError.set(null);
    } catch (error) {
      this.dirError.set(errorMessage(error));
    }
  }

  infoLabel(): string {
    const error = this.infoError();
    if (error) return error;
    const info = this.infoResult();
    if (!info) return 'not loaded yet';
    return info.exists
      ? `exists: true · size: ${info.size} bytes`
      : 'exists: false';
  }

  directoryCountLabel(): string {
    const error = this.dirError();
    if (error) return error;
    const count = this.dirEntryCount();
    return count === null ? 'not loaded yet' : `${count} entries`;
  }

  // --- legacy: copy / move / delete ---
  readonly relocateStatus = signal<string | null>(null);

  async copyDemoFile(): Promise<void> {
    try {
      await copyAsync({ from: DEMO_FILE_URI, to: DEMO_COPY_URI });
      this.relocateStatus.set(`copied to ${DEMO_COPY_URI}`);
    } catch (error) {
      this.relocateStatus.set(errorMessage(error));
    }
  }

  async moveDemoFile(): Promise<void> {
    try {
      await moveAsync({ from: DEMO_COPY_URI, to: DEMO_MOVED_URI });
      this.relocateStatus.set(`moved to ${DEMO_MOVED_URI}`);
    } catch (error) {
      this.relocateStatus.set(errorMessage(error));
    }
  }

  async deleteMovedFile(): Promise<void> {
    try {
      await deleteAsync(DEMO_MOVED_URI, { idempotent: true });
      this.relocateStatus.set(`deleted ${DEMO_MOVED_URI}`);
    } catch (error) {
      this.relocateStatus.set(errorMessage(error));
    }
  }

  // --- legacy: disk space ---
  private readonly freeDiskSpace = signal<number | null>(null);
  private readonly totalDiskSpace = signal<number | null>(null);
  private readonly diskSpaceError = signal<string | null>(null);

  async refreshDiskSpace(): Promise<void> {
    try {
      const [free, total] = await Promise.all([
        getFreeDiskStorageAsync(),
        getTotalDiskCapacityAsync(),
      ]);
      this.freeDiskSpace.set(free);
      this.totalDiskSpace.set(total);
      this.diskSpaceError.set(null);
    } catch (error) {
      this.diskSpaceError.set(errorMessage(error));
    }
  }

  diskSpaceLabel(): string {
    const error = this.diskSpaceError();
    if (error) return error;
    const free = this.freeDiskSpace();
    const total = this.totalDiskSpace();
    if (free === null || total === null) return 'not loaded yet';
    return `${formatGb(free)} free of ${formatGb(total)}`;
  }

  // --- legacy: resumable download ---
  private readonly downloadProgress = signal(0);
  private readonly downloadError = signal<string | null>(null);
  private readonly downloadResumable = createDownloadResumable(
    DOWNLOAD_SOURCE_URL,
    `${cacheDirectory}downloaded.jpg`,
    undefined,
    data => {
      const percent = data.totalBytesExpectedToWrite
        ? Math.round(
            (data.totalBytesWritten / data.totalBytesExpectedToWrite) * 100,
          )
        : 0;
      this.downloadProgress.set(percent);
    },
  );

  async startDownload(): Promise<void> {
    try {
      await this.downloadResumable.downloadAsync();
      this.downloadError.set(null);
    } catch (error) {
      this.downloadError.set(errorMessage(error));
    }
  }

  downloadProgressLabel(): string {
    const error = this.downloadError();
    if (error) return error;
    return `${this.downloadProgress()}%`;
  }

  // --- legacy: Storage Access Framework (Android only) ---
  private readonly safResult = signal<string | null>(null);

  async requestSafDirectory(): Promise<void> {
    try {
      const result =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      this.safResult.set(result.granted ? result.directoryUri : 'denied');
    } catch (error) {
      this.safResult.set(errorMessage(error));
    }
  }

  safResultLabel(): string {
    return this.safResult() ?? 'not requested yet';
  }

  // --- modern: write / read ---
  private readonly nextFile = new File(Paths.document, 'notes.txt');
  private readonly nextWriteError = signal<string | null>(null);
  private readonly nextReadContent = signal<string | null>(null);
  private readonly nextReadError = signal<string | null>(null);

  writeNextFile(): void {
    try {
      this.nextFile.write(NEXT_FILE_CONTENT);
      this.nextWriteError.set(null);
    } catch (error) {
      this.nextWriteError.set(errorMessage(error));
    }
  }

  async readNextFile(): Promise<void> {
    try {
      this.nextReadContent.set(await this.nextFile.text());
      this.nextReadError.set(null);
    } catch (error) {
      this.nextReadError.set(errorMessage(error));
    }
  }

  nextWriteReadStatusLabel(): string {
    if (this.nextWriteError()) return `write error: ${this.nextWriteError()}`;
    if (this.nextReadError()) return `read error: ${this.nextReadError()}`;
    return this.nextReadContent() ?? 'not read yet';
  }

  // --- modern: file info ---
  private readonly nextInfoVersion = signal(0);

  refreshNextFileInfo(): void {
    this.nextInfoVersion.update(version => version + 1);
  }

  nextFileInfoLabel(): string {
    this.nextInfoVersion();
    try {
      return `exists: ${this.nextFile.exists} · size: ${
        this.nextFile.size ?? '—'
      } · md5: ${this.nextFile.md5 ?? '—'}`;
    } catch (error) {
      return errorMessage(error);
    }
  }

  // --- modern: directory ---
  private readonly nextDir = new Directory(Paths.document, 'demo-dir');
  private readonly nextDirEntries = signal<string[] | null>(null);
  private readonly nextDirError = signal<string | null>(null);

  createNextDirectory(): void {
    try {
      this.nextDir.create({ intermediates: true, overwrite: true });
      this.nextDirError.set(null);
    } catch (error) {
      this.nextDirError.set(errorMessage(error));
    }
  }

  listNextDirectory(): void {
    try {
      this.nextDirEntries.set(this.nextDir.list().map(entry => entry.name));
      this.nextDirError.set(null);
    } catch (error) {
      this.nextDirError.set(errorMessage(error));
    }
  }

  nextDirectoryLabel(): string {
    const error = this.nextDirError();
    if (error) return error;
    const entries = this.nextDirEntries();
    if (!entries) return 'not listed yet';
    return `${entries.length} entries: ${entries.join(', ') || '—'}`;
  }

  // --- modern: download ---
  private readonly nextDownloadProgress = signal(0);
  private readonly nextDownloadError = signal<string | null>(null);

  async startNextDownload(): Promise<void> {
    try {
      await File.downloadFileAsync(DOWNLOAD_SOURCE_URL, Paths.cache, {
        onProgress: data => {
          const percent = data.totalBytes
            ? Math.round((data.bytesWritten / data.totalBytes) * 100)
            : 0;
          this.nextDownloadProgress.set(percent);
        },
      });
      this.nextDownloadError.set(null);
    } catch (error) {
      this.nextDownloadError.set(errorMessage(error));
    }
  }

  nextDownloadProgressLabel(): string {
    const error = this.nextDownloadError();
    if (error) return error;
    return `${this.nextDownloadProgress()}%`;
  }

  // --- modern: Paths disk space (synchronous getters) ---
  nextPathsLabel(): string {
    try {
      return `${formatGb(Paths.totalDiskSpace)} total · ${formatGb(
        Paths.availableDiskSpace,
      )} available`;
    } catch (error) {
      return errorMessage(error);
    }
  }
}
