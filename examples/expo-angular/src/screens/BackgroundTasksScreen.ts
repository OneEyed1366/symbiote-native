import { Component, OnInit, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  defineTask,
  getRegisteredTasksAsync,
  isTaskRegisteredAsync,
  unregisterTaskAsync as unregisterFromTaskManagerAsync,
} from '@symbiote-native/task-manager';
import type { ITaskManagerTask } from '@symbiote-native/task-manager';
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEMO_TASK_NAME = 'symbiote-background-tasks-demo';
const FETCH_MIN_INTERVAL_SECONDS = 900;
const TASK_MIN_INTERVAL_MINUTES = 15;

// Task executors must be registered at module top level — outside any component — since the app
// can be launched headlessly to run one. See the @symbiote-native/task-manager README.
defineTask(DEMO_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(`${DEMO_TASK_NAME} failed:`, error);
    return;
  }
  console.log(`${DEMO_TASK_NAME} received:`, data);
});

/**
 * @symbiote-native/task-manager + background-fetch + background-task canary demo, in three
 * sections on one screen (same multi-section shape as FileSystemScreen's legacy/modern split):
 * the low-level task-manager primitive (define/register-status/unregister), the deprecated
 * periodic-fetch API, and its modern BGTaskScheduler/WorkManager replacement. All three register
 * the SAME demo task, defined once at module scope. No Angular service wrapper exists for any of
 * these packages — every export is a plain async function.
 */
