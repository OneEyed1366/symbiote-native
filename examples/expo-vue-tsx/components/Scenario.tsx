import { defineComponent, ref } from 'vue';
import { ActionButton } from './ActionButton';

type IScenarioProps = {
  testID: string;
  title: string;
  why: string;
  steps: readonly string[];
  expect: string;
};

// One user task: what it is for, what to do on the device, what must be seen afterwards
export const Scenario = defineComponent<IScenarioProps>(
  (props, { slots }) => {
    return () => (
      <view testID={props.testID} class="scenario-card">
        <text class="scenario-title">{props.title}</text>
        <text class="scenario-why">{props.why}</text>
        <view class="scenario-steps">
          {props.steps.map((step, index) => (
            <text key={step} class="scenario-step">{`${index + 1}. ${step}`}</text>
          ))}
        </view>
        {slots.default?.()}
        <view class="scenario-expect">
          <text class="scenario-expect-label">Expected</text>
          <text class="scenario-expect-text">{props.expect}</text>
        </view>
      </view>
    );
  },
  { name: 'Scenario', props: ['testID', 'title', 'why', 'steps', 'expect'] },
);

type IExplorerProps = { testID: string; color: string };

// Every remaining API call of the package, collapsed so the scenarios above stay the main story
export const Explorer = defineComponent<IExplorerProps>(
  (props, { slots }) => {
    const isOpen = ref(false);
    return () => (
      <view testID={props.testID} class="explorer">
        <ActionButton
          testID={`${props.testID}-toggle`}
          title={isOpen.value ? 'Hide API explorer' : 'Open API explorer: every call and option'}
          onPress={() => {
            isOpen.value = !isOpen.value;
          }}
          color={props.color}
        />
        {isOpen.value && slots.default?.()}
      </view>
    );
  },
  { name: 'Explorer', props: ['testID', 'color'] },
);
