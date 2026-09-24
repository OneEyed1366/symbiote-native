<script lang="ts">
  // Three primitives on one screen, same multi-section shape as FileSystemScreen's
  // legacy/modern split: @symbiote-native/task-manager (the low-level define/register primitive),
  // @symbiote-native/background-fetch (deprecated periodic-fetch scheduling), and
  // @symbiote-native/background-task (its modern BGTaskScheduler/WorkManager replacement). All
  // three register the SAME demo task by name. defineTask() must run at the top of the JS bundle,
  // outside any component (task-manager's own README) — the app can be launched headlessly to run
  // a background task, with no views mounted — so it sits at module scope below, same as
  // LocationScreen's own background-location task. Svelte twin of
  // examples/expo-vue-sfc/screens/BackgroundTasksScreen.vue.
  import {
    defineTask,
    getRegisteredTasksAsync,
    isTaskRegisteredAsync,
    unregisterTaskAsync as unregisterFromTaskManagerAsync,
  } from '@symbiote-native/task-manager';
  import {
    BackgroundFetchStatus,
    getStatusAsync as getFetchStatusAsync,
    registerTaskAsync as registerFetchTaskAsync,
    setMinimumIntervalAsync,
    unregisterTaskAsync as unregisterFetchTaskAsync,
  } from '@symbiote-native/background-fetch';
  import {
    BackgroundTaskStatus,
    addExpirationListener,
    getStatusAsync as getBackgroundTaskStatusAsync,
    registerTaskAsync as registerBackgroundTaskAsync,
    triggerTaskWorkerForTestingAsync,
    unregisterTaskAsync as unregisterBackgroundTaskAsync,
  } from '@symbiote-native/background-task';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const DEMO_TASK_NAME = 'symbiote-background-tasks-demo';
  const FETCH_MINIMUM_INTERVAL_SECONDS = 900;
  const BACKGROUND_TASK_MINIMUM_INTERVAL_MINUTES = 15;

  defineTask(DEMO_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error(`${DEMO_TASK_NAME} failed:`, error);
      return;
    }
    console.log(`${DEMO_TASK_NAME} received:`, data);
  });

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.BackgroundTasks];
  const lineColor = LINE_COLOR[lineInfo.line];

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  function capabilityStatusText(status: ICapabilityStatus): string {
    if (status === 'checking') return 'CHECKING…';
    return status === 'yes' ? 'YES' : 'NO';
  }

  // Task Manager
  let taskManagerRegistered = $state<ICapabilityStatus>('checking');
  let taskManagerError = $state<string | null>(null);
  let registeredTasks = $state<string[]>([]);
  let registeredTasksError = $state<string | null>(null);

  async function handleCheckRegistered(): Promise<void> {
    taskManagerError = null;
    try {
      const registered = await isTaskRegisteredAsync(DEMO_TASK_NAME);
      taskManagerRegistered = toCapabilityStatus(registered);
    } catch (reason) {
      taskManagerError = String(reason);
    }
  }

  async function handleListRegisteredTasks(): Promise<void> {
    registeredTasksError = null;
    try {
      const tasks = await getRegisteredTasksAsync();
      registeredTasks = tasks.map(task => task.taskName);
    } catch (reason) {
      registeredTasksError = String(reason);
    }
  }

  async function handleUnregisterFromTaskManager(): Promise<void> {
    taskManagerError = null;
    try {
      await unregisterFromTaskManagerAsync(DEMO_TASK_NAME);
      taskManagerRegistered = 'no';
    } catch (reason) {
      taskManagerError = String(reason);
    }
  }

  const registeredTasksText = $derived(
    registeredTasks.join(', ') || '(none loaded)',
  );

  // Background Fetch
  let fetchStatus = $state<BackgroundFetchStatus | null>(null);
  let fetchStatusError = $state<string | null>(null);
  let fetchRegisterDone = $state(false);
  let fetchRegisterError = $state<string | null>(null);
  let fetchIntervalDone = $state(false);
  let fetchIntervalError = $state<string | null>(null);

  async function handleGetFetchStatus(): Promise<void> {
    fetchStatusError = null;
    try {
      fetchStatus = await getFetchStatusAsync();
    } catch (reason) {
      fetchStatusError = String(reason);
    }
  }

  async function handleRegisterFetchTask(): Promise<void> {
    fetchRegisterError = null;
    try {
      await registerFetchTaskAsync(DEMO_TASK_NAME, {
        minimumInterval: FETCH_MINIMUM_INTERVAL_SECONDS,
      });
      fetchRegisterDone = true;
    } catch (reason) {
      fetchRegisterError = String(reason);
    }
    await handleCheckRegistered();
  }

  async function handleUnregisterFetchTask(): Promise<void> {
    fetchRegisterError = null;
    try {
      await unregisterFetchTaskAsync(DEMO_TASK_NAME);
      fetchRegisterDone = false;
    } catch (reason) {
      fetchRegisterError = String(reason);
    }
    await handleCheckRegistered();
  }

  async function handleSetFetchMinimumInterval(): Promise<void> {
    fetchIntervalError = null;
    try {
      await setMinimumIntervalAsync(FETCH_MINIMUM_INTERVAL_SECONDS);
      fetchIntervalDone = true;
    } catch (reason) {
      fetchIntervalError = String(reason);
    }
  }

  const fetchStatusText = $derived(
    fetchStatus === null
      ? 'not checked yet'
      : (BackgroundFetchStatus[fetchStatus] ?? String(fetchStatus)),
  );

  // Background Task
  let backgroundTaskStatus = $state<BackgroundTaskStatus | null>(null);
  let backgroundTaskStatusError = $state<string | null>(null);
  let backgroundTaskRegisterDone = $state(false);
  let backgroundTaskRegisterError = $state<string | null>(null);
  let backgroundTaskTriggerResult = $state<boolean | null>(null);
  let backgroundTaskTriggerError = $state<string | null>(null);
  let expirationCount = $state(0);

  async function handleGetBackgroundTaskStatus(): Promise<void> {
    backgroundTaskStatusError = null;
    try {
      backgroundTaskStatus = await getBackgroundTaskStatusAsync();
    } catch (reason) {
      backgroundTaskStatusError = String(reason);
    }
  }

  async function handleRegisterBackgroundTask(): Promise<void> {
    backgroundTaskRegisterError = null;
    try {
      await registerBackgroundTaskAsync(DEMO_TASK_NAME, {
        minimumInterval: BACKGROUND_TASK_MINIMUM_INTERVAL_MINUTES,
      });
      backgroundTaskRegisterDone = true;
    } catch (reason) {
      backgroundTaskRegisterError = String(reason);
    }
    await handleCheckRegistered();
  }

  async function handleUnregisterBackgroundTask(): Promise<void> {
    backgroundTaskRegisterError = null;
    try {
      await unregisterBackgroundTaskAsync(DEMO_TASK_NAME);
      backgroundTaskRegisterDone = false;
    } catch (reason) {
      backgroundTaskRegisterError = String(reason);
    }
    await handleCheckRegistered();
  }

  async function handleTriggerForTesting(): Promise<void> {
    backgroundTaskTriggerError = null;
    try {
      backgroundTaskTriggerResult = await triggerTaskWorkerForTestingAsync();
    } catch (reason) {
      backgroundTaskTriggerError = String(reason);
    }
  }

  $effect(() => {
    const subscription = addExpirationListener(() => {
      expirationCount += 1;
    });
    return () => {
      subscription.remove();
    };
  });

  // Mount-time probes — every other screen in this canary shows real status on first render
  // instead of a placeholder the user has to tap a button to resolve.
  $effect(() => {
    void handleCheckRegistered();
    void handleGetFetchStatus();
    void handleGetBackgroundTaskStatus();
  });

  const backgroundTaskStatusText = $derived(
    backgroundTaskStatus === null
      ? 'not checked yet'
      : (BackgroundTaskStatus[backgroundTaskStatus] ??
          String(backgroundTaskStatus)),
  );
  const triggerResultText = $derived(
    backgroundTaskTriggerResult === null
      ? 'not triggered yet'
      : String(backgroundTaskTriggerResult),
  );
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="background-tasks-scroll"
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
        <text class="hero-title">Background Tasks</text>
        <text testID="background-tasks-hero" class="hero-body">
          @symbiote-native/task-manager (the define/register primitive),
          @symbiote-native/background-fetch (deprecated periodic fetch), and
          @symbiote-native/background-task (its BGTaskScheduler/WorkManager
          replacement) — one demo task, registered through both schedulers.
        </text>
      </view>
    </view>

    <text class="hero-title">Task Manager</text>

    <view testID="background-task-manager-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">{DEMO_TASK_NAME}</text>
        <view
          class={`auth-status-badge auth-status-badge-${taskManagerRegistered}`}
        >
          <text class="auth-status-text">
            {capabilityStatusText(taskManagerRegistered)}
          </text>
        </view>
      </view>
      <view class="button-row">
        <ActionButton
          testID="background-task-manager-check-registered"
          title="Is registered?"
          onPress={handleCheckRegistered}
          color={lineColor}
        />
        <ActionButton
          testID="background-task-manager-list"
          title="List registered tasks"
          onPress={handleListRegisteredTasks}
          color={lineColor}
        />
        <ActionButton
          testID="background-task-manager-unregister"
          title="Unregister"
          onPress={handleUnregisterFromTaskManager}
          color={lineColor}
        />
      </view>{#if taskManagerError}<text class="auth-result-text">
          {taskManagerError}
        </text>{/if}{#if registeredTasksError}<text class="auth-result-text">
          {registeredTasksError}
        </text>{:else}<text
          testID="background-task-manager-list-result"
          class="info-text"
        >
          {registeredTasksText}
        </text>{/if}
    </view>

    <text class="hero-title">Background Fetch</text>

    <view testID="background-fetch-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Periodic fetch (deprecated)</text>
      </view>
      <ActionButton
        testID="background-fetch-get-status"
        title="Get status"
        onPress={handleGetFetchStatus}
        color={lineColor}
      />{#if fetchStatusError}<text class="auth-result-text">
          {fetchStatusError}
        </text>{:else}<text
          testID="background-fetch-status"
          class="auth-value-text"
        >
          {fetchStatusText}
        </text>{/if}
      <view class="button-row">
        <ActionButton
          testID="background-fetch-register"
          title="Register"
          onPress={handleRegisterFetchTask}
          color={lineColor}
        />
        <ActionButton
          testID="background-fetch-unregister"
          title="Unregister"
          onPress={handleUnregisterFetchTask}
          color={lineColor}
        />
      </view>{#if fetchRegisterError}<text class="auth-result-text">
          {fetchRegisterError}
        </text>{:else if fetchRegisterDone}<text
          testID="background-fetch-register-result"
          class="auth-value-text"
        >
          registered
        </text>{/if}
      <ActionButton
        testID="background-fetch-set-interval"
        title={`Set minimum interval (${FETCH_MINIMUM_INTERVAL_SECONDS}s)`}
        onPress={handleSetFetchMinimumInterval}
        color={lineColor}
      />{#if fetchIntervalError}<text class="auth-result-text">
          {fetchIntervalError}
        </text>{:else if fetchIntervalDone}<text class="auth-value-text">
          set
        </text>{/if}
    </view>

    <text class="hero-title">Background Task</text>

    <view testID="background-task-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">BGTaskScheduler / WorkManager</text>
      </view>
      <ActionButton
        testID="background-task-get-status"
        title="Get status"
        onPress={handleGetBackgroundTaskStatus}
        color={lineColor}
      />{#if backgroundTaskStatusError}<text class="auth-result-text">
          {backgroundTaskStatusError}
        </text>{:else}<text
          testID="background-task-status"
          class="auth-value-text"
        >
          {backgroundTaskStatusText}
        </text>{/if}
      <view class="button-row">
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
      </view>{#if backgroundTaskRegisterError}<text class="auth-result-text">
          {backgroundTaskRegisterError}
        </text>{:else if backgroundTaskRegisterDone}<text
          testID="background-task-register-result"
          class="auth-value-text"
        >
          registered
        </text>{/if}
      <ActionButton
        testID="background-task-trigger-for-testing"
        title="Trigger for testing"
        onPress={handleTriggerForTesting}
        color={lineColor}
      />{#if backgroundTaskTriggerError}<text class="auth-result-text">
          {backgroundTaskTriggerError}
        </text>{:else}<text
          testID="background-task-trigger-result"
          class="info-text"
        >
          {triggerResultText}
        </text>{/if}
      <text testID="background-task-expiration-count" class="info-text">
        {`${expirationCount} expiration events`}
      </text>
    </view>
  </scroll-view>
</safe-area-view>
