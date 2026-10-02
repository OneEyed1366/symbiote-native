import { Component, signal } from '@angular/core';
import {
  getRegisteredTasksAsync,
  getTaskOptionsAsync,
  isAvailableAsync,
  isTaskDefined,
  isTaskRegisteredAsync,
  unregisterAllTasksAsync,
  unregisterTaskAsync,
} from '@symbiote-native/task-manager';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { FETCH_TASK_NAME } from './background-tasks-definitions';

@Component({
  selector: 'TaskManagerCalls',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="background-tasks-manager-card" title="Task name">
      <Field
        testID="background-tasks-name-input"
        label="task name for the calls below"
        [(value)]="taskName"
      />
    </Card>
    <CallConsole
      prefix="background-tasks-manager"
      title="Task manager calls"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class TaskManagerCalls {
  readonly color = lineColorOf(ROUTE_NAME.BackgroundTasks);
  readonly taskName = signal(FETCH_TASK_NAME);

  readonly calls = [
    { label: 'isAvailableAsync', run: () => isAvailableAsync() },
    { label: 'isTaskDefined', run: async () => isTaskDefined(this.taskName()) },
    {
      label: 'isTaskRegisteredAsync',
      run: () => isTaskRegisteredAsync(this.taskName()),
    },
    {
      label: 'getTaskOptionsAsync',
      run: () => getTaskOptionsAsync(this.taskName()),
    },
    { label: 'getRegisteredTasksAsync', run: () => getRegisteredTasksAsync() },
    {
      label: 'unregisterTaskAsync',
      run: () => unregisterTaskAsync(this.taskName()),
    },
    { label: 'unregisterAllTasksAsync', run: () => unregisterAllTasksAsync() },
  ];
}
