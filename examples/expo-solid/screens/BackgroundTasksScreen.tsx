import { createSignal } from 'solid-js';
import {
  defineTask,
  getRegisteredTasksAsync,
  isTaskRegisteredAsync,
  unregisterTaskAsync as unregisterFromTaskManagerAsync,
} from '@symbiote-native/task-manager';
import {
  BackgroundFetchStatus,
  getStatusAsync as getBackgroundFetchStatusAsync,
  registerTaskAsync as registerBackgroundFetchTaskAsync,
  setMinimumIntervalAsync,
  unregisterTaskAsync as unregisterBackgroundFetchTaskAsync,
} from '@symbiote-native/background-fetch';
import {
  BackgroundTaskStatus,
  getStatusAsync as getBackgroundTaskStatusAsync,
  registerTaskAsync as registerBackgroundTaskAsync,
  triggerTaskWorkerForTestingAsync,
  unregisterTaskAsync as unregisterBackgroundTaskAsync,
} from '@symbiote-native/background-task';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_TASK_NAME = 'expo-background-tasks-canary-demo';
const BACKGROUND_FETCH_MINIMUM_INTERVAL_SECONDS = 900;
const BACKGROUND_TASK_MINIMUM_INTERVAL_MINUTES = 15;

// Must run at module top level, outside any component - the app can be launched headlessly to
// run a registered background task, with no views mounted at all (same requirement as
// task-manager's own README and LocationScreen's background-location task above).
defineTask(DEMO_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('expo-background-tasks-canary-demo failed:', error);
    return;
  }
  console.log('expo-background-tasks-canary-demo received:', data);
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @symbiote-native/task-manager + @symbiote-native/background-fetch +
 * @symbiote-native/background-task canary demo: three sections over ONE registered task —
 * task-manager's own registration bookkeeping, the deprecated-but-still-shipped background-fetch
 * primitive, and its replacement background-task primitive, side by side.
 */