@Component({
  selector: 'BackgroundTasksScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="background-tasks-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Background Tasks</text>
            <text testID="background-tasks-hero" class="hero-body">
              @symbiote-native/task-manager, background-fetch, and
              background-task — define, register, and inspect background work,
              all sharing one demo task.
            </text>
          </view>
        </view>

        <text class="menu-eyebrow">TASK MANAGER</text>
        <view
          testID="background-task-manager-status-card"
          class="capability-card"
        >
          <text class="capability-card-title">Registered tasks</text>
          <view class="button-row">
            <ActionButton
              testID="background-task-manager-check-registered"
              title="Is registered?"
              (press)="checkTaskRegistered()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="background-task-manager-load-registered"
              title="List registered"
              (press)="loadRegisteredTasks()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="background-task-manager-unregister"
              title="Unregister"
              (press)="unregisterDemoTask()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="background-task-manager-status" class="value-text">{{
            taskManagerStatusLabel()
          }}</text>
        </view>

        <text class="menu-eyebrow">BACKGROUND FETCH (deprecated upstream)</text>
        <view testID="background-fetch-card" class="capability-card">
          <text class="capability-card-title">Periodic fetch</text>
          <view class="button-row">
            <ActionButton
              testID="background-fetch-register"
              title="Register"
              (press)="registerFetchTask()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="background-fetch-unregister"
              title="Unregister"
              (press)="unregisterFetchTask()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="background-fetch-refresh-status"
              title="Refresh status"
              (press)="refreshFetchStatus()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="background-fetch-set-min-interval"
              title="Set min interval"
              (press)="applyFetchMinimumInterval()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="background-fetch-status" class="value-text">{{
            fetchStatusLabel()
          }}</text>
        </view>

        <text class="menu-eyebrow">BACKGROUND TASK</text>
        <view testID="background-task-card" class="capability-card">
          <text class="capability-card-title">Scheduled work</text>
          <view class="button-row">
            <ActionButton
              testID="background-task-register"
              title="Register"
              (press)="registerBackgroundTask()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="background-task-unregister"
              title="Unregister"
              (press)="unregisterBackgroundTask()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="background-task-refresh-status"
              title="Refresh status"
              (press)="refreshTaskStatus()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="background-task-trigger-for-testing"
              title="Trigger for testing"
              (press)="triggerForTesting()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="background-task-status" class="value-text">{{
            taskStatusLabel()
          }}</text>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class BackgroundTasksScreen implements OnInit {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.BackgroundTasks];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  // Mount-time probes — every other screen in this canary shows real status on first render
  // instead of a placeholder the user has to tap a button to resolve.
  ngOnInit(): void {
    void this.checkTaskRegistered();
    void this.refreshFetchStatus();
    void this.refreshTaskStatus();
  }

  // --- task manager ---
  private readonly isRegistered = signal<boolean | null>(null);
  private readonly registeredTasks = signal<ITaskManagerTask[] | null>(null);
  private readonly taskManagerError = signal<string | null>(null);

  async checkTaskRegistered(): Promise<void> {
    try {
      this.isRegistered.set(await isTaskRegisteredAsync(DEMO_TASK_NAME));
      this.taskManagerError.set(null);
    } catch (error) {
      this.taskManagerError.set(errorMessage(error));
    }
  }

  async loadRegisteredTasks(): Promise<void> {
    try {
      this.registeredTasks.set(await getRegisteredTasksAsync());
      this.taskManagerError.set(null);
    } catch (error) {
      this.taskManagerError.set(errorMessage(error));
    }
  }

  async unregisterDemoTask(): Promise<void> {
    try {
      await unregisterFromTaskManagerAsync(DEMO_TASK_NAME);
      this.isRegistered.set(false);
      this.taskManagerError.set(null);
    } catch (error) {
      this.taskManagerError.set(errorMessage(error));
    }
  }

  taskManagerStatusLabel(): string {
    const error = this.taskManagerError();
    if (error) return error;
    const registered = this.isRegistered();
    const tasks = this.registeredTasks();
    const parts: string[] = [];
    if (registered !== null) parts.push(`registered: ${registered}`);
    parts.push(
      tasks
        ? `${tasks.length} tasks: ${
            tasks.map(task => task.taskName).join(', ') || '—'
          }`
        : 'not loaded yet',
    );
    return parts.join(' · ');
  }

  // --- background fetch ---
  private readonly fetchStatus = signal<BackgroundFetchStatus | null>(null);
  private readonly fetchError = signal<string | null>(null);

  async registerFetchTask(): Promise<void> {
    try {
      await registerBackgroundFetchTaskAsync(DEMO_TASK_NAME, {
        minimumInterval: FETCH_MIN_INTERVAL_SECONDS,
      });
      this.fetchError.set(null);
    } catch (error) {
      this.fetchError.set(errorMessage(error));
    }
    await this.checkTaskRegistered();
  }

  async unregisterFetchTask(): Promise<void> {
    try {
      await unregisterBackgroundFetchTaskAsync(DEMO_TASK_NAME);
      this.fetchError.set(null);
    } catch (error) {
      this.fetchError.set(errorMessage(error));
    }
    await this.checkTaskRegistered();
  }

  async refreshFetchStatus(): Promise<void> {
    try {
      this.fetchStatus.set(await getBackgroundFetchStatusAsync());
      this.fetchError.set(null);
    } catch (error) {
      this.fetchError.set(errorMessage(error));
    }
  }

  async applyFetchMinimumInterval(): Promise<void> {
    try {
      await setMinimumIntervalAsync(FETCH_MIN_INTERVAL_SECONDS);
      this.fetchError.set(null);
    } catch (error) {
      this.fetchError.set(errorMessage(error));
    }
  }

  fetchStatusLabel(): string {
    const error = this.fetchError();
    if (error) return error;
    const status = this.fetchStatus();
    return status === null ? 'not loaded yet' : String(status);
  }

  // --- background task ---
  private readonly taskStatus = signal<BackgroundTaskStatus | null>(null);
  private readonly taskError = signal<string | null>(null);
  private readonly triggerResult = signal<boolean | null>(null);

  async registerBackgroundTask(): Promise<void> {
    try {
      await registerBackgroundTaskAsync(DEMO_TASK_NAME, {
        minimumInterval: TASK_MIN_INTERVAL_MINUTES,
      });
      this.taskError.set(null);
    } catch (error) {
      this.taskError.set(errorMessage(error));
    }
    await this.checkTaskRegistered();
  }

  async unregisterBackgroundTask(): Promise<void> {
    try {
      await unregisterBackgroundTaskAsync(DEMO_TASK_NAME);
      this.taskError.set(null);
    } catch (error) {
      this.taskError.set(errorMessage(error));
    }
    await this.checkTaskRegistered();
  }

  async refreshTaskStatus(): Promise<void> {
    try {
      this.taskStatus.set(await getBackgroundTaskStatusAsync());
      this.taskError.set(null);
    } catch (error) {
      this.taskError.set(errorMessage(error));
    }
  }

  async triggerForTesting(): Promise<void> {
    try {
      this.triggerResult.set(await triggerTaskWorkerForTestingAsync());
      this.taskError.set(null);
    } catch (error) {
      this.taskError.set(errorMessage(error));
    }
  }

  taskStatusLabel(): string {
    const error = this.taskError();
    if (error) return error;
    const status = this.taskStatus();
    const triggered = this.triggerResult();
    const parts: string[] = [
      status === null ? 'status: not loaded yet' : `status: ${status}`,
    ];
    if (triggered !== null) parts.push(`triggered: ${triggered}`);
    return parts.join(' · ');
  }
}
