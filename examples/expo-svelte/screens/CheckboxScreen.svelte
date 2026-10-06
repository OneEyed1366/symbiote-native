<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import LabeledCheckbox from './LabeledCheckbox.svelte';

  const ROUTE = ROUTE_NAME.Checkbox;
  const color = lineColorOf(ROUTE);
  const TASKS = ['Pack the charger', 'Book the taxi', 'Print the tickets', 'Check the weather'];

  let isTermsAccepted = $state(false);
  let isNewsletterAccepted = $state(false);
  let status = $state('not submitted');

  let done = $state<ReadonlySet<string>>(new Set());
  const allDone = $derived(done.size === TASKS.length);
  const summary = $derived(`${done.size} of ${TASKS.length} done`);

  let isLocked = $state(true);

  function submit(): void {
    status = isTermsAccepted
      ? `account created, newsletter ${isNewsletterAccepted ? 'on' : 'off'}`
      : 'refused: accept the terms first';
  }

  function toggle(task: string, isChecked: boolean): void {
    const next = new Set(done);
    if (isChecked) {
      next.add(task);
    } else {
      next.delete(task);
    }
    done = next;
  }

  function noop(): void {}
</script>

<ScreenShell
  route={ROUTE}
  testID="checkbox-scroll"
  title="Checkbox"
  body="A native-looking checkbox for consent forms, checklists and bulk selection. It is a plain primitive: no extra package, no native setup. There is no indeterminate state, as upstream."
>
  <Scenario
    testID="checkbox-terms-scenario"
    title="Block sign-up until the terms are accepted"
    why="Terms, privacy and marketing consents are the most common checkbox use. The required one gates the submit action, the optional one never does."
    steps={[
      'Press Create account before ticking anything',
      'Tick only the newsletter box and press again',
      'Tick the terms box and press once more',
    ]}
    expect="The first two presses are refused with a message, the third creates the account. The newsletter box never changes the outcome."
  >
    <LabeledCheckbox
      testID="checkbox-terms"
      label="I accept the terms of service (required)"
      value={isTermsAccepted}
      onChange={value => (isTermsAccepted = value)}
      {color}
    />
    <LabeledCheckbox
      testID="checkbox-newsletter"
      label="Send me product news (optional)"
      value={isNewsletterAccepted}
      onChange={value => (isNewsletterAccepted = value)}
      {color}
    />
    <ActionButton testID="checkbox-submit" title="Create account" {color} onPress={submit} />
    <ResultRow testID="checkbox-submit-status" label="Result" value={status} />
  </Scenario>

  <Scenario
    testID="checkbox-checklist-scenario"
    title="Tick off a checklist with a select-all box"
    why="To-do lists, bulk selection in inboxes and settings screens keep many boxes in sync with one parent box and a counter."
    steps={[
      'Tick two tasks one by one',
      'Press Select all, then untick one task',
      'Untick everything with the same parent box',
    ]}
    expect="The counter follows every change. The parent box is ticked only while all four tasks are done."
  >
    <LabeledCheckbox
      testID="checkbox-select-all"
      label="Select all"
      value={allDone}
      {color}
      onChange={isChecked => (done = isChecked ? new Set(TASKS) : new Set())}
    />
    {#each TASKS as task, index (task)}
      <LabeledCheckbox
        testID={`checkbox-task-${index}`}
        label={task}
        value={done.has(task)}
        {color}
        onChange={isChecked => toggle(task, isChecked)}
      />
    {/each}
    <ResultRow testID="checkbox-checklist-summary" label="Progress" value={summary} />
  </Scenario>

  <Card testID="checkbox-states-card" title="States and colors">
    <LabeledCheckbox testID="checkbox-state-default" label="Default color, ticked" value onChange={noop} disabled />
    <LabeledCheckbox testID="checkbox-state-red" label="Custom color #ef4444" value color="#ef4444" onChange={noop} disabled />
    <LabeledCheckbox testID="checkbox-state-unchecked" label="Unticked" value={false} onChange={noop} disabled />
    <LabeledCheckbox testID="checkbox-state-disabled-on" label="Disabled and ticked: greyed out" value onChange={noop} disabled />
    <LabeledCheckbox testID="checkbox-state-disabled-off" label="Disabled and unticked" value={false} onChange={noop} disabled />
    <view class="capability-row">
      <text class="capability-label">Plan is locked by an admin</text>
      <ActionButton
        testID="checkbox-state-lock-toggle"
        title={isLocked ? 'Unlock' : 'Lock'}
        {color}
        onPress={() => (isLocked = !isLocked)}
      />
    </view>
    <LabeledCheckbox
      testID="checkbox-state-locked"
      label={isLocked ? 'Premium plan (locked)' : 'Premium plan (editable)'}
      value
      onChange={noop}
      disabled={isLocked}
    />
  </Card>
</ScreenShell>
