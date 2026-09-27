import { useCallback, useRef, useState } from 'react';
import { Platform } from '@symbiote-native/react';
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
import type { IFileSystemDownloadProgressData } from '@symbiote-native/file-system/legacy';
import { Directory, File, Paths } from '@symbiote-native/file-system/react';
import type { IFileSystemDownloadProgress } from '@symbiote-native/file-system/react';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DOWNLOAD_URL = 'https://picsum.photos/200/300';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IAsyncResult<TValue> =
  | { status: 'success'; value: TValue }
  | { status: 'error'; message: string };

function ResultBlock({ testID, result }: { testID: string; result: IAsyncResult<string> | null }) {
  if (!result) {
    return null;
  }
  return (
    <view
      testID={testID}
      className={`auth-result auth-result-${result.status === 'success' ? 'success' : 'error'}`}
    >
      <text className="auth-result-text">
        {result.status === 'success' ? result.value : `Failed: ${result.message}`}
      </text>
    </view>
  );
}

function safeNumber(read: () => number): number | null {
  try {
    return read();
  } catch {
    return null;
  }
}

/**
 * @symbiote-native/file-system canary demo, in two sections: the legacy function-based API
 * (`/legacy` — read/write/copy/move/delete, directory listing, disk-space queries, a resumable
 * download, and Android's Storage Access Framework) and the modern JSI File/Directory/Paths API
 * (`/react` — the package's default surface). Both sections write into the app's own document/
 * cache directory only.
 */
