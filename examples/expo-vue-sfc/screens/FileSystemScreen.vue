<!--
  @symbiote-native/file-system tour stop — both of the package's surfaces side by side: the
  legacy function-based API (./legacy — write/read, info, directory listing, copy/move/delete,
  disk space, resumable download, Android Storage Access Framework) and the modern JSI
  File/Directory/Paths API (./vue — the same operations as methods on a shared-object handle).
  First port of this screen across the example suite — no React/Svelte/Solid/Angular twin to
  mirror yet.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
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
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.FileSystem];
const lineColor = LINE_COLOR[lineInfo.line];

// Legacy — demo file URIs, chained: write demo.txt -> copy to demo-copy.txt ->
// move the copy to demo-moved.txt -> delete demo-moved.txt.
const demoFileUri = `${documentDirectory}demo.txt`;
const demoCopyUri = `${documentDirectory}demo-copy.txt`;
const demoMovedUri = `${documentDirectory}demo-moved.txt`;

// Legacy — write / read
const writeStatusText = ref('not written yet');
const readText = ref('No content read yet.');
const writeReadError = ref<string | null>(null);

function handleWrite(): void {
  writeReadError.value = null;
  void writeAsStringAsync(demoFileUri, 'hello from the legacy API')
    .then(() => {
      writeStatusText.value = 'wrote demo.txt';
    })
    .catch((error: Error) => {
      writeReadError.value = `write failed: ${error.message}`;
    });
}

function handleRead(): void {
  writeReadError.value = null;
  void readAsStringAsync(demoFileUri)
    .then(text => {
      readText.value = text;
    })
    .catch((error: Error) => {
      writeReadError.value = `read failed: ${error.message}`;
    });
}

// Legacy — info + directory listing
const fileInfoText = ref('No info loaded yet.');
const dirEntryCountText = ref('No directory listing loaded yet.');
const infoError = ref<string | null>(null);

function handleLoadInfo(): void {
  infoError.value = null;
  void getInfoAsync(demoFileUri)
    .then(info => {
      fileInfoText.value = info.exists
        ? `exists: true · size: ${info.size}`
        : 'exists: false';
    })
    .catch((error: Error) => {
      infoError.value = `get info failed: ${error.message}`;
    });
}

function handleLoadDirectory(): void {
  infoError.value = null;
  const dir = documentDirectory;
  if (!dir) {
    infoError.value = 'documentDirectory unavailable.';
    return;
  }
  void readDirectoryAsync(dir)
    .then(entries => {
      dirEntryCountText.value = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
    })
    .catch((error: Error) => {
      infoError.value = `read directory failed: ${error.message}`;
    });
}

// Legacy — copy / move / delete
const copyMoveDeleteStatusText = ref('not run yet');
const copyMoveDeleteError = ref<string | null>(null);

function handleCopy(): void {
  copyMoveDeleteError.value = null;
  void copyAsync({ from: demoFileUri, to: demoCopyUri })
    .then(() => {
      copyMoveDeleteStatusText.value = 'copied to demo-copy.txt';
    })
    .catch((error: Error) => {
      copyMoveDeleteError.value = `copy failed: ${error.message}`;
    });
}

function handleMove(): void {
  copyMoveDeleteError.value = null;
  void moveAsync({ from: demoCopyUri, to: demoMovedUri })
    .then(() => {
      copyMoveDeleteStatusText.value = 'moved to demo-moved.txt';
    })
    .catch((error: Error) => {
      copyMoveDeleteError.value = `move failed: ${error.message}`;
    });
}

function handleDelete(): void {
  copyMoveDeleteError.value = null;
  void deleteAsync(demoMovedUri, { idempotent: true })
    .then(() => {
      copyMoveDeleteStatusText.value = 'deleted demo-moved.txt';
    })
    .catch((error: Error) => {
      copyMoveDeleteError.value = `delete failed: ${error.message}`;
    });
}

// Legacy — disk space
const freeDiskSpaceText = ref('not loaded yet');
const totalDiskCapacityText = ref('not loaded yet');
const diskSpaceError = ref<string | null>(null);

