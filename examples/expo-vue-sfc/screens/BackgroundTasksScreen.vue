<!--
  Background-work tour stop — three sections on one screen, same multi-section pattern as
  FileSystemScreen: @symbiote-native/task-manager (the low-level primitive — defineTask, then
  isTaskRegisteredAsync/getRegisteredTasksAsync/unregisterTaskAsync against it),
  @symbiote-native/background-fetch (periodic-fetch scheduling, the deprecated-but-still-shipped
  API), and @symbiote-native/background-task (the modern BGTaskScheduler/WorkManager
  replacement). Distinct testID prefixes per section: background-task-manager-, background-fetch-,
  background-task-. First port of this screen across the example suite — no React/Svelte/Solid/
  Angular twin to mirror yet.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  defineTask,
  getRegisteredTasksAsync,
  isTaskRegisteredAsync,
  unregisterTaskAsync as unregisterDefinedTaskAsync,
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
  getStatusAsync as getBackgroundTaskStatusAsync,
  registerTaskAsync as registerBackgroundTaskAsync,
  triggerTaskWorkerForTestingAsync,
  unregisterTaskAsync as unregisterBackgroundTaskAsync,
} from '@symbiote-native/background-task/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ActionButton from '../components/ActionButton.vue';

const DEMO_TASK_NAME = 'symbiote-canary-background-sync';
const FETCH_MINIMUM_INTERVAL_SECONDS = 900;
const TASK_MINIMUM_INTERVAL_MINUTES = 15;

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.BackgroundTasks];
const lineColor = LINE_COLOR[lineInfo.line];

// Must run at module scope, not inside a lifecycle hook — the app can be launched headlessly to
// run a background task, with no views mounted, so a task defined inside a component lifecycle
// method would never register on that launch. See the task-manager README.
defineTask(DEMO_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('symbiote-canary-background-sync failed:', error);
    return;
  }
  console.log('symbiote-canary-background-sync received:', data);
});

// Task Manager
const taskManagerStatusText = ref('not checked yet');
const taskManagerError = ref<string | null>(null);

function handleIsTaskRegistered(): void {
  taskManagerError.value = null;
  void isTaskRegisteredAsync(DEMO_TASK_NAME)
    .then(registered => {
      taskManagerStatusText.value = `registered: ${registered}`;
    })
    .catch((error: Error) => {
      taskManagerError.value = `check failed: ${error.message}`;
    });
}

function handleGetRegisteredTasks(): void {
  taskManagerError.value = null;
  void getRegisteredTasksAsync()
    .then(tasks => {
      taskManagerStatusText.value =
        tasks.length === 0
          ? 'no registered tasks'
          : `${tasks.length}: ${tasks.map(task => task.taskName).join(', ')}`;
    })
    .catch((error: Error) => {
      taskManagerError.value = `list failed: ${error.message}`;
    });
}

function handleUnregisterDefinedTask(): void {
  taskManagerError.value = null;
  void unregisterDefinedTaskAsync(DEMO_TASK_NAME)
    .then(() => {
      taskManagerStatusText.value = `unregistered ${DEMO_TASK_NAME}`;
    })
    .catch((error: Error) => {
      taskManagerError.value = `unregister failed: ${error.message}`;
    });
}

// Background Fetch
const fetchStatusText = ref('not checked yet');
const fetchResultText = ref('not run yet');
const fetchError = ref<string | null>(null);

function handleRegisterFetch(): void {
  fetchError.value = null;
  void registerFetchTaskAsync(DEMO_TASK_NAME, {
    minimumInterval: FETCH_MINIMUM_INTERVAL_SECONDS,
  })
    .then(() => {
      fetchResultText.value = `registered, interval ${FETCH_MINIMUM_INTERVAL_SECONDS}s`;
    })
    .catch((error: Error) => {
      fetchError.value = `register failed: ${error.message}`;
    })
    .finally(handleIsTaskRegistered);
}

function handleUnregisterFetch(): void {
  fetchError.value = null;
  void unregisterFetchTaskAsync(DEMO_TASK_NAME)
    .then(() => {
      fetchResultText.value = 'unregistered';
    })
    .catch((error: Error) => {
      fetchError.value = `unregister failed: ${error.message}`;
    })
    .finally(handleIsTaskRegistered);
}

function handleGetFetchStatus(): void {
  fetchError.value = null;
  void getFetchStatusAsync()
    .then(status => {
      fetchStatusText.value =
        status === null
          ? 'null'
          : (BackgroundFetchStatus[status] ?? String(status));
    })
    .catch((error: Error) => {
      fetchError.value = `status failed: ${error.message}`;
    });
}

function handleSetMinimumInterval(): void {
  fetchError.value = null;
  void setMinimumIntervalAsync(FETCH_MINIMUM_INTERVAL_SECONDS)
    .then(() => {
      fetchResultText.value = `minimum interval set to ${FETCH_MINIMUM_INTERVAL_SECONDS}s`;
    })
    .catch((error: Error) => {
      fetchError.value = `set interval failed: ${error.message}`;
    });
}

// Background Task
const backgroundTaskStatusText = ref('not checked yet');
const backgroundTaskResultText = ref('not run yet');
const backgroundTaskError = ref<string | null>(null);

