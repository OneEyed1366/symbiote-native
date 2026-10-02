<script lang="ts">
  import {
    getRegisteredTasksAsync,
    getTaskOptionsAsync,
    isAvailableAsync,
    isTaskDefined,
    isTaskRegisteredAsync,
    unregisterAllTasksAsync,
    unregisterTaskAsync,
  } from '@symbiote-native/task-manager';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { FETCH_TASK_NAME } from './background-tasks-definitions';

  const color = lineColorOf(ROUTE_NAME.BackgroundTasks);

  let taskName = $state(FETCH_TASK_NAME);
</script>

<Card testID="background-tasks-manager-card" title="Task name">
  <Field testID="background-tasks-name-input" label="task name for the calls below" value={taskName} onChange={next => (taskName = next)} />
</Card>
<CallConsole
  prefix="background-tasks-manager"
  title="Task manager calls"
  {color}
  calls={[
    { label: 'isAvailableAsync', run: () => isAvailableAsync() },
    { label: 'isTaskDefined', run: async () => isTaskDefined(taskName) },
    { label: 'isTaskRegisteredAsync', run: () => isTaskRegisteredAsync(taskName) },
    { label: 'getTaskOptionsAsync', run: () => getTaskOptionsAsync(taskName) },
    { label: 'getRegisteredTasksAsync', run: () => getRegisteredTasksAsync() },
    { label: 'unregisterTaskAsync', run: () => unregisterTaskAsync(taskName) },
    { label: 'unregisterAllTasksAsync', run: () => unregisterAllTasksAsync() },
  ]}
/>
