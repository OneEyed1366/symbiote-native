import { For, Show, createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import { ActionButton } from './ActionButton';

type IScenarioProps = {
  testID: string;
  title: string;
  why: string;
  steps: readonly string[];
  expect: string;
  children?: JSX.Element;
};

// One user task: what it is for, what to do on the device, what must be seen afterwards
export function Scenario(props: IScenarioProps) {
  return (
    <view testID={props.testID} class="scenario-card">
      <text class="scenario-title">{props.title}</text>
      <text class="scenario-why">{props.why}</text>
      <view class="scenario-steps">
        <For each={props.steps}>
          {(step, index) => <text class="scenario-step">{`${index() + 1}. ${step}`}</text>}
        </For>
      </view>
      {props.children}
      <view class="scenario-expect">
        <text class="scenario-expect-label">Expected</text>
        <text class="scenario-expect-text">{props.expect}</text>
      </view>
    </view>
  );
}

type IExplorerProps = { testID: string; color: string; children: JSX.Element };

// Every remaining API call of the package, collapsed so the scenarios above stay the main story
export function Explorer(props: IExplorerProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  return (
    <view testID={props.testID} class="explorer">
      <ActionButton
        testID={`${props.testID}-toggle`}
        title={isOpen() ? 'Hide API explorer' : 'Open API explorer: every call and option'}
        onPress={() => setIsOpen(previous => !previous)}
        color={props.color}
      />
      <Show when={isOpen()}>{props.children}</Show>
    </view>
  );
}
