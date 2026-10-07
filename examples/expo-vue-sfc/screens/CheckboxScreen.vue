<script setup lang="ts">
import { computed, ref } from 'vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import LabeledCheckbox from './LabeledCheckbox.vue';

const ROUTE = ROUTE_NAME.Checkbox;
const color = lineColorOf(ROUTE);
const TASKS = ['Pack the charger', 'Book the taxi', 'Print the tickets', 'Check the weather'];

const isTermsAccepted = ref(false);
const isNewsletterAccepted = ref(false);
const status = ref('not submitted');

const done = ref<ReadonlySet<string>>(new Set());
const allDone = computed(() => done.value.size === TASKS.length);
const summary = computed(() => `${done.value.size} of ${TASKS.length} done`);

const isLocked = ref(true);
const lockedLabel = computed(() => (isLocked.value ? 'Premium plan (locked)' : 'Premium plan (editable)'));
const lockButtonTitle = computed(() => (isLocked.value ? 'Unlock' : 'Lock'));

function submit(): void {
  status.value = isTermsAccepted.value
    ? `account created, newsletter ${isNewsletterAccepted.value ? 'on' : 'off'}`
    : 'refused: accept the terms first';
}

function toggle(task: string, isChecked: boolean): void {
  const next = new Set(done.value);
  if (isChecked) {
    next.add(task);
  } else {
    next.delete(task);
  }
  done.value = next;
}

function noop(): void {}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="checkbox-scroll"
    title="Checkbox"
    body="A native-looking checkbox for consent forms, checklists and bulk selection. It is a plain primitive: no extra package, no native setup. There is no indeterminate state, as upstream."
  >
    <Scenario
      testID="checkbox-terms-scenario"
      title="Block sign-up until the terms are accepted"
      why="Terms, privacy and marketing consents are the most common checkbox use. The required one gates the submit action, the optional one never does."
      :steps="[
        'Press Create account before ticking anything',
        'Tick only the newsletter box and press again',
        'Tick the terms box and press once more',
      ]"
      expect="The first two presses are refused with a message, the third creates the account. The newsletter box never changes the outcome."
    >
      <LabeledCheckbox
        testID="checkbox-terms"
        label="I accept the terms of service (required)"
        :value="isTermsAccepted"
        @change="value => (isTermsAccepted = value)"
        :color="color"
      />
      <LabeledCheckbox
        testID="checkbox-newsletter"
        label="Send me product news (optional)"
        :value="isNewsletterAccepted"
        @change="value => (isNewsletterAccepted = value)"
        :color="color"
      />
      <ActionButton
        testID="checkbox-submit"
        title="Create account"
        :color="color"
        @press="submit"
      />
      <ResultRow
        testID="checkbox-submit-status"
        label="Result"
        :value="status"
      />
    </Scenario>

    <Scenario
      testID="checkbox-checklist-scenario"
      title="Tick off a checklist with a select-all box"
      why="To-do lists, bulk selection in inboxes and settings screens keep many boxes in sync with one parent box and a counter."
      :steps="[
        'Tick two tasks one by one',
        'Press Select all, then untick one task',
        'Untick everything with the same parent box',
      ]"
      expect="The counter follows every change. The parent box is ticked only while all four tasks are done."
    >
      <LabeledCheckbox
        testID="checkbox-select-all"
        label="Select all"
        :value="allDone"
        :color="color"
        @change="isChecked => (done = isChecked ? new Set(TASKS) : new Set())"
      />
      <LabeledCheckbox
        v-for="(task, index) in TASKS"
        :key="task"
        :testID="`checkbox-task-${index}`"
        :label="task"
        :value="done.has(task)"
        :color="color"
        @change="isChecked => toggle(task, isChecked)"
      />
      <ResultRow
        testID="checkbox-checklist-summary"
        label="Progress"
        :value="summary"
      />
    </Scenario>

    <Card
      testID="checkbox-states-card"
      title="States and colors"
    >
      <LabeledCheckbox testID="checkbox-state-default" label="Default color, ticked" :value="true" @change="noop" disabled />
      <LabeledCheckbox testID="checkbox-state-red" label="Custom color #ef4444" :value="true" color="#ef4444" @change="noop" disabled />
      <LabeledCheckbox testID="checkbox-state-unchecked" label="Unticked" :value="false" @change="noop" disabled />
      <LabeledCheckbox testID="checkbox-state-disabled-on" label="Disabled and ticked: greyed out" :value="true" @change="noop" disabled />
      <LabeledCheckbox testID="checkbox-state-disabled-off" label="Disabled and unticked" :value="false" @change="noop" disabled />
      <view class="capability-row">
        <text class="capability-label">
          Plan is locked by an admin
        </text>
        <ActionButton
          testID="checkbox-state-lock-toggle"
          :title="lockButtonTitle"
          :color="color"
          @press="() => (isLocked = !isLocked)"
        />
      </view>
      <LabeledCheckbox
        testID="checkbox-state-locked"
        :label="lockedLabel"
        :value="true"
        @change="noop"
        :disabled="isLocked"
      />
    </Card>
  </ScreenShell>
</template>
