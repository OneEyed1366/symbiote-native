import { Component } from '@angular/core';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { BackgroundExpirationCard } from './BackgroundExpirationCard';
import { BackgroundFetchCard } from './BackgroundFetchCard';
import { BackgroundWorkerScenario } from './BackgroundWorkerScenario';
import { TaskManagerCalls } from './TaskManagerCalls';
import './background-tasks-definitions';

@Component({
  selector: 'BackgroundTasksScreen',
  standalone: true,
  imports: [
    BackgroundExpirationCard,
    BackgroundFetchCard,
    BackgroundWorkerScenario,
    Explorer,
    ScreenShell,
    TaskManagerCalls,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="background-tasks-scroll"
      title="Background Tasks"
      body="Run code while the app is closed: define a task, register it for system-scheduled work and inspect the task registry. Background task is the current API, background fetch is its deprecated predecessor."
    >
      <BackgroundWorkerScenario />
      <Explorer testID="background-tasks-explorer" [color]="color">
        <ng-template>
          <BackgroundFetchCard />
          <TaskManagerCalls />
          <BackgroundExpirationCard />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class BackgroundTasksScreen {
  readonly route = ROUTE_NAME.BackgroundTasks;
  readonly color = lineColorOf(ROUTE_NAME.BackgroundTasks);
}
