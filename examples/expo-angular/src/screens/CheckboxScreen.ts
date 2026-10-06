import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { LabeledCheckbox } from './LabeledCheckbox';

const ROUTE = ROUTE_NAME.Checkbox;
const TASKS = [
  'Pack the charger',
  'Book the taxi',
  'Print the tickets',
  'Check the weather',
];
const TERMS_STEPS = [
  'Press Create account before ticking anything',
  'Tick only the newsletter box and press again',
  'Tick the terms box and press once more',
];
const CHECKLIST_STEPS = [
  'Tick two tasks one by one',
  'Press Select all, then untick one task',
  'Untick everything with the same parent box',
];

@Component({
  selector: 'CheckboxScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    LabeledCheckbox,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="checkbox-scroll"
      title="Checkbox"
      body="A native-looking checkbox for consent forms, checklists and bulk selection. It is a plain primitive: no extra package, no native setup. There is no indeterminate state, as upstream."
    >
      <Scenario
        testID="checkbox-terms-scenario"
        title="Block sign-up until the terms are accepted"
        why="Terms, privacy and marketing consents are the most common checkbox use. The required one gates the submit action, the optional one never does."
        [steps]="termsSteps"
        expect="The first two presses are refused with a message, the third creates the account. The newsletter box never changes the outcome."
      >
        <LabeledCheckbox
          testID="checkbox-terms"
          label="I accept the terms of service (required)"
          [value]="isTermsAccepted()"
          (changed)="isTermsAccepted.set($event)"
          [color]="color"
        />
        <LabeledCheckbox
          testID="checkbox-newsletter"
          label="Send me product news (optional)"
          [value]="isNewsletterAccepted()"
          (changed)="isNewsletterAccepted.set($event)"
          [color]="color"
        />
        <ActionButton
          testID="checkbox-submit"
          title="Create account"
          [color]="color"
          (press)="submit()"
        />
        <ResultRow
          testID="checkbox-submit-status"
          label="Result"
          [value]="status()"
        />
      </Scenario>

      <Scenario
        testID="checkbox-checklist-scenario"
        title="Tick off a checklist with a select-all box"
        why="To-do lists, bulk selection in inboxes and settings screens keep many boxes in sync with one parent box and a counter."
        [steps]="checklistSteps"
        expect="The counter follows every change. The parent box is ticked only while all four tasks are done."
      >
        <LabeledCheckbox
          testID="checkbox-select-all"
          label="Select all"
          [value]="allDone()"
          [color]="color"
          (changed)="selectAll($event)"
        />
        @for (task of tasks; track task; let index = $index) {
          <LabeledCheckbox
            [testID]="'checkbox-task-' + index"
            [label]="task"
            [value]="done().has(task)"
            [color]="color"
            (changed)="toggle(task, $event)"
          />
        }
        <ResultRow
          testID="checkbox-checklist-summary"
          label="Progress"
          [value]="summary()"
        />
      </Scenario>

      <Card testID="checkbox-states-card" title="States and colors">
        <LabeledCheckbox
          testID="checkbox-state-default"
          label="Default color, ticked"
          [value]="true"
          [disabled]="true"
        />
        <LabeledCheckbox
          testID="checkbox-state-red"
          label="Custom color #ef4444"
          [value]="true"
          color="#ef4444"
          [disabled]="true"
        />
        <LabeledCheckbox
          testID="checkbox-state-unchecked"
          label="Unticked"
          [value]="false"
          [disabled]="true"
        />
        <LabeledCheckbox
          testID="checkbox-state-disabled-on"
          label="Disabled and ticked: greyed out"
          [value]="true"
          [disabled]="true"
        />
        <LabeledCheckbox
          testID="checkbox-state-disabled-off"
          label="Disabled and unticked"
          [value]="false"
          [disabled]="true"
        />
        <view class="capability-row">
          <text class="capability-label">Plan is locked by an admin</text>
          <ActionButton
            testID="checkbox-state-lock-toggle"
            [title]="lockButtonTitle()"
            [color]="color"
            (press)="isLocked.set(!isLocked())"
          />
        </view>
        <LabeledCheckbox
          testID="checkbox-state-locked"
          [label]="lockedLabel()"
          [value]="true"
          [disabled]="isLocked()"
        />
      </Card>
    </ScreenShell>
  `,
})
export class CheckboxScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly tasks = TASKS;
  readonly termsSteps = TERMS_STEPS;
  readonly checklistSteps = CHECKLIST_STEPS;

  readonly isTermsAccepted = signal(false);
  readonly isNewsletterAccepted = signal(false);
  readonly status = signal('not submitted');

  readonly done = signal<ReadonlySet<string>>(new Set());
  readonly allDone = computed(() => this.done().size === TASKS.length);
  readonly summary = computed(
    () => `${this.done().size} of ${TASKS.length} done`,
  );

  readonly isLocked = signal(true);
  readonly lockedLabel = computed(() =>
    this.isLocked() ? 'Premium plan (locked)' : 'Premium plan (editable)',
  );
  readonly lockButtonTitle = computed(() =>
    this.isLocked() ? 'Unlock' : 'Lock',
  );

  submit(): void {
    this.status.set(
      this.isTermsAccepted()
        ? `account created, newsletter ${this.isNewsletterAccepted() ? 'on' : 'off'}`
        : 'refused: accept the terms first',
    );
  }

  selectAll(isChecked: boolean): void {
    this.done.set(isChecked ? new Set(TASKS) : new Set());
  }

  toggle(task: string, isChecked: boolean): void {
    const next = new Set(this.done());
    if (isChecked) {
      next.add(task);
    } else {
      next.delete(task);
    }
    this.done.set(next);
  }
}