function handleRefreshDiskSpace(): void {
  diskSpaceError.value = null;
  void Promise.all([getFreeDiskStorageAsync(), getTotalDiskCapacityAsync()])
    .then(([free, total]) => {
      freeDiskSpaceText.value = `${free} bytes`;
      totalDiskCapacityText.value = `${total} bytes`;
    })
    .catch((error: Error) => {
      diskSpaceError.value = `disk space query failed: ${error.message}`;
    });
}

// Legacy — resumable download
const downloadProgressText = ref('0%');
const downloadStatusText = ref('not started');
const downloadError = ref<string | null>(null);

const downloadResumable = createDownloadResumable(
  'https://picsum.photos/200/300',
  `${cacheDirectory}downloaded.jpg`,
  undefined,
  data => {
    downloadProgressText.value =
      data.totalBytesExpectedToWrite > 0
        ? `${Math.round((data.totalBytesWritten / data.totalBytesExpectedToWrite) * 100)}%`
        : '0%';
  },
);

function handleDownload(): void {
  downloadError.value = null;
  void downloadResumable
    .downloadAsync()
    .then(result => {
      downloadStatusText.value = result ? `downloaded to ${result.uri}` : 'download returned no result';
    })
    .catch((error: Error) => {
      downloadError.value = `download failed: ${error.message}`;
    });
}

// Legacy — Storage Access Framework (Android only)
const safUriText = ref('not requested yet');
const safError = ref<string | null>(null);

function handleRequestSafDirectory(): void {
  safError.value = null;
  void StorageAccessFramework.requestDirectoryPermissionsAsync()
    .then(result => {
      safUriText.value = result.granted ? result.directoryUri : 'denied';
    })
    .catch((error: Error) => {
      safError.value = `SAF request failed: ${error.message}`;
    });
}

// Modern — File / Directory handles, created once (not reactive — these are native shared-object
// handles, not values a template needs to react to changing).
const modernFile = new File(Paths.document, 'notes.txt');
const modernDirectory = new Directory(Paths.document, 'demo-dir');

// Modern — write / read
const modernWriteStatusText = ref('not written yet');
const modernReadText = ref('No content read yet.');
const modernWriteReadError = ref<string | null>(null);

function handleModernWrite(): void {
  modernWriteReadError.value = null;
  try {
    modernFile.write('hello from the modern API');
    modernWriteStatusText.value = 'wrote notes.txt';
  } catch (error) {
    modernWriteReadError.value = `write failed: ${errorMessage(error)}`;
  }
}

function handleModernRead(): void {
  modernWriteReadError.value = null;
  void modernFile
    .text()
    .then(text => {
      modernReadText.value = text;
    })
    .catch((error: Error) => {
      modernWriteReadError.value = `read failed: ${error.message}`;
    });
}

// Modern — info
const modernInfoText = ref('No info loaded yet.');
const modernInfoError = ref<string | null>(null);

function handleRefreshModernInfo(): void {
  modernInfoError.value = null;
  try {
    modernInfoText.value = modernFile.exists
      ? `exists: true · size: ${modernFile.size} · md5: ${modernFile.md5 ?? 'n/a'}`
      : 'exists: false';
  } catch (error) {
    modernInfoError.value = `info read failed: ${errorMessage(error)}`;
  }
}

// Modern — directory
const modernDirectoryStatusText = ref('not created yet');
const modernDirectoryEntriesText = ref('No entries listed yet.');
const modernDirectoryError = ref<string | null>(null);

function handleCreateModernDirectory(): void {
  modernDirectoryError.value = null;
  try {
    modernDirectory.create({ intermediates: true, idempotent: true });
    modernDirectoryStatusText.value = 'created demo-dir';
  } catch (error) {
    modernDirectoryError.value = `create failed: ${errorMessage(error)}`;
  }
}

