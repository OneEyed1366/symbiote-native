import { createSignal } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
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
import { Directory, File, Paths } from '@symbiote-native/file-system/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Established flavor-neutral download-demo URL — see .claude/rules/canary-flavor-self-reference.md.
const DOWNLOAD_URL = 'https://picsum.photos/200/300';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireDirectory(dir: string | null, label: string): string {
  if (dir === null) {
    throw new Error(`${label} is unavailable on this platform`);
  }
  return dir;
}

/**
 * @symbiote-native/file-system canary demo: both package surfaces side by side. Legacy
 * (`/legacy`) — the function-based API (write/read/info/copy/move/delete, disk space, a
 * resumable download, Android SAF). Modern (`/solid`) — the `File`/`Directory`/`Paths`
 * shared-object API over the same operations.
 */
export function FileSystemScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.FileSystem];
  const lineColor = LINE_COLOR[lineInfo.line];

  // --- Legacy: write/read ---
  const legacyFileUri = () => `${requireDirectory(documentDirectory, 'documentDirectory')}demo.txt`;
  const [writeStatus, setWriteStatus] = createSignal<string | null>(null);
  const [writeError, setWriteError] = createSignal<string | null>(null);
  const [readResult, setReadResult] = createSignal<string | null>(null);
  const [readError, setReadError] = createSignal<string | null>(null);

  const handleWriteFile = async () => {
    try {
      await writeAsStringAsync(legacyFileUri(), 'hello from the legacy API');
      setWriteError(null);
      setWriteStatus('written');
    } catch (error) {
      setWriteStatus(null);
      setWriteError(errorMessage(error));
    }
  };
  const handleReadFile = async () => {
    try {
      const contents = await readAsStringAsync(legacyFileUri());
      setReadError(null);
      setReadResult(contents);
    } catch (error) {
      setReadResult(null);
      setReadError(errorMessage(error));
    }
  };
  const writeStatusDisplay = () => writeError() ?? writeStatus() ?? 'not written yet';
  const readResultDisplay = () => readError() ?? readResult() ?? 'not read yet';

  // --- Legacy: info + directory listing ---
  const [fileInfo, setFileInfo] = createSignal<IFileSystemFileInfo | null>(null);
  const [fileInfoError, setFileInfoError] = createSignal<string | null>(null);
  const [dirEntryCount, setDirEntryCount] = createSignal<number | null>(null);
  const [dirListError, setDirListError] = createSignal<string | null>(null);

  const handleGetInfo = async () => {
    try {
      const info = await getInfoAsync(legacyFileUri());
      setFileInfoError(null);
      setFileInfo(info);
    } catch (error) {
      setFileInfo(null);
      setFileInfoError(errorMessage(error));
    }
  };
  const handleReadDirectory = async () => {
    try {
      const entries = await readDirectoryAsync(requireDirectory(documentDirectory, 'documentDirectory'));
      setDirListError(null);
      setDirEntryCount(entries.length);
    } catch (error) {
      setDirEntryCount(null);
      setDirListError(errorMessage(error));
    }
  };
  const fileInfoDisplay = () => {
    if (fileInfoError()) {
      return fileInfoError()!;
    }
    const info = fileInfo();
    if (info === null) {
      return 'not loaded yet';
    }
    return info.exists ? `exists=true · size=${info.size}` : 'exists=false';
  };
  const dirEntryCountDisplay = () =>
    dirListError() ?? (dirEntryCount() === null ? 'not loaded yet' : `${dirEntryCount()} entries`);

  // --- Legacy: copy / move / delete ---
  const [copyMoveDeleteStatus, setCopyMoveDeleteStatus] = createSignal<string | null>(null);
  const [copyMoveDeleteError, setCopyMoveDeleteError] = createSignal<string | null>(null);

  const handleCopy = async () => {
    try {
      const dir = requireDirectory(documentDirectory, 'documentDirectory');
      await copyAsync({ from: `${dir}demo.txt`, to: `${dir}demo-copy.txt` });
      setCopyMoveDeleteError(null);
      setCopyMoveDeleteStatus('copied to demo-copy.txt');
    } catch (error) {
      setCopyMoveDeleteError(errorMessage(error));
    }
  };
  const handleMove = async () => {
    try {
      const dir = requireDirectory(documentDirectory, 'documentDirectory');
      await moveAsync({ from: `${dir}demo-copy.txt`, to: `${dir}demo-moved.txt` });
      setCopyMoveDeleteError(null);
      setCopyMoveDeleteStatus('moved to demo-moved.txt');
    } catch (error) {
      setCopyMoveDeleteError(errorMessage(error));
    }
  };
  const handleDelete = async () => {
    try {
      const dir = requireDirectory(documentDirectory, 'documentDirectory');
      await deleteAsync(`${dir}demo-moved.txt`, { idempotent: true });
      setCopyMoveDeleteError(null);
      setCopyMoveDeleteStatus('deleted demo-moved.txt');
    } catch (error) {
      setCopyMoveDeleteError(errorMessage(error));
    }
  };
  const copyMoveDeleteDisplay = () => copyMoveDeleteError() ?? copyMoveDeleteStatus() ?? 'no operation run yet';

  // --- Legacy: disk space ---
  const [freeDiskSpace, setFreeDiskSpace] = createSignal<number | null>(null);
  const [totalDiskSpace, setTotalDiskSpace] = createSignal<number | null>(null);
  const [diskSpaceError, setDiskSpaceError] = createSignal<string | null>(null);

  const handleRefreshDiskSpace = async () => {
    try {
      const [free, total] = await Promise.all([getFreeDiskStorageAsync(), getTotalDiskCapacityAsync()]);
      setDiskSpaceError(null);
      setFreeDiskSpace(free);
      setTotalDiskSpace(total);
    } catch (error) {
      setFreeDiskSpace(null);
      setTotalDiskSpace(null);
      setDiskSpaceError(errorMessage(error));
    }
  };
  const diskSpaceDisplay = () => {
    if (diskSpaceError()) {
      return diskSpaceError()!;
    }
    return freeDiskSpace() === null || totalDiskSpace() === null
      ? 'not loaded yet'
      : `${freeDiskSpace()} / ${totalDiskSpace()} bytes free`;
  };

  // --- Legacy: resumable download ---
  const [downloadProgress, setDownloadProgress] = createSignal(0);
  const [downloadResult, setDownloadResult] = createSignal<string | null>(null);
  const [downloadError, setDownloadError] = createSignal<string | null>(null);

  const handleStartDownload = async () => {
    try {
      const resumable = createDownloadResumable(
        DOWNLOAD_URL,
        `${requireDirectory(cacheDirectory, 'cacheDirectory')}downloaded.jpg`,
        undefined,
        progress => {
          const ratio =
            progress.totalBytesExpectedToWrite > 0
              ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
              : 0;
          setDownloadProgress(Math.round(ratio * 100));
        },
      );
      const result = await resumable.downloadAsync();
      setDownloadError(null);
      setDownloadResult(result?.uri ?? null);
    } catch (error) {
      setDownloadResult(null);
      setDownloadError(errorMessage(error));
    }
  };
  const downloadDisplay = () => downloadError() ?? downloadResult() ?? 'not downloaded yet';

  // --- Legacy: Storage Access Framework (Android only) ---
  const [safUri, setSafUri] = createSignal<string | null>(null);
  const [safError, setSafError] = createSignal<string | null>(null);

  const handleRequestSafPermission = async () => {
    try {
      const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      setSafError(null);
      setSafUri(result.granted ? result.directoryUri : 'denied');
    } catch (error) {
      setSafUri(null);
      setSafError(errorMessage(error));
    }
  };
  const safDisplay = () => safError() ?? safUri() ?? 'not requested yet';

  // --- Modern: write/read ---
  const notesFile = new File(Paths.document, 'notes.txt');
  const [nextWriteStatus, setNextWriteStatus] = createSignal<string | null>(null);
  const [nextReadResult, setNextReadResult] = createSignal<string | null>(null);
  const [nextWriteError, setNextWriteError] = createSignal<string | null>(null);
  const [nextReadError, setNextReadError] = createSignal<string | null>(null);

  const handleNextWrite = () => {
    try {
      notesFile.write('hello from the modern API');
      setNextWriteError(null);
      setNextWriteStatus('written');
    } catch (error) {
      setNextWriteError(errorMessage(error));
    }
  };
  const handleNextRead = async () => {
    try {
      const contents = await notesFile.text();
      setNextReadError(null);
      setNextReadResult(contents);
    } catch (error) {
      setNextReadResult(null);
      setNextReadError(errorMessage(error));
    }
  };
  const nextWriteStatusDisplay = () => nextWriteError() ?? nextWriteStatus() ?? 'not written yet';
  const nextReadResultDisplay = () => nextReadError() ?? nextReadResult() ?? 'not read yet';

  // --- Modern: file info ---
  type INextFileInfo = { exists: boolean; size: number; md5: string | null };
  const [nextFileInfo, setNextFileInfo] = createSignal<INextFileInfo | null>(null);
  const [nextFileInfoError, setNextFileInfoError] = createSignal<string | null>(null);

  const handleRefreshNextInfo = () => {
    try {
      setNextFileInfoError(null);
      setNextFileInfo({ exists: notesFile.exists, size: notesFile.size, md5: notesFile.md5 });
    } catch (error) {
      setNextFileInfo(null);
      setNextFileInfoError(errorMessage(error));
    }
  };
  const nextFileInfoDisplay = () => {
    if (nextFileInfoError()) {
      return nextFileInfoError()!;
    }
    const info = nextFileInfo();
    return info === null
      ? 'not loaded yet'
      : `exists=${info.exists} · size=${info.size} · md5=${info.md5 ?? 'n/a'}`;
  };

  // --- Modern: directory ---
  const demoDir = new Directory(Paths.document, 'demo-dir');
  const [nextDirStatus, setNextDirStatus] = createSignal<string | null>(null);
  const [nextDirListing, setNextDirListing] = createSignal<string | null>(null);
  const [nextDirError, setNextDirError] = createSignal<string | null>(null);

  const handleCreateNextDirectory = () => {
    try {
      demoDir.create();
      setNextDirError(null);
      setNextDirStatus('created');
    } catch (error) {
      setNextDirError(errorMessage(error));
    }
  };
  const handleListNextDirectory = () => {
    try {
      const entries = demoDir.list();
      setNextDirError(null);
      setNextDirListing(`${entries.length} entries: ${entries.map(entry => entry.name).join(', ')}`);
    } catch (error) {
      setNextDirListing(null);
      setNextDirError(errorMessage(error));
    }
  };
  const nextDirStatusDisplay = () => nextDirError() ?? nextDirStatus() ?? 'not created yet';
  const nextDirListingDisplay = () => nextDirListing() ?? 'not listed yet';

  // --- Modern: download ---
  const [nextDownloadProgress, setNextDownloadProgress] = createSignal(0);
  const [nextDownloadResult, setNextDownloadResult] = createSignal<string | null>(null);
  const [nextDownloadError, setNextDownloadError] = createSignal<string | null>(null);

  const handleNextDownload = async () => {
    try {
      const file = await File.downloadFileAsync(DOWNLOAD_URL, Paths.cache, {
        onProgress: progress => {
          const ratio = progress.totalBytes > 0 ? progress.bytesWritten / progress.totalBytes : 0;
          setNextDownloadProgress(Math.round(ratio * 100));
        },
      });
      setNextDownloadError(null);
      setNextDownloadResult(file.uri);
    } catch (error) {
      setNextDownloadResult(null);
      setNextDownloadError(errorMessage(error));
    }
  };
  const nextDownloadDisplay = () => nextDownloadError() ?? nextDownloadResult() ?? 'not downloaded yet';

  return (
    <safe-area-view class="screen">
      <scroll-view testID="file-system-scroll" class="screen" contentContainerStyle="scroll-content">
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="file-system-hero" class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: lineColor }}>
            <text class="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">File System</text>
            <text class="hero-body">
              @symbiote-native/file-system — the legacy function-based API and the modern
              File/Directory/Paths API, side by side over the same reads, writes, and downloads.
            </text>
          </view>
        </view>

        <view testID="file-system-directories-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Directories (legacy)</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Document</text>
            <text class="value-text">{documentDirectory ?? 'n/a'}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Cache</text>
            <text class="value-text">{cacheDirectory ?? 'n/a'}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Bundle</text>
            <text class="value-text">{bundleDirectory ?? 'n/a'}</text>
          </view>
        </view>

        <view testID="file-system-write-read-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Write / read (legacy)</text>
          </view>
          <ActionButton
            testID="file-system-write-file"
            title="Write file"
            onPress={() => void handleWriteFile()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Write</text>
            <text testID="file-system-write-status" class="value-text">
              {writeStatusDisplay()}
            </text>
          </view>
          <ActionButton
            testID="file-system-read-file"
            title="Read file"
            onPress={() => void handleReadFile()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Read</text>
            <text testID="file-system-read-result" class="value-text">
              {readResultDisplay()}
            </text>
          </view>
        </view>

        <view testID="file-system-info-list-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Info + directory listing (legacy)</text>
          </view>
          <ActionButton
            testID="file-system-get-info"
            title="Get file info"
            onPress={() => void handleGetInfo()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Info</text>
            <text testID="file-system-file-info" class="value-text">
              {fileInfoDisplay()}
            </text>
          </view>
          <ActionButton
            testID="file-system-read-directory"
            title="Read directory"
            onPress={() => void handleReadDirectory()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Entries</text>
            <text testID="file-system-dir-entry-count" class="value-text">
              {dirEntryCountDisplay()}
            </text>
          </view>
        </view>

        <view testID="file-system-copy-move-delete-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Copy / move / delete (legacy)</text>
          </view>
          <ActionButton
            testID="file-system-copy"
            title="Copy"
            onPress={() => void handleCopy()}
            color={lineColor}
          />
          <ActionButton
            testID="file-system-move"
            title="Move"
            onPress={() => void handleMove()}
            color={lineColor}
          />
          <ActionButton
            testID="file-system-delete"
            title="Delete"
            onPress={() => void handleDelete()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="file-system-copy-move-delete-status" class="value-text">
              {copyMoveDeleteDisplay()}
            </text>
          </view>
        </view>

        <view testID="file-system-disk-space-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Disk space (legacy)</text>
          </view>
          <ActionButton
            testID="file-system-refresh-disk-space"
            title="Refresh"
            onPress={() => void handleRefreshDiskSpace()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Free / total</text>
            <text testID="file-system-disk-space" class="value-text">
              {diskSpaceDisplay()}
            </text>
          </view>
        </view>

        <view testID="file-system-download-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Resumable download (legacy)</text>
          </view>
          <ActionButton
            testID="file-system-start-download"
            title="Start download"
            onPress={() => void handleStartDownload()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Progress</text>
            <text testID="file-system-download-progress" class="value-text">
              {`${downloadProgress()}%`}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Result</text>
            <text testID="file-system-download-result" class="value-text">
              {downloadDisplay()}
            </text>
          </view>
        </view>

        {Platform.OS === 'android' && (
          <view testID="file-system-saf-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Storage Access Framework (legacy · Android)</text>
            </view>
            <ActionButton
              testID="file-system-request-saf-permission"
              title="Request directory permission"
              onPress={() => void handleRequestSafPermission()}
              color={lineColor}
            />
            <view class="capability-row">
              <text class="capability-label">Granted URI</text>
              <text testID="file-system-saf-uri" class="value-text">
                {safDisplay()}
              </text>
            </view>
          </view>
        )}

        <view testID="file-system-next-write-read-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Write / read (modern)</text>
          </view>
          <ActionButton
            testID="file-system-next-write-file"
            title="Write file"
            onPress={handleNextWrite}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Write</text>
            <text testID="file-system-next-write-status" class="value-text">
              {nextWriteStatusDisplay()}
            </text>
          </view>
          <ActionButton
            testID="file-system-next-read-file"
            title="Read file"
            onPress={() => void handleNextRead()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Read</text>
            <text testID="file-system-next-read-result" class="value-text">
              {nextReadResultDisplay()}
            </text>
          </view>
        </view>

        <view testID="file-system-next-info-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">File info (modern)</text>
          </view>
          <ActionButton
            testID="file-system-next-refresh-info"
            title="Refresh"
            onPress={handleRefreshNextInfo}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Info</text>
            <text testID="file-system-next-info" class="value-text">
              {nextFileInfoDisplay()}
            </text>
          </view>
        </view>

        <view testID="file-system-next-directory-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Directory (modern)</text>
          </view>
          <ActionButton
            testID="file-system-next-create-directory"
            title="Create directory"
            onPress={handleCreateNextDirectory}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Create</text>
            <text testID="file-system-next-directory-status" class="value-text">
              {nextDirStatusDisplay()}
            </text>
          </view>
          <ActionButton
            testID="file-system-next-list-directory"
            title="List directory"
            onPress={handleListNextDirectory}
            color={lineColor}
          />
          <text testID="file-system-next-directory-listing" class="info-text">
            {nextDirListingDisplay()}
          </text>
        </view>

        <view testID="file-system-next-download-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Download (modern)</text>
          </view>
          <ActionButton
            testID="file-system-next-start-download"
            title="Start download"
            onPress={() => void handleNextDownload()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Progress</text>
            <text testID="file-system-next-download-progress" class="value-text">
              {`${nextDownloadProgress()}%`}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Result</text>
            <text testID="file-system-next-download-result" class="value-text">
              {nextDownloadDisplay()}
            </text>
          </view>
        </view>

        <view testID="file-system-next-paths-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Paths (modern)</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Total disk space</text>
            <text testID="file-system-next-total-disk-space" class="value-text">
              {`${Paths.totalDiskSpace} bytes`}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Available disk space</text>
            <text testID="file-system-next-available-disk-space" class="value-text">
              {`${Paths.availableDiskSpace} bytes`}
            </text>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
