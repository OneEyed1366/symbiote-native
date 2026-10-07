import { For, createMemo, createSignal } from 'solid-js';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { Card, ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.Checkbox;

type ILabeledCheckboxProps = {
  testID: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color?: string;
  disabled?: boolean;
};

// The checkbox is itself the touch target, the label beside it is plain text as in expo-checkbox
function LabeledCheckbox(props: ILabeledCheckboxProps) {
  return (
    <view class="capability-row">
      <checkbox
        testID={props.testID}
        value={props.value}
        color={props.color}
        disabled={props.disabled}
        onValueChange={event => props.onChange(event.value)}
      />
      <text class="capability-label">{props.label}</text>
    </view>
  );
}

function TermsScenario(props: { color: string }) {
  const [isTermsAccepted, setIsTermsAccepted] = createSignal(false);
  const [isNewsletterAccepted, setIsNewsletterAccepted] = createSignal(false);
  const [status, setStatus] = createSignal('not submitted');

  return (
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
        value={isTermsAccepted()}
        onChange={setIsTermsAccepted}
        color={props.color}
      />
      <LabeledCheckbox
        testID="checkbox-newsletter"
        label="Send me product news (optional)"
        value={isNewsletterAccepted()}
        onChange={setIsNewsletterAccepted}
        color={props.color}
      />
      <ActionButton
        testID="checkbox-submit"
        title="Create account"
        color={props.color}
        onPress={() =>
          setStatus(
            isTermsAccepted()
              ? `account created, newsletter ${isNewsletterAccepted() ? 'on' : 'off'}`
              : 'refused: accept the terms first',
          )
        }
      />
      <ResultRow testID="checkbox-submit-status" label="Result" value={status()} />
    </Scenario>
  );
}

const TASKS = ['Pack the charger', 'Book the taxi', 'Print the tickets', 'Check the weather'];

function ChecklistScenario(props: { color: string }) {
  const [done, setDone] = createSignal<ReadonlySet<string>>(new Set());
  const allDone = () => done().size === TASKS.length;
  const summary = createMemo(() => `${done().size} of ${TASKS.length} done`);

  const toggle = (task: string, isChecked: boolean) =>
    setDone(previous => {
      const next = new Set(previous);
      if (isChecked) {
        next.add(task);
      } else {
        next.delete(task);
      }
      return next;
    });

  return (
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
        value={allDone()}
        color={props.color}
        onChange={isChecked => setDone(isChecked ? new Set(TASKS) : new Set())}
      />
      <For each={TASKS}>
        {(task, index) => (
          <LabeledCheckbox
            testID={`checkbox-task-${index()}`}
            label={task}
            value={done().has(task)}
            color={props.color}
            onChange={isChecked => toggle(task, isChecked)}
          />
        )}
      </For>
      <ResultRow testID="checkbox-checklist-summary" label="Progress" value={summary()} />
    </Scenario>
  );
}

function StatesCard(props: { color: string }) {
  const [isLocked, setIsLocked] = createSignal(true);
  return (
    <Card testID="checkbox-states-card" title="States and colors">
      <LabeledCheckbox testID="checkbox-state-default" label="Default color, ticked" value onChange={() => {}} disabled />
      <LabeledCheckbox testID="checkbox-state-red" label="Custom color #ef4444" value color="#ef4444" onChange={() => {}} disabled />
      <LabeledCheckbox testID="checkbox-state-unchecked" label="Unticked" value={false} onChange={() => {}} disabled />
      <LabeledCheckbox testID="checkbox-state-disabled-on" label="Disabled and ticked: greyed out" value onChange={() => {}} disabled />
      <LabeledCheckbox testID="checkbox-state-disabled-off" label="Disabled and unticked" value={false} onChange={() => {}} disabled />
      <view class="capability-row">
        <text class="capability-label">Plan is locked by an admin</text>
        <ActionButton
          testID="checkbox-state-lock-toggle"
          title={isLocked() ? 'Unlock' : 'Lock'}
          color={props.color}
          onPress={() => setIsLocked(previous => !previous)}
        />
      </view>
      <LabeledCheckbox
        testID="checkbox-state-locked"
        label={isLocked() ? 'Premium plan (locked)' : 'Premium plan (editable)'}
        value
        onChange={() => {}}
        disabled={isLocked()}
      />
    </Card>
  );
}

export function CheckboxScreen() {
  const color = lineColorOf(ROUTE);
  return (
    <ScreenShell
      route={ROUTE}
      testID="checkbox-scroll"
      title="Checkbox"
      body="A native-looking checkbox for consent forms, checklists and bulk selection. It is a plain primitive: no extra package, no native setup. There is no indeterminate state, as upstream."
    >
      <TermsScenario color={color} />
      <ChecklistScenario color={color} />
      <StatesCard color={color} />
    </ScreenShell>
  );
}
