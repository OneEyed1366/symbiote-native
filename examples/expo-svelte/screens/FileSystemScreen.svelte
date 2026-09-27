<script lang="ts">
  // @symbiote-native/file-system tour stop — both of the package's surfaces as two sections.
  // Legacy (expo-file-system's original function API, read/write/copy/move/delete, disk space,
  // resumable download, Android SAF) plus Modern (the JSI File/Directory/Paths class API).
  // Svelte twin of examples/expo-vue-sfc/screens/FileSystemScreen.vue.
  import { Platform } from '@symbiote-native/svelte';
  import {
    bundleDirectory,
    cacheDirectory,
    copyAsync,
    createDownloadResumable,
    deleteAsync,
    documentDirectory,
    getInfoAsync,
    getFreeDiskStorageAsync,
    getTotalDiskCapacityAsync,
    moveAsync,
    readAsStringAsync,
    readDirectoryAsync,
    StorageAccessFramework,
    writeAsStringAsync,
  } from '@symbiote-native/file-system/legacy';
  import type {
    IFileSystemDownloadProgressData,
    IFileSystemFileInfo,
  } from '@symbiote-native/file-system/legacy';
  import { Directory, File, Paths } from '@symbiote-native/file-system/svelte';
  import type { IFileSystemDownloadProgress } from '@symbiote-native/file-system/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.FileSystem];
  const lineColor = LINE_COLOR[lineInfo.line];

  // Legacy — file URIs derived from the module's own directory constants.
  const demoFileUri = `${documentDirectory}demo.txt`;
  const demoCopyUri = `${documentDirectory}demo-copy.txt`;
  const demoMovedUri = `${documentDirectory}demo-moved.txt`;

  // Legacy — write / read
  let writeError = $state<string | null>(null);
  let writeDone = $state(false);
  let readError = $state<string | null>(null);
  let readResult = $state<string | null>(null);

  async function handleWrite(): Promise<void> {
    writeError = null;
    try {
      await writeAsStringAsync(demoFileUri, 'hello from the legacy API');
      writeDone = true;
    } catch (reason) {
      writeError = String(reason);
    }
  }

  async function handleRead(): Promise<void> {
    readError = null;
    try {
      readResult = await readAsStringAsync(demoFileUri);
    } catch (reason) {
      readError = String(reason);
    }
  }

  // Legacy — info / directory listing
  let fileInfo = $state<IFileSystemFileInfo | null>(null);
  let fileInfoError = $state<string | null>(null);
  let dirEntries = $state<string[]>([]);
  let dirError = $state<string | null>(null);

  async function handleGetInfo(): Promise<void> {
    fileInfoError = null;
    try {
      fileInfo = await getInfoAsync(demoFileUri);
    } catch (reason) {
      fileInfoError = String(reason);
    }
  }

  async function handleReadDirectory(): Promise<void> {
    dirError = null;
    try {
      dirEntries = await readDirectoryAsync(documentDirectory ?? '');
    } catch (reason) {
      dirError = String(reason);
    }
  }

  const fileInfoText = $derived(
    fileInfo
      ? fileInfo.exists
        ? `exists · ${fileInfo.size} bytes`
        : 'does not exist'
      : 'not checked yet',
  );

  // Legacy — copy / move / delete
  let copyError = $state<string | null>(null);
  let copyDone = $state(false);
  let moveError = $state<string | null>(null);
  let moveDone = $state(false);
  let deleteError = $state<string | null>(null);
  let deleteDone = $state(false);

  async function handleCopy(): Promise<void> {
    copyError = null;
    try {
      await copyAsync({ from: demoFileUri, to: demoCopyUri });
      copyDone = true;
    } catch (reason) {
      copyError = String(reason);
    }
  }

  async function handleMove(): Promise<void> {
    moveError = null;
    try {
      await moveAsync({ from: demoCopyUri, to: demoMovedUri });
      moveDone = true;
    } catch (reason) {
      moveError = String(reason);
    }
  }

  async function handleDelete(): Promise<void> {
    deleteError = null;
    try {
      await deleteAsync(demoMovedUri);
      deleteDone = true;
    } catch (reason) {
      deleteError = String(reason);
    }
  }

  // Legacy — disk space
  let freeDiskStorage = $state<number | null>(null);
  let totalDiskCapacity = $state<number | null>(null);
  let diskSpaceError = $state<string | null>(null);

  async function handleRefreshDiskSpace(): Promise<void> {
    diskSpaceError = null;
    try {
      freeDiskStorage = await getFreeDiskStorageAsync();
      totalDiskCapacity = await getTotalDiskCapacityAsync();
    } catch (reason) {
      diskSpaceError = String(reason);
    }
  }

  // Legacy — resumable download
  let downloadProgress = $state<number | null>(null);
  let downloadError = $state<string | null>(null);
  let downloadResult = $state<string | null>(null);

  function handleDownloadProgress(data: IFileSystemDownloadProgressData): void {
    downloadProgress = Math.round(
      (data.totalBytesWritten / data.totalBytesExpectedToWrite) * 100,
    );
  }

  const downloadResumable = createDownloadResumable(
    'https://picsum.photos/200/300',
    `${cacheDirectory}downloaded.jpg`,
    undefined,
    handleDownloadProgress,
  );

  async function handleStartDownload(): Promise<void> {
    downloadError = null;
    downloadProgress = 0;
    try {
      const result = await downloadResumable.downloadAsync();
      downloadResult = result?.uri ?? null;
    } catch (reason) {
      downloadError = String(reason);
    }
  }

  const downloadProgressText = $derived(
    downloadProgress === null ? 'not started' : `${downloadProgress}%`,
  );

  // Legacy — Android Storage Access Framework
  let safUri = $state<string | null>(null);
  let safDenied = $state(false);
  let safError = $state<string | null>(null);

  async function handleRequestSafPermission(): Promise<void> {
    safError = null;
    safDenied = false;
    try {
      const response =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (response.granted) {
        safUri = response.directoryUri;
      } else {
        safUri = null;
        safDenied = true;
      }
    } catch (reason) {
      safError = String(reason);
    }
  }

  // Modern — write / read
  const notesFile = new File(Paths.document, 'notes.txt');
  let nextWriteError = $state<string | null>(null);
  let nextWriteDone = $state(false);
  let nextReadError = $state<string | null>(null);
  let nextReadResult = $state<string | null>(null);

  function handleNextWrite(): void {
    nextWriteError = null;
    try {
      notesFile.write('hello from the modern API');
      nextWriteDone = true;
    } catch (reason) {
      nextWriteError = String(reason);
    }
  }

  async function handleNextRead(): Promise<void> {
    nextReadError = null;
    try {
      nextReadResult = await notesFile.text();
    } catch (reason) {
      nextReadError = String(reason);
    }
  }

  // Modern — info
  let nextInfoError = $state<string | null>(null);
  let nextExists = $state<boolean | null>(null);
  let nextSize = $state<number | null>(null);
  let nextMd5 = $state<string | null>(null);

  function handleRefreshNextInfo(): void {
    nextInfoError = null;
    try {
      nextExists = notesFile.exists;
      nextSize = notesFile.size;
      nextMd5 = notesFile.md5;
    } catch (reason) {
      nextInfoError = String(reason);
    }
  }

  const nextInfoText = $derived(
    nextExists === null
      ? 'not checked yet'
      : `exists: ${nextExists} · size: ${nextSize ?? '—'} · md5: ${nextMd5 ?? '—'}`,
  );

  // Modern — directory
  const demoDirectory = new Directory(Paths.document, 'demo-dir');
  let nextDirError = $state<string | null>(null);
  let nextDirCreated = $state(false);
  let nextDirEntries = $state<string[]>([]);

  function handleCreateNextDirectory(): void {
    nextDirError = null;
    try {
      demoDirectory.create();
      nextDirCreated = true;
    } catch (reason) {
      nextDirError = String(reason);
    }
  }

  function handleListNextDirectory(): void {
    nextDirError = null;
    try {
      nextDirEntries = demoDirectory.list().map(entry => entry.name);
    } catch (reason) {
      nextDirError = String(reason);
    }
  }

  const nextDirEntriesText = $derived(
    `${nextDirEntries.length} entries${
      nextDirEntries.length ? `: ${nextDirEntries.join(', ')}` : ''
    }`,
  );

  // Modern — download
  let nextDownloadProgress = $state<number | null>(null);
  let nextDownloadError = $state<string | null>(null);
  let nextDownloadResult = $state<string | null>(null);

  function handleNextDownloadProgress(
    data: IFileSystemDownloadProgress,
  ): void {
    nextDownloadProgress = Math.round(
      (data.bytesWritten / data.totalBytes) * 100,
    );
  }

  async function handleStartNextDownload(): Promise<void> {
    nextDownloadError = null;
    nextDownloadProgress = 0;
    try {
      const file = await File.downloadFileAsync(
        'https://picsum.photos/200/300',
        Paths.cache,
        { onProgress: handleNextDownloadProgress },
      );
      nextDownloadResult = file.uri;
    } catch (reason) {
      nextDownloadError = String(reason);
    }
  }

  const nextDownloadProgressText = $derived(
    nextDownloadProgress === null ? 'not started' : `${nextDownloadProgress}%`,
  );

  // Modern — Paths' synchronous disk-space getters. Guarded: these read straight through to the
  // native shared object, which can throw before the module is linked.
  const totalDiskSpaceText = $derived.by(() => {
    try {
      return `${Paths.totalDiskSpace} bytes`;
    } catch (reason) {
      return String(reason);
    }
  });
  const availableDiskSpaceText = $derived.by(() => {
    try {
      return `${Paths.availableDiskSpace} bytes`;
    } catch (reason) {
      return String(reason);
    }
  });
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="file-system-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">File System</text>
        <text testID="file-system-hero" class="hero-body">
          @symbiote-native/file-system — both surfaces side by side: the
          legacy expo-file-system function API and the modern File/Directory/Paths
          class API.
        </text>
      </view>
    </view>

    <text class="hero-title">Legacy</text>

    <view testID="file-system-directories-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Directories</text>
      </view>
      <text class="info-text">{`document: ${documentDirectory}`}</text>
      <text class="info-text">{`cache: ${cacheDirectory}`}</text>
      <text class="info-text">{`bundle: ${bundleDirectory}`}</text>
    </view>

    <view testID="file-system-write-read-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Write / read</text>
      </view>
      <view class="button-row">
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
      </view>{#if writeError}<text class="auth-result-text"
          >{writeError}</text
        >{:else if writeDone}<text class="auth-value-text">written</text
        >{/if}{#if readError}<text class="auth-result-text"
          >{readError}</text
        >{:else}<text testID="file-system-read-result" class="info-text"
          >{readResult ?? 'not read yet'}</text
        >{/if}
    </view>

    <view testID="file-system-info-list-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Info / directory listing</text>
      </view>
      <view class="button-row">
        <ActionButton
          testID="file-system-get-info"
          title="Get demo.txt info"
          onPress={handleGetInfo}
          color={lineColor}
        />
        <ActionButton
          testID="file-system-read-directory"
          title="Read directory"
          onPress={handleReadDirectory}
          color={lineColor}
        />
      </view>{#if fileInfoError}<text class="auth-result-text"
          >{fileInfoError}</text
        >{:else}<text testID="file-system-info-text" class="auth-value-text"
          >{fileInfoText}</text
        >{/if}{#if dirError}<text class="auth-result-text">{dirError}</text
        >{:else}<text testID="file-system-directory-count" class="info-text"
          >{`${dirEntries.length} entries`}</text
        >{/if}
    </view>

    <view testID="file-system-copy-move-delete-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Copy / move / delete</text>
      </view>
      <view class="button-row">
        <ActionButton
          testID="file-system-copy"
          title="Copy"
          onPress={handleCopy}
          color={lineColor}
        />
        <ActionButton
          testID="file-system-move"
          title="Move"
          onPress={handleMove}
          color={lineColor}
        />
        <ActionButton
          testID="file-system-delete"
          title="Delete"
          onPress={handleDelete}
          color={lineColor}
        />
      </view>{#if copyError}<text class="auth-result-text"
          >{copyError}</text
        >{:else if copyDone}<text class="auth-value-text">copied</text
        >{/if}{#if moveError}<text class="auth-result-text"
          >{moveError}</text
        >{:else if moveDone}<text class="auth-value-text">moved</text
        >{/if}{#if deleteError}<text class="auth-result-text"
          >{deleteError}</text
        >{:else if deleteDone}<text class="auth-value-text">deleted</text
        >{/if}
    </view>

    <view testID="file-system-disk-space-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Disk space</text>
      </view>
      <ActionButton
        testID="file-system-refresh-disk-space"
        title="Refresh"
        onPress={handleRefreshDiskSpace}
        color={lineColor}
      />{#if diskSpaceError}<text class="auth-result-text"
          >{diskSpaceError}</text
        >{:else}<text testID="file-system-disk-space" class="auth-value-text"
          >{`free: ${freeDiskStorage ?? '—'} · total: ${totalDiskCapacity ?? '—'}`}</text
        >{/if}
    </view>

    <view testID="file-system-download-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Resumable download</text>
      </view>
      <ActionButton
        testID="file-system-start-download"
        title="Download picsum.photos/200/300"
        onPress={handleStartDownload}
        color={lineColor}
      />
      <text testID="file-system-download-progress" class="auth-value-text">
        {downloadProgressText}
      </text>{#if downloadError}<text class="auth-result-text"
          >{downloadError}</text
        >{:else if downloadResult}<text class="info-text"
          >{downloadResult}</text
        >{/if}
    </view>

    {#if Platform.OS === 'android'}<view
        testID="file-system-saf-card"
        class="auth-card"
      >
        <view class="auth-card-header">
          <text class="auth-card-title">Storage Access Framework</text>
        </view>
        <ActionButton
          testID="file-system-saf-request"
          title="Request directory permission"
          onPress={handleRequestSafPermission}
          color={lineColor}
        />{#if safError}<text class="auth-result-text">{safError}</text
          >{:else}<text testID="file-system-saf-uri" class="info-text"
            >{safDenied ? 'denied' : (safUri ?? 'not requested yet')}</text
          >{/if}
      </view>{/if}

    <text class="hero-title">Modern</text>

    <view testID="file-system-next-write-read-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Write / read</text>
      </view>
      <view class="button-row">
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
      </view>{#if nextWriteError}<text class="auth-result-text"
          >{nextWriteError}</text
        >{:else if nextWriteDone}<text class="auth-value-text">written</text
        >{/if}{#if nextReadError}<text class="auth-result-text"
          >{nextReadError}</text
        >{:else}<text testID="file-system-next-read-result" class="info-text"
          >{nextReadResult ?? 'not read yet'}</text
        >{/if}
    </view>

    <view testID="file-system-next-info-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Info</text>
      </view>
      <ActionButton
        testID="file-system-next-refresh-info"
        title="Refresh"
        onPress={handleRefreshNextInfo}
        color={lineColor}
      />{#if nextInfoError}<text class="auth-result-text"
          >{nextInfoError}</text
        >{:else}<text testID="file-system-next-info-text" class="auth-value-text"
          >{nextInfoText}</text
        >{/if}
    </view>

    <view testID="file-system-next-directory-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Directory</text>
      </view>
      <view class="button-row">
        <ActionButton
          testID="file-system-next-create-directory"
          title="Create demo-dir"
          onPress={handleCreateNextDirectory}
          color={lineColor}
        />
        <ActionButton
          testID="file-system-next-list-directory"
          title="List demo-dir"
          onPress={handleListNextDirectory}
          color={lineColor}
        />
      </view>{#if nextDirError}<text class="auth-result-text"
          >{nextDirError}</text
        >{:else}{#if nextDirCreated}<text class="auth-value-text"
            >created</text
          >{/if}<text testID="file-system-next-directory-list" class="info-text"
          >{nextDirEntriesText}</text
        >{/if}
    </view>

    <view testID="file-system-next-download-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Download</text>
      </view>
      <ActionButton
        testID="file-system-next-start-download"
        title="Download picsum.photos/200/300"
        onPress={handleStartNextDownload}
        color={lineColor}
      />
      <text
        testID="file-system-next-download-progress"
        class="auth-value-text"
      >
        {nextDownloadProgressText}
      </text>{#if nextDownloadError}<text class="auth-result-text"
          >{nextDownloadError}</text
        >{:else if nextDownloadResult}<text class="info-text"
          >{nextDownloadResult}</text
        >{/if}
    </view>

    <view testID="file-system-next-paths-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Paths</text>
      </view>
      <text testID="file-system-next-total-disk-space" class="auth-value-text">
        {`total: ${totalDiskSpaceText}`}
      </text>
      <text
        testID="file-system-next-available-disk-space"
        class="auth-value-text"
      >
        {`available: ${availableDiskSpaceText}`}
      </text>
    </view>
  </scroll-view>
</safe-area-view>