export function BackgroundTasksScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.BackgroundTasks];
  const lineColor = LINE_COLOR[lineInfo.line];

  // --- Task Manager ---
  const [taskManagerStatus, setTaskManagerStatus] = createSignal<string | null>(
    null,
  );
  const [taskManagerError, setTaskManagerError] = createSignal<string | null>(
    null,
  );
  const taskManagerStatusDisplay = () =>
    taskManagerError() ?? taskManagerStatus() ?? 'not checked yet';

  const handleIsRegistered = async () => {
    try {
      const registered = await isTaskRegisteredAsync(DEMO_TASK_NAME);
      setTaskManagerError(null);
      setTaskManagerStatus(`registered=${registered}`);
    } catch (error) {
      setTaskManagerError(errorMessage(error));
    }
  };
  const handleListRegisteredTasks = async () => {
    try {
      const tasks = await getRegisteredTasksAsync();
      setTaskManagerError(null);
      setTaskManagerStatus(
        `${tasks.length} task(s): ${tasks.map(task => task.taskName).join(', ')}`,
      );
    } catch (error) {
      setTaskManagerError(errorMessage(error));
    }
  };
  const handleUnregisterFromTaskManager = async () => {
    try {
      await unregisterFromTaskManagerAsync(DEMO_TASK_NAME);
      setTaskManagerError(null);
      setTaskManagerStatus('unregistered from task-manager');
    } catch (error) {
      setTaskManagerError(errorMessage(error));
    }
  };

  // --- Background Fetch ---
  const [fetchStatus, setFetchStatus] = createSignal<string | null>(null);
  const [fetchError, setFetchError] = createSignal<string | null>(null);
  const fetchStatusDisplay = () =>
    fetchError() ?? fetchStatus() ?? 'not checked yet';

  const handleRegisterFetch = async () => {
    try {
      await registerBackgroundFetchTaskAsync(DEMO_TASK_NAME, {
        minimumInterval: BACKGROUND_FETCH_MINIMUM_INTERVAL_SECONDS,
      });
      setFetchError(null);
      setFetchStatus('registered for background-fetch');
    } catch (error) {
      setFetchError(errorMessage(error));
    }
    await handleIsRegistered();
  };
  const handleUnregisterFetch = async () => {
    try {
      await unregisterBackgroundFetchTaskAsync(DEMO_TASK_NAME);
      setFetchError(null);
      setFetchStatus('unregistered from background-fetch');
    } catch (error) {
      setFetchError(errorMessage(error));
    }
    await handleIsRegistered();
  };
  const handleGetFetchStatus = async () => {
    try {
      const status = await getBackgroundFetchStatusAsync();
      setFetchError(null);
      setFetchStatus(
        status === null ? 'null' : `status=${BackgroundFetchStatus[status]}`,
      );
    } catch (error) {
      setFetchError(errorMessage(error));
    }
  };
  const handleSetFetchMinimumInterval = async () => {
    try {
      await setMinimumIntervalAsync(BACKGROUND_FETCH_MINIMUM_INTERVAL_SECONDS);
      setFetchError(null);
      setFetchStatus(
        `minimumInterval set to ${BACKGROUND_FETCH_MINIMUM_INTERVAL_SECONDS}s`,
      );
    } catch (error) {
      setFetchError(errorMessage(error));
    }
  };

  // --- Background Task ---
  const [taskStatus, setTaskStatus] = createSignal<string | null>(null);
  const [taskError, setTaskError] = createSignal<string | null>(null);
  const taskStatusDisplay = () =>
    taskError() ?? taskStatus() ?? 'not checked yet';

  const handleRegisterTask = async () => {
    try {
      await registerBackgroundTaskAsync(DEMO_TASK_NAME, {
        minimumInterval: BACKGROUND_TASK_MINIMUM_INTERVAL_MINUTES,
      });
      setTaskError(null);
      setTaskStatus('registered for background-task');
    } catch (error) {
      setTaskError(errorMessage(error));
    }
    await handleIsRegistered();
  };
  const handleUnregisterTask = async () => {
    try {
      await unregisterBackgroundTaskAsync(DEMO_TASK_NAME);
      setTaskError(null);
      setTaskStatus('unregistered from background-task');
    } catch (error) {
      setTaskError(errorMessage(error));
    }
    await handleIsRegistered();
  };
  const handleGetTaskStatus = async () => {
    try {
      const status = await getBackgroundTaskStatusAsync();
      setTaskError(null);
      setTaskStatus(`status=${BackgroundTaskStatus[status]}`);
    } catch (error) {
      setTaskError(errorMessage(error));
    }
  };
  const handleTriggerForTesting = async () => {
    try {
      const triggered = await triggerTaskWorkerForTestingAsync();
      setTaskError(null);
      setTaskStatus(`triggerTaskWorkerForTestingAsync -> ${triggered}`);
    } catch (error) {
      setTaskError(errorMessage(error));
    }
  };

  // Mount-time probes — every other screen in this canary shows real status on first render
  // instead of a placeholder the user has to tap a button to resolve. Solid's component setup
  // body runs exactly once, same as an onMount, so these fire straight here.
  void handleIsRegistered();
  void handleGetFetchStatus();
  void handleGetTaskStatus();

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="background-tasks-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="background-tasks-hero" class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: lineColor }}>
            <text class="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Background Tasks</text>
            <text class="hero-body">
              @symbiote-native/task-manager + @symbiote-native/background-fetch
              + @symbiote-native/background-task — one demo task, three angles
              on it: definition + registration bookkeeping, the deprecated fetch
              primitive, and its replacement.
            </text>
          </view>
        </view>

        <view testID="background-task-manager-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Task Manager</text>
          </view>
          <ActionButton
            testID="background-task-manager-is-registered"
            title="Is registered?"
            onPress={() => void handleIsRegistered()}
            color={lineColor}
          />
          <ActionButton
            testID="background-task-manager-list-registered"
            title="List registered tasks"
            onPress={() => void handleListRegisteredTasks()}
            color={lineColor}
          />
          <ActionButton
            testID="background-task-manager-unregister"
            title="Unregister"
            onPress={() => void handleUnregisterFromTaskManager()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="background-task-manager-status" class="value-text">
              {taskManagerStatusDisplay()}
            </text>
          </view>
        </view>

        <view testID="background-fetch-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">
              Background Fetch (deprecated)
            </text>
          </view>
          <ActionButton
            testID="background-fetch-register"
            title="Register"
            onPress={() => void handleRegisterFetch()}
            color={lineColor}
          />
          <ActionButton
            testID="background-fetch-unregister"
            title="Unregister"
            onPress={() => void handleUnregisterFetch()}
            color={lineColor}
          />
          <ActionButton
            testID="background-fetch-get-status"
            title="Get status"
            onPress={() => void handleGetFetchStatus()}
            color={lineColor}
          />
          <ActionButton
            testID="background-fetch-set-minimum-interval"
            title={`Set minimum interval (${BACKGROUND_FETCH_MINIMUM_INTERVAL_SECONDS}s)`}
            onPress={() => void handleSetFetchMinimumInterval()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="background-fetch-status" class="value-text">
              {fetchStatusDisplay()}
            </text>
          </view>
        </view>

        <view testID="background-task-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Background Task</text>
          </view>
          <ActionButton
            testID="background-task-register"
            title="Register"
            onPress={() => void handleRegisterTask()}
            color={lineColor}
          />
          <ActionButton
            testID="background-task-unregister"
            title="Unregister"
            onPress={() => void handleUnregisterTask()}
            color={lineColor}
          />
          <ActionButton
            testID="background-task-get-status"
            title="Get status"
            onPress={() => void handleGetTaskStatus()}
            color={lineColor}
          />
          <ActionButton
            testID="background-task-trigger-for-testing"
            title="Trigger for testing"
            onPress={() => void handleTriggerForTesting()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="background-task-status" class="value-text">
              {taskStatusDisplay()}
            </text>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
