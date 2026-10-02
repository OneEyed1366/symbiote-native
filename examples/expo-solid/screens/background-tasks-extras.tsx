import { createSignal } from 'solid-js';
import { addExpirationListener } from '@symbiote-native/background-task';
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
import { Card, Field, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.BackgroundTasks);
const MAX_LOGGED_EVENTS = 6;

export function TaskManagerCalls(props: { taskName: string; setTaskName: (value: string) => void }) {
  return (
    <>
      <Card testID="background-tasks-manager-card" title="Task name">
        <Field testID="background-tasks-name-input" label="task name for the calls below" value={props.taskName} onChange={props.setTaskName} />
      </Card>
      <CallConsole
        prefix="background-tasks-manager"
        title="Task manager calls"
        color={color}
        calls={[
          { label: 'isAvailableAsync', run: () => isAvailableAsync() },
          { label: 'isTaskDefined', run: async () => isTaskDefined(props.taskName) },
          { label: 'isTaskRegisteredAsync', run: () => isTaskRegisteredAsync(props.taskName) },
          { label: 'getTaskOptionsAsync', run: () => getTaskOptionsAsync(props.taskName) },
          { label: 'getRegisteredTasksAsync', run: () => getRegisteredTasksAsync() },
          { label: 'unregisterTaskAsync', run: () => unregisterTaskAsync(props.taskName) },
          { label: 'unregisterAllTasksAsync', run: () => unregisterAllTasksAsync() },
        ]}
      />
    </>
  );
}

export function ExpirationCard() {
  const [isOn, setIsOn] = createSignal(false);
  const [lines, setLines] = createSignal<string[]>([]);
  let subscription: ReturnType<typeof addExpirationListener> | null = null;

  const toggle = (next: boolean) => {
    setIsOn(next);
    if (next) {
      subscription = addExpirationListener(() =>
        setLines(previous => [`expired at ${new Date().toISOString()}`, ...previous].slice(0, MAX_LOGGED_EVENTS)),
      );
    } else {
      subscription?.remove();
      subscription = null;
    }
  };

  return (
    <Card testID="background-tasks-expiration-card" title="addExpirationListener (background-task)">
      <ToggleRow testID="background-tasks-expiration-switch" label="listen for the OS expiring the task" value={isOn()} onChange={toggle} color={color} />
      <text testID="background-tasks-expiration-log" class="info-text">
        {lines().length === 0 ? 'no expiration yet' : lines().join('\n')}
      </text>
    </Card>
  );
}
