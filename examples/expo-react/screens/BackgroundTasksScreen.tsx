import { useCallback, useEffect, useState } from 'react';
import {
  BackgroundFetchStatus,
  getStatusAsync as getFetchStatusAsync,
  registerTaskAsync as registerFetchTaskAsync,
  setMinimumIntervalAsync,
  unregisterTaskAsync as unregisterFetchTaskAsync,
} from '@symbiote-native/background-fetch';
import {
  BackgroundTaskStatus,
  getStatusAsync as getBackgroundTaskStatusAsync,
  registerTaskAsync as registerBackgroundTaskAsync,
  triggerTaskWorkerForTestingAsync,
  unregisterTaskAsync as unregisterBackgroundTaskAsync,
} from '@symbiote-native/background-task';
import {
  defineTask,
  getRegisteredTasksAsync,
  isTaskRegisteredAsync,
  unregisterTaskAsync as unregisterManagedTaskAsync,
} from '@symbiote-native/task-manager';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_TASK_NAME = 'symbiote-canary-background-sync';
const FETCH_MINIMUM_INTERVAL_SECONDS = 900;
const TASK_MINIMUM_INTERVAL_MINUTES = 15;

// defineTask() must run at module top level — the app can be launched headlessly to run this
// task, so it can't depend on BackgroundTasksScreen ever having mounted.
defineTask(DEMO_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('symbiote-canary-background-sync failed:', error);
    return;
  }
  console.log('symbiote-canary-background-sync received:', data);
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IAsyncResult<TValue> =
  { status: 'success'; value: TValue } | { status: 'error'; message: string };

function ResultBlock({
  testID,
  result,
}: {
  testID: string;
  result: IAsyncResult<string> | null;
}) {
  if (!result) {
    return null;
  }
  return (
    <view
      testID={testID}
      className={`auth-result auth-result-${result.status === 'success' ? 'success' : 'error'}`}
    >
      <text className="auth-result-text">
        {result.status === 'success'
          ? result.value
          : `Failed: ${result.message}`}
      </text>
    </view>
  );
}

function fetchStatusLabel(status: BackgroundFetchStatus | null): string {
  switch (status) {
    case BackgroundFetchStatus.Available:
      return 'Available';
    case BackgroundFetchStatus.Denied:
      return 'Denied';
    case BackgroundFetchStatus.Restricted:
      return 'Restricted';
    default:
      return 'Unknown';
  }
}

function taskStatusLabel(status: BackgroundTaskStatus | null): string {
  switch (status) {
    case BackgroundTaskStatus.Available:
      return 'Available';
    case BackgroundTaskStatus.Restricted:
      return 'Restricted (e.g. iOS Simulator)';
    default:
      return 'Unknown';
  }
}

/**
 * @symbiote-native/task-manager + background-fetch + background-task canary demo, in three
 * sections against one shared demo task: task-manager's own registration introspection, the
 * deprecated-but-still-shipped periodic background-fetch API, and its modern BGTaskScheduler/
 * WorkManager-backed replacement. defineTask() runs at module scope, per task-manager's own
 * README — the app can be launched headlessly to run a background task with no views mounted.
 */