export function FileSystemScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.FileSystem];
  const lineColor = LINE_COLOR[lineInfo.line];

  const demoFilePath = `${documentDirectory ?? ''}demo.txt`;

  // --- legacy: write / read ---
  const [writeResult, setWriteResult] = useState<IAsyncResult<string> | null>(null);
  const [readResult, setReadResult] = useState<IAsyncResult<string> | null>(null);

  const handleWrite = useCallback(() => {
    writeAsStringAsync(demoFilePath, 'hello from the legacy API')
      .then(() => setWriteResult({ status: 'success', value: 'Wrote demo.txt' }))
      .catch(error => setWriteResult({ status: 'error', message: errorMessage(error) }));
  }, [demoFilePath]);

  const handleRead = useCallback(() => {
    readAsStringAsync(demoFilePath)
      .then(text => setReadResult({ status: 'success', value: text }))
      .catch(error => setReadResult({ status: 'error', message: errorMessage(error) }));
  }, [demoFilePath]);

  // --- legacy: info / directory listing ---
  const [infoResult, setInfoResult] = useState<IAsyncResult<string> | null>(null);
  const [directoryResult, setDirectoryResult] = useState<IAsyncResult<string> | null>(null);

  const handleGetInfo = useCallback(() => {
    getInfoAsync(demoFilePath)
      .then(info =>
        setInfoResult({
          status: 'success',
          value: info.exists ? `exists · ${info.size} bytes` : 'does not exist',
        }),
      )
      .catch(error => setInfoResult({ status: 'error', message: errorMessage(error) }));
  }, [demoFilePath]);

  const handleReadDirectory = useCallback(() => {
    readDirectoryAsync(documentDirectory ?? '')
      .then(entries => setDirectoryResult({ status: 'success', value: `${entries.length} entries` }))
      .catch(error => setDirectoryResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  // --- legacy: copy / move / delete ---
  const [copyResult, setCopyResult] = useState<IAsyncResult<string> | null>(null);
  const [moveResult, setMoveResult] = useState<IAsyncResult<string> | null>(null);
  const [deleteResult, setDeleteResult] = useState<IAsyncResult<string> | null>(null);

  const handleCopy = useCallback(() => {
    copyAsync({ from: demoFilePath, to: `${documentDirectory ?? ''}demo-copy.txt` })
      .then(() => setCopyResult({ status: 'success', value: 'Copied to demo-copy.txt' }))
      .catch(error => setCopyResult({ status: 'error', message: errorMessage(error) }));
  }, [demoFilePath]);

  const handleMove = useCallback(() => {
    moveAsync({ from: demoFilePath, to: `${documentDirectory ?? ''}demo-moved.txt` })
      .then(() => setMoveResult({ status: 'success', value: 'Moved to demo-moved.txt' }))
      .catch(error => setMoveResult({ status: 'error', message: errorMessage(error) }));
  }, [demoFilePath]);

  const handleDelete = useCallback(() => {
    deleteAsync(demoFilePath, { idempotent: true })
      .then(() => setDeleteResult({ status: 'success', value: 'Deleted demo.txt' }))
      .catch(error => setDeleteResult({ status: 'error', message: errorMessage(error) }));
  }, [demoFilePath]);

  // --- legacy: disk space ---
  const [freeSpace, setFreeSpace] = useState<number | null>(null);
  const [totalSpace, setTotalSpace] = useState<number | null>(null);
  const [diskSpaceError, setDiskSpaceError] = useState<string | null>(null);

  const handleRefreshDiskSpace = useCallback(() => {
    Promise.all([getFreeDiskStorageAsync(), getTotalDiskCapacityAsync()])
      .then(([free, total]) => {
        setFreeSpace(free);
        setTotalSpace(total);
        setDiskSpaceError(null);
      })
      .catch(error => setDiskSpaceError(errorMessage(error)));
  }, []);

  // --- legacy: resumable download ---
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadResult, setDownloadResult] = useState<IAsyncResult<string> | null>(null);
  const downloadResumableRef = useRef<ReturnType<typeof createDownloadResumable> | null>(null);
  if (!downloadResumableRef.current) {
    downloadResumableRef.current = createDownloadResumable(
      DOWNLOAD_URL,
      `${cacheDirectory ?? ''}downloaded.jpg`,
      undefined,
      (data: IFileSystemDownloadProgressData) => {
        setDownloadProgress(
          data.totalBytesExpectedToWrite > 0
            ? Math.round((data.totalBytesWritten / data.totalBytesExpectedToWrite) * 100)
            : 0,
        );
      },
    );
  }

  const handleStartDownload = useCallback(() => {
    downloadResumableRef.current
      ?.downloadAsync()
      .then(result => setDownloadResult({ status: 'success', value: result?.uri ?? 'no result' }))
      .catch(error => setDownloadResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  // --- legacy: Storage Access Framework (Android only) ---
  const [safResult, setSafResult] = useState<IAsyncResult<string> | null>(null);

  const handleRequestSafPermission = useCallback(() => {
    StorageAccessFramework.requestDirectoryPermissionsAsync()
      .then(result =>
        setSafResult({ status: 'success', value: result.granted ? result.directoryUri : 'denied' }),
      )
      .catch(error => setSafResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  // --- modern: write / read ---
  const notesFile = new File(Paths.document, 'notes.txt');
  const [writeNextResult, setWriteNextResult] = useState<IAsyncResult<string> | null>(null);
  const [readNextResult, setReadNextResult] = useState<IAsyncResult<string> | null>(null);

  const handleWriteNext = useCallback(() => {
    try {
      notesFile.write('hello from the modern API');
      setWriteNextResult({ status: 'success', value: 'Wrote notes.txt' });
    } catch (error) {
      setWriteNextResult({ status: 'error', message: errorMessage(error) });
    }
  }, [notesFile]);

  const handleReadNext = useCallback(() => {
    notesFile
      .text()
      .then(text => setReadNextResult({ status: 'success', value: text }))
      .catch(error => setReadNextResult({ status: 'error', message: errorMessage(error) }));
  }, [notesFile]);

  // --- modern: info ---
  const [infoNextResult, setInfoNextResult] = useState<IAsyncResult<string> | null>(null);

  const handleRefreshInfoNext = useCallback(() => {
    try {
      setInfoNextResult({
        status: 'success',
        value: `exists: ${notesFile.exists} · size: ${notesFile.size} · md5: ${notesFile.md5 ?? '—'}`,
      });
    } catch (error) {
      setInfoNextResult({ status: 'error', message: errorMessage(error) });
    }
  }, [notesFile]);

  // --- modern: directory ---
  const demoDirectory = new Directory(Paths.document, 'demo-dir');
  const [createDirResult, setCreateDirResult] = useState<IAsyncResult<string> | null>(null);
  const [listDirResult, setListDirResult] = useState<IAsyncResult<string> | null>(null);

  const handleCreateDirectory = useCallback(() => {
    try {
      demoDirectory.create();
      setCreateDirResult({ status: 'success', value: 'Created demo-dir' });
    } catch (error) {
      setCreateDirResult({ status: 'error', message: errorMessage(error) });
    }
  }, [demoDirectory]);

  const handleListDirectory = useCallback(() => {
    try {
      const entries = demoDirectory.list();
      setListDirResult({
        status: 'success',
        value: `${entries.length} entries: ${entries.map(entry => entry.name).join(', ') || '—'}`,
      });
    } catch (error) {
      setListDirResult({ status: 'error', message: errorMessage(error) });
    }
  }, [demoDirectory]);

  // --- modern: download ---
  const [downloadNextProgress, setDownloadNextProgress] = useState<number | null>(null);
  const [downloadNextResult, setDownloadNextResult] = useState<IAsyncResult<string> | null>(null);

  const handleStartDownloadNext = useCallback(() => {
    File.downloadFileAsync(DOWNLOAD_URL, Paths.cache, {
      onProgress: (data: IFileSystemDownloadProgress) => {
        setDownloadNextProgress(
          data.totalBytes > 0 ? Math.round((data.bytesWritten / data.totalBytes) * 100) : 0,
        );
      },
    })
      .then(file => setDownloadNextResult({ status: 'success', value: file.uri }))
      .catch(error => setDownloadNextResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  // --- modern: paths ---
  const totalDiskSpace = safeNumber(() => Paths.totalDiskSpace);
  const availableDiskSpace = safeNumber(() => Paths.availableDiskSpace);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="file-system-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="file-system-hero" className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">File System</text>
            <text className="hero-body">
              @symbiote-native/file-system — the legacy function-based API and the modern
              File/Directory/Paths API, side by side. Both write only into this app's own
              document/cache directory.
            </text>
          </view>
        </view>

        <view testID="file-system-directories-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Directories (legacy)</text>
          </view>
          <text className="info-text">{`documentDirectory: ${documentDirectory ?? '—'}`}</text>
          <text className="info-text">{`cacheDirectory: ${cacheDirectory ?? '—'}`}</text>
          <text className="info-text">{`bundleDirectory: ${bundleDirectory ?? '—'}`}</text>
        </view>

        <view testID="file-system-write-read-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Write / read</text>
          </view>
          <view className="button-row">
            <ActionButton testID="file-system-write" title="Write demo.txt" onPress={handleWrite} color={lineColor} />
            <ActionButton testID="file-system-read" title="Read demo.txt" onPress={handleRead} color={lineColor} />
          </view>
          <ResultBlock testID="file-system-write-result" result={writeResult} />
          <ResultBlock testID="file-system-read-result" result={readResult} />
        </view>

        <view testID="file-system-info-list-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Info / directory listing</text>
          </view>
          <view className="button-row">
            <ActionButton testID="file-system-get-info" title="Get info" onPress={handleGetInfo} color={lineColor} />
            <ActionButton
              testID="file-system-read-directory"
              title="Read directory"
              onPress={handleReadDirectory}
              color={lineColor}
            />
          </view>
          <ResultBlock testID="file-system-info-result" result={infoResult} />
          <ResultBlock testID="file-system-directory-result" result={directoryResult} />
        </view>

        <view testID="file-system-copy-move-delete-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Copy / move / delete</text>
          </view>
          <view className="button-row">
            <ActionButton testID="file-system-copy" title="Copy" onPress={handleCopy} color={lineColor} />
            <ActionButton testID="file-system-move" title="Move" onPress={handleMove} color={lineColor} />
            <ActionButton testID="file-system-delete" title="Delete" onPress={handleDelete} color={lineColor} />
          </view>
          <ResultBlock testID="file-system-copy-result" result={copyResult} />
          <ResultBlock testID="file-system-move-result" result={moveResult} />
          <ResultBlock testID="file-system-delete-result" result={deleteResult} />
        </view>

        <view testID="file-system-disk-space-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Disk space</text>
          </view>
          <ActionButton
            testID="file-system-refresh-disk-space"
            title="Refresh"
            onPress={handleRefreshDiskSpace}
            color={lineColor}
          />
          <text testID="file-system-disk-space-value" className="auth-value-text">
            {diskSpaceError
              ? `Failed: ${diskSpaceError}`
              : freeSpace === null || totalSpace === null
                ? 'Not loaded yet'
                : `${freeSpace} bytes free of ${totalSpace} bytes total`}
          </text>
        </view>

        <view testID="file-system-download-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Resumable download</text>
          </view>
          <ActionButton
            testID="file-system-start-download"
            title="Download"
            onPress={handleStartDownload}
            color={lineColor}
          />
          <text testID="file-system-download-progress" className="auth-value-text">
            {downloadProgress === null ? 'Not started' : `${downloadProgress}%`}
          </text>
          <ResultBlock testID="file-system-download-result" result={downloadResult} />
        </view>

        {Platform.OS === 'android' && (
          <view testID="file-system-saf-card" className="auth-card">
            <view className="auth-card-header">
              <text className="auth-card-title">Storage Access Framework</text>
            </view>
            <ActionButton
              testID="file-system-request-saf-permission"
              title="Request directory permission"
              onPress={handleRequestSafPermission}
              color={lineColor}
            />
            <ResultBlock testID="file-system-saf-result" result={safResult} />
          </view>
        )}

        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">File / Directory / Paths — modern API</text>
        </view>

        <view testID="file-system-next-write-read-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Write / read (modern)</text>
          </view>
          <view className="button-row">
            <ActionButton testID="file-system-next-write" title="Write notes.txt" onPress={handleWriteNext} color={lineColor} />
            <ActionButton testID="file-system-next-read" title="Read notes.txt" onPress={handleReadNext} color={lineColor} />
          </view>
          <ResultBlock testID="file-system-next-write-result" result={writeNextResult} />
          <ResultBlock testID="file-system-next-read-result" result={readNextResult} />
        </view>

        <view testID="file-system-next-info-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Info (modern)</text>
          </view>
          <ActionButton
            testID="file-system-next-refresh-info"
            title="Refresh"
            onPress={handleRefreshInfoNext}
            color={lineColor}
          />
          <ResultBlock testID="file-system-next-info-result" result={infoNextResult} />
        </view>

        <view testID="file-system-next-directory-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Directory (modern)</text>
          </view>
          <view className="button-row">
            <ActionButton
              testID="file-system-next-create-directory"
              title="Create demo-dir"
              onPress={handleCreateDirectory}
              color={lineColor}
            />
            <ActionButton
              testID="file-system-next-list-directory"
              title="List demo-dir"
              onPress={handleListDirectory}
              color={lineColor}
            />
          </view>
          <ResultBlock testID="file-system-next-create-directory-result" result={createDirResult} />
          <ResultBlock testID="file-system-next-list-directory-result" result={listDirResult} />
        </view>

        <view testID="file-system-next-download-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Download (modern)</text>
          </view>
          <ActionButton
            testID="file-system-next-start-download"
            title="Download"
            onPress={handleStartDownloadNext}
            color={lineColor}
          />
          <text testID="file-system-next-download-progress" className="auth-value-text">
            {downloadNextProgress === null ? 'Not started' : `${downloadNextProgress}%`}
          </text>
          <ResultBlock testID="file-system-next-download-result" result={downloadNextResult} />
        </view>

        <view testID="file-system-next-paths-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Paths (modern)</text>
          </view>
          <text testID="file-system-next-total-disk-space" className="auth-value-text">
            {`totalDiskSpace: ${totalDiskSpace === null ? '—' : `${totalDiskSpace} bytes`}`}
          </text>
          <text testID="file-system-next-available-disk-space" className="auth-value-text">
            {`availableDiskSpace: ${availableDiskSpace === null ? '—' : `${availableDiskSpace} bytes`}`}
          </text>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
