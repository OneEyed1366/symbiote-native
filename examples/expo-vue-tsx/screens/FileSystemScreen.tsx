import { defineComponent, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
import { Directory, File, Paths } from '@symbiote-native/file-system/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DOWNLOAD_URL = 'https://picsum.photos/200/300';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * File-system demo: @symbiote-native/file-system — both of the package's surfaces side by side.
 * Legacy: the function-based API (read/write/copy/move/delete, disk space, resumable download,
 * Android Storage Access Framework). Modern: the File/Directory/Paths class-based API. Both
 * sections operate on real files under the app's own document/cache directories.
 */
export const FileSystemScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.FileSystem];
    const lineColor = LINE_COLOR[lineInfo.line];

    // Legacy directories are `string | null` per the upstream API; this demo's own files always
    // live under the document/cache root, so fall back to '' once here rather than guarding null
    // in every handler below.
    const documentDir = documentDirectory ?? '';
    const cacheDir = cacheDirectory ?? '';

    // --- legacy: write / read ---
    const writeReadResult = ref('not read yet');
    async function handleWrite() {
      try {
        await writeAsStringAsync(`${documentDir}demo.txt`, 'hello from the legacy API');
        writeReadResult.value = 'wrote demo.txt';
      } catch (error) {
        writeReadResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleRead() {
      try {
        writeReadResult.value = await readAsStringAsync(`${documentDir}demo.txt`);
      } catch (error) {
        writeReadResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    // --- legacy: info / directory listing ---
    const infoResult = ref('not loaded yet');
    const directoryCount = ref('not loaded yet');
    async function handleGetInfo() {
      try {
        const info = await getInfoAsync(`${documentDir}demo.txt`);
        infoResult.value = info.exists ? `exists: true · size: ${info.size}` : 'exists: false';
      } catch (error) {
        infoResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleReadDirectory() {
      try {
        const entries = await readDirectoryAsync(documentDir);
        directoryCount.value = `${entries.length} entries`;
      } catch (error) {
        directoryCount.value = `Failed: ${errorMessage(error)}`;
      }
    }

    // --- legacy: copy / move / delete ---
    const copyMoveDeleteResult = ref('not run yet');
    async function handleCopy() {
      try {
        await copyAsync({ from: `${documentDir}demo.txt`, to: `${documentDir}demo-copy.txt` });
        copyMoveDeleteResult.value = 'copied to demo-copy.txt';
      } catch (error) {
        copyMoveDeleteResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleMove() {
      try {
        await moveAsync({ from: `${documentDir}demo-copy.txt`, to: `${documentDir}demo-moved.txt` });
        copyMoveDeleteResult.value = 'moved to demo-moved.txt';
      } catch (error) {
        copyMoveDeleteResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleDelete() {
      try {
        await deleteAsync(`${documentDir}demo-moved.txt`, { idempotent: true });
        copyMoveDeleteResult.value = 'deleted demo-moved.txt';
      } catch (error) {
        copyMoveDeleteResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    // --- legacy: disk space ---
    const freeSpace = ref('not loaded yet');
    const totalSpace = ref('not loaded yet');
    async function handleRefreshDiskSpace() {
      try {
        const [free, total] = await Promise.all([
          getFreeDiskStorageAsync(),
          getTotalDiskCapacityAsync(),
        ]);
        freeSpace.value = megabytes(free);
        totalSpace.value = megabytes(total);
      } catch (error) {
        freeSpace.value = `Failed: ${errorMessage(error)}`;
      }
    }

    // --- legacy: resumable download ---
    const downloadProgress = ref(0);
    const downloadResult = ref('not started yet');
    const resumable = createDownloadResumable(
      DOWNLOAD_URL,
      `${cacheDir}downloaded.jpg`,
      undefined,
      data => {
        downloadProgress.value = Math.round(
          (data.totalBytesWritten / data.totalBytesExpectedToWrite) * 100,
        );
      },
    );
    async function handleDownload() {
      try {
        const result = await resumable.downloadAsync();
        downloadResult.value = result ? `downloaded to ${result.uri}` : 'no result';
      } catch (error) {
        downloadResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    // --- legacy: Storage Access Framework (Android only) ---
    const safResult = ref('not requested yet');
    async function handleSafRequest() {
      try {
        const response = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        safResult.value = response.granted ? response.directoryUri : 'denied';
      } catch (error) {
        safResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    // --- modern: File / Directory / Paths ---
    const noteFile = new File(Paths.document, 'notes.txt');
    const demoDir = new Directory(Paths.document, 'demo-dir');

    const nextWriteReadResult = ref('not read yet');
    function handleNextWrite() {
      try {
        noteFile.write('hello from the modern API');
        nextWriteReadResult.value = 'wrote notes.txt';
      } catch (error) {
        nextWriteReadResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleNextRead() {
      try {
        nextWriteReadResult.value = await noteFile.text();
      } catch (error) {
        nextWriteReadResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    const nextExists = ref('not loaded yet');
    const nextSize = ref('not loaded yet');
    const nextMd5 = ref('not loaded yet');
    function handleNextRefreshInfo() {
      try {
        const exists = noteFile.exists;
        nextExists.value = String(exists);
        nextSize.value = exists ? `${noteFile.size} bytes` : 'n/a';
        nextMd5.value = exists ? (noteFile.md5 ?? 'n/a') : 'n/a';
      } catch (error) {
        nextExists.value = `Failed: ${errorMessage(error)}`;
      }
    }

    const nextDirResult = ref('not loaded yet');
    function handleNextCreateDir() {
      try {
        demoDir.create();
        nextDirResult.value = 'created demo-dir';
      } catch (error) {
        nextDirResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    function handleNextListDir() {
      try {
        const entries = demoDir.list();
        nextDirResult.value = `${entries.length} entries: ${entries.map(entry => entry.name).join(', ')}`;
      } catch (error) {
        nextDirResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    const nextDownloadProgress = ref(0);
    const nextDownloadResult = ref('not started yet');
    async function handleNextDownload() {
      try {
        const file = await File.downloadFileAsync(DOWNLOAD_URL, Paths.cache, {
          onProgress: data => {
            nextDownloadProgress.value = Math.round((data.bytesWritten / data.totalBytes) * 100);
          },
        });
        nextDownloadResult.value = `downloaded to ${file.uri}`;
      } catch (error) {
        nextDownloadResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="file-system-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
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
                @symbiote-native/file-system — both surfaces side by side: the legacy
                function-based API and the modern File/Directory/Paths class-based API.
              </text>
            </view>
          </view>

          <view testID="file-system-directories-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Directories (legacy)</text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">documentDirectory</text>
              <text class="auth-value-text">{documentDirectory ?? 'null'}</text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">cacheDirectory</text>
              <text class="auth-value-text">{cacheDirectory ?? 'null'}</text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">bundleDirectory</text>
              <text class="auth-value-text">{bundleDirectory ?? 'null'}</text>
            </view>
          </view>

          <view testID="file-system-write-read-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Write / read</text>
            </view>
            <ActionButton
              testID="file-system-write"
              title="Write demo.txt"
              onPress={handleWrite}
              color={lineColor}
            />
            <ActionButton
              testID="file-system-read"
              title="Read demo.txt"
              onPress={handleRead}
              color={lineColor}
            />
            <text testID="file-system-write-read-result" class="info-text">
              {writeReadResult.value}
            </text>
          </view>

          <view testID="file-system-info-list-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Info / directory listing</text>
            </view>
            <ActionButton
              testID="file-system-get-info"
              title="Get info (demo.txt)"
              onPress={handleGetInfo}
              color={lineColor}
            />
            <text testID="file-system-info-result" class="auth-value-text">
              {infoResult.value}
            </text>
            <ActionButton
              testID="file-system-read-directory"
              title="Read directory (documentDirectory)"
              onPress={handleReadDirectory}
              color={lineColor}
            />
            <text testID="file-system-directory-count" class="auth-value-text">
              {directoryCount.value}
            </text>
          </view>

          <view testID="file-system-copy-move-delete-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Copy / move / delete</text>
            </view>
            <ActionButton
              testID="file-system-copy"
              title="Copy to demo-copy.txt"
              onPress={handleCopy}
              color={lineColor}
            />
            <ActionButton
              testID="file-system-move"
              title="Move to demo-moved.txt"
              onPress={handleMove}
              color={lineColor}
            />
            <ActionButton
              testID="file-system-delete"
              title="Delete demo-moved.txt"
              onPress={handleDelete}
              color={lineColor}
            />
            <text testID="file-system-copy-move-delete-result" class="info-text">
              {copyMoveDeleteResult.value}
            </text>
          </view>

          <view testID="file-system-disk-space-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Disk space</text>
            </view>
            <ActionButton
              testID="file-system-refresh-disk-space"
              title="Refresh disk space"
              onPress={handleRefreshDiskSpace}
              color={lineColor}
            />
            <view class="auth-capability-row">
              <text class="auth-capability-label">Free</text>
              <text testID="file-system-free-space" class="auth-value-text">
                {freeSpace.value}
              </text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Total</text>
              <text testID="file-system-total-space" class="auth-value-text">
                {totalSpace.value}
              </text>
            </view>
          </view>

          <view testID="file-system-download-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Resumable download</text>
            </view>
            <ActionButton
              testID="file-system-start-download"
              title="Download image"
              onPress={handleDownload}
              color={lineColor}
            />
            <text testID="file-system-download-progress" class="auth-value-text">
              {`${downloadProgress.value}%`}
            </text>
            <text testID="file-system-download-result" class="info-text">
              {downloadResult.value}
            </text>
          </view>

          {Platform.OS === 'android' && (
            <view testID="file-system-saf-card" class="auth-card">
              <view class="auth-card-header">
                <text class="auth-card-title">Storage Access Framework</text>
              </view>
              <ActionButton
                testID="file-system-saf-request"
                title="Request directory permissions"
                onPress={handleSafRequest}
                color={lineColor}
              />
              <text testID="file-system-saf-result" class="info-text">
                {safResult.value}
              </text>
            </view>
          )}

          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">Modern API — File / Directory / Paths</text>
          </view>

          <view testID="file-system-next-write-read-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Write / read (modern)</text>
            </view>
            <ActionButton
              testID="file-system-next-write"
              title="Write notes.txt"
              onPress={handleNextWrite}
              color={lineColor}
            />
            <ActionButton
              testID="file-system-next-read"
              title="Read notes.txt"
              onPress={handleNextRead}
              color={lineColor}
            />
            <text testID="file-system-next-write-read-result" class="info-text">
              {nextWriteReadResult.value}
            </text>
          </view>

          <view testID="file-system-next-info-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Info (modern)</text>
            </view>
            <ActionButton
              testID="file-system-next-refresh-info"
              title="Refresh info"
              onPress={handleNextRefreshInfo}
              color={lineColor}
            />
            <view class="auth-capability-row">
              <text class="auth-capability-label">exists</text>
              <text testID="file-system-next-exists" class="auth-value-text">
                {nextExists.value}
              </text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">size</text>
              <text testID="file-system-next-size" class="auth-value-text">
                {nextSize.value}
              </text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">md5</text>
              <text testID="file-system-next-md5" class="auth-value-text">
                {nextMd5.value}
              </text>
            </view>
          </view>

          <view testID="file-system-next-directory-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Directory (modern)</text>
            </view>
            <ActionButton
              testID="file-system-next-create-directory"
              title="Create demo-dir"
              onPress={handleNextCreateDir}
              color={lineColor}
            />
            <ActionButton
              testID="file-system-next-list-directory"
              title="List demo-dir"
              onPress={handleNextListDir}
              color={lineColor}
            />
            <text testID="file-system-next-directory-result" class="info-text">
              {nextDirResult.value}
            </text>
          </view>

          <view testID="file-system-next-download-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Download (modern)</text>
            </view>
            <ActionButton
              testID="file-system-next-start-download"
              title="Download image"
              onPress={handleNextDownload}
              color={lineColor}
            />
            <text testID="file-system-next-download-progress" class="auth-value-text">
              {`${nextDownloadProgress.value}%`}
            </text>
            <text testID="file-system-next-download-result" class="info-text">
              {nextDownloadResult.value}
            </text>
          </view>

          <view testID="file-system-next-paths-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Paths (modern)</text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Total disk space</text>
              <text testID="file-system-next-total-space" class="auth-value-text">
                {megabytes(Paths.totalDiskSpace)}
              </text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Available disk space</text>
              <text testID="file-system-next-available-space" class="auth-value-text">
                {megabytes(Paths.availableDiskSpace)}
              </text>
            </view>
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'FileSystemScreen' },
);