function handleListModernDirectory(): void {
  modernDirectoryError.value = null;
  try {
    const entries = modernDirectory.list();
    modernDirectoryEntriesText.value =
      entries.length === 0
        ? 'No entries.'
        : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}: ${entries.map(entry => entry.name).join(', ')}`;
  } catch (error) {
    modernDirectoryError.value = `list failed: ${errorMessage(error)}`;
  }
}

// Modern — download
const modernDownloadProgressText = ref('0%');
const modernDownloadStatusText = ref('not started');
const modernDownloadError = ref<string | null>(null);

function handleModernDownload(): void {
  modernDownloadError.value = null;
  void File.downloadFileAsync('https://picsum.photos/200/300', Paths.cache, {
    onProgress: data => {
      modernDownloadProgressText.value =
        data.totalBytes > 0 ? `${Math.round((data.bytesWritten / data.totalBytes) * 100)}%` : '0%';
    },
  })
    .then(file => {
      modernDownloadStatusText.value = `downloaded to ${file.uri}`;
    })
    .catch((error: Error) => {
      modernDownloadError.value = `download failed: ${error.message}`;
    });
}

// Modern — Paths, synchronous getters, no button needed.
const totalDiskSpaceText = computed(() => `${Paths.totalDiskSpace} bytes`);
const availableDiskSpaceText = computed(() => `${Paths.availableDiskSpace} bytes`);
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="file-system-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">File System</text>
          <text testID="file-system-hero" class="hero-body"
            >@symbiote-native/file-system — both surfaces side by side: the legacy
            function-based API and the modern File/Directory/Paths API.</text
          >
        </view>
      </view>

      <view testID="file-system-directories-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Directories (legacy)</text>
        </view>
        <text testID="file-system-document-directory" class="auth-value-text">{{
          `document: ${documentDirectory ?? 'n/a'}`
        }}</text>
        <text testID="file-system-cache-directory" class="auth-value-text">{{
          `cache: ${cacheDirectory ?? 'n/a'}`
        }}</text>
        <text testID="file-system-bundle-directory" class="auth-value-text">{{
          `bundle: ${bundleDirectory ?? 'n/a'}`
        }}</text>
      </view>

      <view testID="file-system-write-read-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Write / read (legacy)</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="file-system-write"
            title="Write demo.txt"
            :onPress="handleWrite"
            :color="lineColor"
          />
          <ActionButton
            testID="file-system-read"
            title="Read demo.txt"
            :onPress="handleRead"
            :color="lineColor"
          />
        </view>
        <text testID="file-system-write-status" class="auth-value-text">{{
          writeStatusText
        }}</text>
        <text testID="file-system-read-text" class="info-text">{{
          readText
        }}</text>
        <view v-if="writeReadError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ writeReadError }}</text>
        </view>
      </view>

      <view testID="file-system-info-list-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Info + directory listing (legacy)</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="file-system-load-info"
            title="Get info"
            :onPress="handleLoadInfo"
            :color="lineColor"
          />
          <ActionButton
            testID="file-system-load-directory"
            title="List document dir"
            :onPress="handleLoadDirectory"
            :color="lineColor"
          />
        </view>
        <text testID="file-system-info-text" class="auth-value-text">{{
          fileInfoText
        }}</text>
        <text testID="file-system-dir-entry-count" class="auth-value-text">{{
          dirEntryCountText
        }}</text>
        <view v-if="infoError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ infoError }}</text>
        </view>
      </view>

      <view testID="file-system-copy-move-delete-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Copy / move / delete (legacy)</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="file-system-copy"
            title="Copy"
            :onPress="handleCopy"
            :color="lineColor"
          />
          <ActionButton
            testID="file-system-move"
            title="Move"
            :onPress="handleMove"
            :color="lineColor"
          />
          <ActionButton
            testID="file-system-delete"
            title="Delete"
            :onPress="handleDelete"
            :color="lineColor"
          />
        </view>
        <text testID="file-system-copy-move-delete-status" class="auth-value-text">{{
          copyMoveDeleteStatusText
        }}</text>
        <view v-if="copyMoveDeleteError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ copyMoveDeleteError }}</text>
        </view>
      </view>

      <view testID="file-system-disk-space-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Disk space (legacy)</text>
        </view>
        <ActionButton
          testID="file-system-refresh-disk-space"
          title="Refresh"
          :onPress="handleRefreshDiskSpace"
          :color="lineColor"
        />
        <text testID="file-system-free-disk-space" class="auth-value-text">{{
          `free: ${freeDiskSpaceText}`
        }}</text>
        <text testID="file-system-total-disk-capacity" class="auth-value-text">{{
          `total: ${totalDiskCapacityText}`
        }}</text>
        <view v-if="diskSpaceError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ diskSpaceError }}</text>
        </view>
      </view>

      <view testID="file-system-download-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Resumable download (legacy)</text>
        </view>
        <ActionButton
          testID="file-system-download-start"
          title="Download"
          :onPress="handleDownload"
          :color="lineColor"
        />
        <text testID="file-system-download-progress" class="auth-value-text">{{
          downloadProgressText
        }}</text>
        <text testID="file-system-download-status" class="info-text">{{
          downloadStatusText
        }}</text>
        <view v-if="downloadError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ downloadError }}</text>
        </view>
      </view>

      <view v-if="Platform.OS === 'android'" testID="file-system-saf-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Storage Access Framework (Android only)</text>
        </view>
        <ActionButton
          testID="file-system-saf-request"
          title="Request directory"
          :onPress="handleRequestSafDirectory"
          :color="lineColor"
        />
        <text testID="file-system-saf-uri" class="auth-value-text">{{
          safUriText
        }}</text>
        <view v-if="safError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ safError }}</text>
        </view>
      </view>

      <view testID="file-system-next-write-read-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Write / read (modern)</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="file-system-next-write"
            title="Write notes.txt"
            :onPress="handleModernWrite"
            :color="lineColor"
          />
          <ActionButton
            testID="file-system-next-read"
            title="Read notes.txt"
            :onPress="handleModernRead"
            :color="lineColor"
          />
        </view>
        <text testID="file-system-next-write-status" class="auth-value-text">{{
          modernWriteStatusText
        }}</text>
        <text testID="file-system-next-read-text" class="info-text">{{
          modernReadText
        }}</text>
        <view v-if="modernWriteReadError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ modernWriteReadError }}</text>
        </view>
      </view>

      <view testID="file-system-next-info-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Info (modern)</text>
        </view>
        <ActionButton
          testID="file-system-next-refresh-info"
          title="Refresh"
          :onPress="handleRefreshModernInfo"
          :color="lineColor"
        />
        <text testID="file-system-next-info-text" class="auth-value-text">{{
          modernInfoText
        }}</text>
        <view v-if="modernInfoError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ modernInfoError }}</text>
        </view>
      </view>

      <view testID="file-system-next-directory-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Directory (modern)</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="file-system-next-create-directory"
            title="Create demo-dir"
            :onPress="handleCreateModernDirectory"
            :color="lineColor"
          />
          <ActionButton
            testID="file-system-next-list-directory"
            title="List demo-dir"
            :onPress="handleListModernDirectory"
            :color="lineColor"
          />
        </view>
        <text testID="file-system-next-directory-status" class="auth-value-text">{{
          modernDirectoryStatusText
        }}</text>
        <text testID="file-system-next-directory-entries" class="info-text">{{
          modernDirectoryEntriesText
        }}</text>
        <view v-if="modernDirectoryError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ modernDirectoryError }}</text>
        </view>
      </view>

      <view testID="file-system-next-download-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Download (modern)</text>
        </view>
        <ActionButton
          testID="file-system-next-download-start"
          title="Download"
          :onPress="handleModernDownload"
          :color="lineColor"
        />
        <text testID="file-system-next-download-progress" class="auth-value-text">{{
          modernDownloadProgressText
        }}</text>
        <text testID="file-system-next-download-status" class="info-text">{{
          modernDownloadStatusText
        }}</text>
        <view v-if="modernDownloadError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ modernDownloadError }}</text>
        </view>
      </view>

      <view testID="file-system-next-paths-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Paths (modern)</text>
        </view>
        <text testID="file-system-next-total-disk-space" class="auth-value-text">{{
          `total: ${totalDiskSpaceText}`
        }}</text>
        <text testID="file-system-next-available-disk-space" class="auth-value-text">{{
          `available: ${availableDiskSpaceText}`
        }}</text>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