export function BackgroundTasksScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.BackgroundTasks];
  const lineColor = LINE_COLOR[lineInfo.line];

  // --- Task Manager ---
  const [managerResult, setManagerResult] =
    useState<IAsyncResult<string> | null>(null);

  const handleCheckRegistered = useCallback(() => {
    isTaskRegisteredAsync(DEMO_TASK_NAME)
      .then(registered =>
        setManagerResult({
          status: 'success',
          value: registered ? 'Registered' : 'Not registered',
        }),
      )
      .catch(error =>
        setManagerResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleListRegistered = useCallback(() => {
    getRegisteredTasksAsync()
      .then(tasks =>
        setManagerResult({
          status: 'success',
          value: `${tasks.length} task(s): ${tasks.map(task => task.taskName).join(', ') || '—'}`,
        }),
      )
      .catch(error =>
        setManagerResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleUnregisterManaged = useCallback(() => {
    unregisterManagedTaskAsync(DEMO_TASK_NAME)
      .then(() =>
        setManagerResult({ status: 'success', value: 'Unregistered' }),
      )
      .catch(error =>
        setManagerResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  // --- Background Fetch ---
  const [fetchStatus, setFetchStatus] = useState<BackgroundFetchStatus | null>(
    null,
  );
  const [fetchResult, setFetchResult] = useState<IAsyncResult<string> | null>(
    null,
  );

  const handleRefreshFetchStatus = useCallback(() => {
    getFetchStatusAsync()
      .then(setFetchStatus)
      .catch(() => setFetchStatus(null));
  }, []);

  const handleRegisterFetch = useCallback(() => {
    registerFetchTaskAsync(DEMO_TASK_NAME, {
      minimumInterval: FETCH_MINIMUM_INTERVAL_SECONDS,
    })
      .then(() =>
        setFetchResult({
          status: 'success',
          value: 'Registered for background fetch',
        }),
      )
      .catch(error =>
        setFetchResult({ status: 'error', message: errorMessage(error) }),
      )
      .finally(() => {
        handleRefreshFetchStatus();
        handleCheckRegistered();
      });
  }, [handleRefreshFetchStatus, handleCheckRegistered]);

  const handleUnregisterFetch = useCallback(() => {
    unregisterFetchTaskAsync(DEMO_TASK_NAME)
      .then(() =>
        setFetchResult({
          status: 'success',
          value: 'Unregistered from background fetch',
        }),
      )
      .catch(error =>
        setFetchResult({ status: 'error', message: errorMessage(error) }),
      )
      .finally(() => {
        handleRefreshFetchStatus();
        handleCheckRegistered();
      });
  }, [handleRefreshFetchStatus, handleCheckRegistered]);

  const handleSetMinimumFetchInterval = useCallback(() => {
    setMinimumIntervalAsync(FETCH_MINIMUM_INTERVAL_SECONDS)
      .then(() =>
        setFetchResult({
          status: 'success',
          value: `Minimum interval set to ${FETCH_MINIMUM_INTERVAL_SECONDS}s`,
        }),
      )
      .catch(error =>
        setFetchResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  // --- Background Task ---
  const [backgroundTaskStatus, setBackgroundTaskStatus] =
    useState<BackgroundTaskStatus | null>(null);
  const [backgroundTaskResult, setBackgroundTaskResult] =
    useState<IAsyncResult<string> | null>(null);

  const handleRefreshBackgroundTaskStatus = useCallback(() => {
    getBackgroundTaskStatusAsync()
      .then(setBackgroundTaskStatus)
      .catch(() => setBackgroundTaskStatus(null));
  }, []);

  const handleRegisterBackgroundTask = useCallback(() => {
    registerBackgroundTaskAsync(DEMO_TASK_NAME, {
      minimumInterval: TASK_MINIMUM_INTERVAL_MINUTES,
    })
      .then(() =>
        setBackgroundTaskResult({
          status: 'success',
          value: 'Registered for background task',
        }),
      )
      .catch(error =>
        setBackgroundTaskResult({
          status: 'error',
          message: errorMessage(error),
        }),
      )
      .finally(() => {
        handleRefreshBackgroundTaskStatus();
        handleCheckRegistered();
      });
  }, [handleRefreshBackgroundTaskStatus, handleCheckRegistered]);

  const handleUnregisterBackgroundTask = useCallback(() => {
    unregisterBackgroundTaskAsync(DEMO_TASK_NAME)
      .then(() =>
        setBackgroundTaskResult({
          status: 'success',
          value: 'Unregistered from background task',
        }),
      )
      .catch(error =>
        setBackgroundTaskResult({
          status: 'error',
          message: errorMessage(error),
        }),
      )
      .finally(() => {
        handleRefreshBackgroundTaskStatus();
        handleCheckRegistered();
      });
  }, [handleRefreshBackgroundTaskStatus, handleCheckRegistered]);

  const handleTriggerForTesting = useCallback(() => {
    triggerTaskWorkerForTestingAsync()
      .then(triggered =>
        setBackgroundTaskResult({
          status: 'success',
          value: triggered
            ? 'Triggered'
            : 'Not triggered (production build only rejects this)',
        }),
      )
      .catch(error =>
        setBackgroundTaskResult({
          status: 'error',
          message: errorMessage(error),
        }),
      );
  }, []);

  // Mount-time probes — every other screen in this canary shows real status on first render
  // instead of a placeholder the user has to tap a button to resolve.
  useEffect(() => {
    handleCheckRegistered();
    handleRefreshFetchStatus();
    handleRefreshBackgroundTaskStatus();
  }, [handleCheckRegistered, handleRefreshFetchStatus, handleRefreshBackgroundTaskStatus]);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="background-tasks-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="background-tasks-hero" className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Background Tasks</text>
            <text className="hero-body">
              @symbiote-native/task-manager, @symbiote-native/background-fetch,
              and @symbiote-native/background-task, sharing one demo task
              defined at module scope. background-fetch is upstream-deprecated
              in favor of background-task; both are shown for parity.
            </text>
          </view>
        </view>

        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">Task Manager</text>
        </view>

        <view testID="background-task-manager-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Registration</text>
          </view>
          <text className="info-text">{DEMO_TASK_NAME}</text>
          <view className="button-row">
            <ActionButton
              testID="background-task-manager-check-registered"
              title="Is registered?"
              onPress={handleCheckRegistered}
              color={lineColor}
            />
            <ActionButton
              testID="background-task-manager-list-registered"
              title="List registered"
              onPress={handleListRegistered}
              color={lineColor}
            />
            <ActionButton
              testID="background-task-manager-unregister"
              title="Unregister"
              onPress={handleUnregisterManaged}
              color={lineColor}
            />
          </view>
          <ResultBlock
            testID="background-task-manager-result"
            result={managerResult}
          />
        </view>

        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">Background Fetch</text>
        </view>

        <view testID="background-fetch-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">
              Periodic fetch (deprecated upstream)
            </text>
          </view>
          <text testID="background-fetch-status" className="auth-value-text">
            {fetchStatusLabel(fetchStatus)}
          </text>
          <view className="button-row">
            <ActionButton
              testID="background-fetch-refresh-status"
              title="Refresh status"
              onPress={handleRefreshFetchStatus}
              color={lineColor}
            />
            <ActionButton
              testID="background-fetch-register"
              title="Register"
              onPress={handleRegisterFetch}
              color={lineColor}
            />
            <ActionButton
              testID="background-fetch-unregister"
              title="Unregister"
              onPress={handleUnregisterFetch}
              color={lineColor}
            />
            <ActionButton
              testID="background-fetch-set-minimum-interval"
              title={`Set min interval (${FETCH_MINIMUM_INTERVAL_SECONDS}s)`}
              onPress={handleSetMinimumFetchInterval}
              color={lineColor}
            />
          </view>
          <ResultBlock testID="background-fetch-result" result={fetchResult} />
        </view>

        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">Background Task</text>
        </view>

        <view testID="background-task-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">
              Task scheduling (BGTaskScheduler / WorkManager)
            </text>
          </view>
          <text testID="background-task-status" className="auth-value-text">
            {taskStatusLabel(backgroundTaskStatus)}
          </text>
          <view className="button-row">
            <ActionButton
              testID="background-task-refresh-status"
              title="Refresh status"
              onPress={handleRefreshBackgroundTaskStatus}
              color={lineColor}
            />
            <ActionButton
              testID="background-task-register"
              title="Register"
              onPress={handleRegisterBackgroundTask}
              color={lineColor}
            />
            <ActionButton
              testID="background-task-unregister"
              title="Unregister"
              onPress={handleUnregisterBackgroundTask}
              color={lineColor}
            />
            <ActionButton
              testID="background-task-trigger-for-testing"
              title="Trigger for testing"
              onPress={handleTriggerForTesting}
              color={lineColor}
            />
          </view>
          <ResultBlock
            testID="background-task-result"
            result={backgroundTaskResult}
          />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
