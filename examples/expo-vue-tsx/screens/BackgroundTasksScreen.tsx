import { defineComponent, onMounted, ref } from 'vue';
import type { Ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  defineTask,
  getRegisteredTasksAsync,
  isTaskRegisteredAsync,
  unregisterTaskAsync,
} from '@symbiote-native/task-manager/vue';
import {
  BackgroundFetchStatus,
  getStatusAsync as getFetchStatusAsync,
  registerTaskAsync as registerFetchTaskAsync,
  setMinimumIntervalAsync,
  unregisterTaskAsync as unregisterFetchTaskAsync,
} from '@symbiote-native/background-fetch/vue';
import {
  BackgroundTaskStatus,
  getStatusAsync as getTaskStatusAsync,
  registerTaskAsync as registerBackgroundTaskAsync,
  triggerTaskWorkerForTestingAsync,
  unregisterTaskAsync as unregisterBackgroundTaskAsync,
} from '@symbiote-native/background-task/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Registered at module scope, not inside the component — native can launch the app headlessly to
// run a background task, with no views mounted, so a task defined inside a component lifecycle
// method would simply never register on that launch. See @symbiote-native/task-manager's README.
const DEMO_TASK_NAME = 'symbiote-background-demo';
defineTask(DEMO_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('symbiote-background-demo failed:', error);
    return;
  }
  console.log('symbiote-background-demo received:', data);
});

const FETCH_MINIMUM_INTERVAL_SECONDS = 900;
const TASK_MINIMUM_INTERVAL_MINUTES = 15;

type IAsyncResult<T> =
  { kind: 'success'; value: T } | { kind: 'error'; message: string } | null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultText<T extends string>(result: IAsyncResult<T>): string | null {
  if (result === null) return null;
  return result.kind === 'error' ? `Failed: ${result.message}` : result.value;
}

/**
 * Background-work demo: @symbiote-native/task-manager (the primitive — defining and inspecting
 * tasks), @symbiote-native/background-fetch (periodic-fetch scheduling, deprecated upstream but
 * still shipped), and @symbiote-native/background-task (the modern BGTaskScheduler/WorkManager
 * replacement) — three sections on one screen, all registering/inspecting the same demo task.
 */