function handleRegisterBackgroundTask(): void {
  backgroundTaskError.value = null;
  void registerBackgroundTaskAsync(DEMO_TASK_NAME, {
    minimumInterval: TASK_MINIMUM_INTERVAL_MINUTES,
  })
    .then(() => {
      backgroundTaskResultText.value = `registered, interval ${TASK_MINIMUM_INTERVAL_MINUTES}min`;
    })
    .catch((error: Error) => {
      backgroundTaskError.value = `register failed: ${error.message}`;
    })
    .finally(handleIsTaskRegistered);
}

function handleUnregisterBackgroundTask(): void {
  backgroundTaskError.value = null;
  void unregisterBackgroundTaskAsync(DEMO_TASK_NAME)
    .then(() => {
      backgroundTaskResultText.value = 'unregistered';
    })
    .catch((error: Error) => {
      backgroundTaskError.value = `unregister failed: ${error.message}`;
    })
    .finally(handleIsTaskRegistered);
}

function handleGetBackgroundTaskStatus(): void {
  backgroundTaskError.value = null;
  void getBackgroundTaskStatusAsync()
    .then(status => {
      backgroundTaskStatusText.value =
        BackgroundTaskStatus[status] ?? String(status);
    })
    .catch((error: Error) => {
      backgroundTaskError.value = `status failed: ${error.message}`;
    });
}

function handleTriggerForTesting(): void {
  backgroundTaskError.value = null;
  void triggerTaskWorkerForTestingAsync()
    .then(triggered => {
      backgroundTaskResultText.value = `triggered: ${triggered}`;
    })
    .catch((error: Error) => {
      backgroundTaskError.value = `trigger failed: ${error.message}`;
    });
}

// Mount-time probes — every other screen in this canary shows real status on first render
// instead of a placeholder the user has to tap a button to resolve.
onMounted(() => {
  handleIsTaskRegistered();
  handleGetFetchStatus();
  handleGetBackgroundTaskStatus();
});
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="background-tasks-scroll"
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
          <text class="hero-title">Background Tasks</text>
          <text testID="background-tasks-hero" class="hero-body"
            >@symbiote-native/task-manager + background-fetch + background-task
            — define a task once, then register it for periodic or
            system-scheduled background work.</text
          >
        </view>
      </view>

      <view testID="background-task-manager-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Task Manager</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="background-task-manager-is-registered"
            title="Is registered?"
            :onPress="handleIsTaskRegistered"
            :color="lineColor"
          />
          <ActionButton
            testID="background-task-manager-get-registered"
            title="List registered"
            :onPress="handleGetRegisteredTasks"
            :color="lineColor"
          />
          <ActionButton
            testID="background-task-manager-unregister"
            title="Unregister"
            :onPress="handleUnregisterDefinedTask"
            :color="lineColor"
          />
        </view>
        <text testID="background-task-manager-status" class="auth-value-text">{{
          taskManagerStatusText
        }}</text>
        <view v-if="taskManagerError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ taskManagerError }}</text>
        </view>
      </view>

      <view testID="background-fetch-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Background Fetch</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="background-fetch-register"
            title="Register"
            :onPress="handleRegisterFetch"
            :color="lineColor"
          />
          <ActionButton
            testID="background-fetch-unregister"
            title="Unregister"
            :onPress="handleUnregisterFetch"
            :color="lineColor"
          />
        </view>
        <view class="button-row">
          <ActionButton
            testID="background-fetch-get-status"
            title="Get status"
            :onPress="handleGetFetchStatus"
            :color="lineColor"
          />
          <ActionButton
            testID="background-fetch-set-minimum-interval"
            title="Set min interval"
            :onPress="handleSetMinimumInterval"
            :color="lineColor"
          />
        </view>
        <text testID="background-fetch-status" class="auth-value-text">{{
          `status: ${fetchStatusText}`
        }}</text>
        <text testID="background-fetch-result" class="info-text">{{
          fetchResultText
        }}</text>
        <view v-if="fetchError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ fetchError }}</text>
        </view>
      </view>

      <view testID="background-task-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Background Task</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="background-task-register"
            title="Register"
            :onPress="handleRegisterBackgroundTask"
            :color="lineColor"
          />
          <ActionButton
            testID="background-task-unregister"
            title="Unregister"
            :onPress="handleUnregisterBackgroundTask"
            :color="lineColor"
          />
        </view>
        <view class="button-row">
          <ActionButton
            testID="background-task-get-status"
            title="Get status"
            :onPress="handleGetBackgroundTaskStatus"
            :color="lineColor"
          />
          <ActionButton
            testID="background-task-trigger-for-testing"
            title="Trigger for testing"
            :onPress="handleTriggerForTesting"
            :color="lineColor"
          />
        </view>
        <text testID="background-task-status" class="auth-value-text">{{
          `status: ${backgroundTaskStatusText}`
        }}</text>
        <text testID="background-task-result" class="info-text">{{
          backgroundTaskResultText
        }}</text>
        <view v-if="backgroundTaskError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ backgroundTaskError }}</text>
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