export const BackgroundTasksScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.BackgroundTasks];
    const lineColor = LINE_COLOR[lineInfo.line];

    // --- task manager ---
    const taskRegisteredResult: Ref<IAsyncResult<string>> = ref(null);
    const registeredTasksResult: Ref<IAsyncResult<string>> = ref(null);
    const unregisterResult: Ref<IAsyncResult<string>> = ref(null);

    async function handleCheckRegistered() {
      try {
        const registered = await isTaskRegisteredAsync(DEMO_TASK_NAME);
        taskRegisteredResult.value = {
          kind: 'success',
          value: `registered: ${registered}`,
        };
      } catch (error) {
        taskRegisteredResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }
    async function handleListRegistered() {
      try {
        const tasks = await getRegisteredTasksAsync();
        registeredTasksResult.value = {
          kind: 'success',
          value:
            tasks.length === 0
              ? 'no tasks registered'
              : tasks.map(task => task.taskName).join(', '),
        };
      } catch (error) {
        registeredTasksResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }
    async function handleUnregisterFromManager() {
      try {
        await unregisterTaskAsync(DEMO_TASK_NAME);
        unregisterResult.value = { kind: 'success', value: 'unregistered' };
      } catch (error) {
        unregisterResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }

    // --- background fetch ---
    const fetchStatusResult: Ref<IAsyncResult<string>> = ref(null);
    const fetchRegisterResult: Ref<IAsyncResult<string>> = ref(null);
    const fetchIntervalResult: Ref<IAsyncResult<string>> = ref(null);

    async function handleGetFetchStatus() {
      try {
        const status = await getFetchStatusAsync();
        fetchStatusResult.value = {
          kind: 'success',
          value: status === null ? 'null' : BackgroundFetchStatus[status],
        };
      } catch (error) {
        fetchStatusResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }
    async function handleRegisterFetch() {
      try {
        await registerFetchTaskAsync(DEMO_TASK_NAME, {
          minimumInterval: FETCH_MINIMUM_INTERVAL_SECONDS,
        });
        fetchRegisterResult.value = {
          kind: 'success',
          value: 'registered for background-fetch',
        };
      } catch (error) {
        fetchRegisterResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
      await handleCheckRegistered();
    }
    async function handleUnregisterFetch() {
      try {
        await unregisterFetchTaskAsync(DEMO_TASK_NAME);
        fetchRegisterResult.value = {
          kind: 'success',
          value: 'unregistered from background-fetch',
        };
      } catch (error) {
        fetchRegisterResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
      await handleCheckRegistered();
    }
    async function handleSetFetchInterval() {
      try {
        await setMinimumIntervalAsync(FETCH_MINIMUM_INTERVAL_SECONDS);
        fetchIntervalResult.value = {
          kind: 'success',
          value: `minimum interval set: ${FETCH_MINIMUM_INTERVAL_SECONDS}s`,
        };
      } catch (error) {
        fetchIntervalResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }

    // --- background task ---
    const taskStatusResult: Ref<IAsyncResult<string>> = ref(null);
    const taskRegisterResult: Ref<IAsyncResult<string>> = ref(null);
    const taskTriggerResult: Ref<IAsyncResult<string>> = ref(null);

    async function handleGetTaskStatus() {
      try {
        const status = await getTaskStatusAsync();
        taskStatusResult.value = {
          kind: 'success',
          value: BackgroundTaskStatus[status],
        };
      } catch (error) {
        taskStatusResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }
    async function handleRegisterTask() {
      try {
        await registerBackgroundTaskAsync(DEMO_TASK_NAME, {
          minimumInterval: TASK_MINIMUM_INTERVAL_MINUTES,
        });
        taskRegisterResult.value = {
          kind: 'success',
          value: 'registered for background-task',
        };
      } catch (error) {
        taskRegisterResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
      await handleCheckRegistered();
    }
    async function handleUnregisterTask() {
      try {
        await unregisterBackgroundTaskAsync(DEMO_TASK_NAME);
        taskRegisterResult.value = {
          kind: 'success',
          value: 'unregistered from background-task',
        };
      } catch (error) {
        taskRegisterResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
      await handleCheckRegistered();
    }
    async function handleTriggerForTesting() {
      try {
        const ran = await triggerTaskWorkerForTestingAsync();
        taskTriggerResult.value = {
          kind: 'success',
          value: `worker ran: ${ran}`,
        };
      } catch (error) {
        taskTriggerResult.value = {
          kind: 'error',
          message: errorMessage(error),
        };
      }
    }

    // Mount-time probes — every other screen in this canary shows real status on first render
    // instead of a placeholder the user has to tap a button to resolve.
    onMounted(() => {
      handleCheckRegistered();
      handleGetFetchStatus();
      handleGetTaskStatus();
    });

    return () => (
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
                @symbiote-native/task-manager — defining and inspecting tasks —
                plus @symbiote-native/background-fetch and
                @symbiote-native/background-task, the two schedulers built on
                it, side by side.
              </text>
            </view>
          </view>

          <view testID="background-task-manager-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Task Manager</text>
            </view>
            <ActionButton
              testID="background-task-manager-check-registered"
              title="Is registered?"
              onPress={handleCheckRegistered}
              color={lineColor}
            />
            {taskRegisteredResult.value && (
              <text
                testID="background-task-manager-registered-result"
                class="info-text"
              >
                {resultText(taskRegisteredResult.value)}
              </text>
            )}
            <ActionButton
              testID="background-task-manager-list-registered"
              title="List registered tasks"
              onPress={handleListRegistered}
              color={lineColor}
            />
            {registeredTasksResult.value && (
              <text
                testID="background-task-manager-list-result"
                class="info-text"
              >
                {resultText(registeredTasksResult.value)}
              </text>
            )}
            <ActionButton
              testID="background-task-manager-unregister"
              title="Unregister task"
              onPress={handleUnregisterFromManager}
              color={lineColor}
            />
            {unregisterResult.value && (
              <text
                testID="background-task-manager-unregister-result"
                class="info-text"
              >
                {resultText(unregisterResult.value)}
              </text>
            )}
          </view>

          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">
              Background Fetch — deprecated upstream, still shipped
            </text>
          </view>

          <view testID="background-fetch-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Background Fetch</text>
            </view>
            <ActionButton
              testID="background-fetch-status"
              title="Get status"
              onPress={handleGetFetchStatus}
              color={lineColor}
            />
            {fetchStatusResult.value && (
              <text testID="background-fetch-status-result" class="info-text">
                {resultText(fetchStatusResult.value)}
              </text>
            )}
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
            {fetchRegisterResult.value && (
              <text testID="background-fetch-register-result" class="info-text">
                {resultText(fetchRegisterResult.value)}
              </text>
            )}
            <ActionButton
              testID="background-fetch-set-interval"
              title={`Set minimum interval (${FETCH_MINIMUM_INTERVAL_SECONDS}s)`}
              onPress={handleSetFetchInterval}
              color={lineColor}
            />
            {fetchIntervalResult.value && (
              <text testID="background-fetch-interval-result" class="info-text">
                {resultText(fetchIntervalResult.value)}
              </text>
            )}
          </view>

          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">
              Background Task — BGTaskScheduler / WorkManager
            </text>
          </view>

          <view testID="background-task-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Background Task</text>
            </view>
            <ActionButton
              testID="background-task-status"
              title="Get status"
              onPress={handleGetTaskStatus}
              color={lineColor}
            />
            {taskStatusResult.value && (
              <text testID="background-task-status-result" class="info-text">
                {resultText(taskStatusResult.value)}
              </text>
            )}
            <ActionButton
              testID="background-task-register"
              title="Register"
              onPress={handleRegisterTask}
              color={lineColor}
            />
            <ActionButton
              testID="background-task-unregister"
              title="Unregister"
              onPress={handleUnregisterTask}
              color={lineColor}
            />
            {taskRegisterResult.value && (
              <text testID="background-task-register-result" class="info-text">
                {resultText(taskRegisterResult.value)}
              </text>
            )}
            <ActionButton
              testID="background-task-trigger-for-testing"
              title="Trigger for testing"
              onPress={handleTriggerForTesting}
              color={lineColor}
            />
            {taskTriggerResult.value && (
              <text testID="background-task-trigger-result" class="info-text">
                {resultText(taskTriggerResult.value)}
              </text>
            )}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'BackgroundTasksScreen' },
);
