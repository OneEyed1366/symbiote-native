import { defineComponent, ref } from 'vue';
import { ActionButton } from './ActionButton';
import { Card } from './ScreenShell';

export type ICall = { label: string; run: () => Promise<unknown> };

type ICallConsoleProps = {
  prefix: string;
  title: string;
  calls: readonly ICall[];
  color: string;
  hint?: string;
  // Inside a Scenario card: no own card chrome
  isBare?: boolean;
};

const MAX_OUTPUT_CHARS = 1_200;

function slug(label: string): string {
  return label.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '');
}

export function summarize(value: unknown): string {
  if (value === undefined) {
    return 'undefined (unsupported on this platform, or no result)';
  }
  const text = JSON.stringify(value, null, 1) ?? String(value);
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}… (${text.length} chars)`
    : text;
}

// One button per API call, the shared output line shows the resolved value or the error
export const CallConsole = defineComponent<ICallConsoleProps>(
  props => {
    const output = ref('no call yet');

    const invoke = (call: ICall) => {
      output.value = `${call.label}…`;
      Promise.resolve()
        .then(call.run)
        .then(value => {
          output.value = `${call.label} ->\n${summarize(value)}`;
        })
        .catch((error: Error) => {
          output.value = `${call.label} failed: ${error.message}`;
        });
    };

    const body = () => (
      <>
        {props.hint !== undefined && <text class="info-text">{props.hint}</text>}
        <view class="button-row">
          {props.calls.map(call => (
            <ActionButton
              key={call.label}
              testID={`${props.prefix}-${slug(call.label)}`}
              title={call.label}
              onPress={() => invoke(call)}
              color={props.color}
            />
          ))}
        </view>
        <text testID={`${props.prefix}-output`} class="info-text">
          {output.value}
        </text>
      </>
    );

    return () =>
      props.isBare === true ? (
        <view testID={`${props.prefix}-card`} class="console-bare">
          {body()}
        </view>
      ) : (
        <Card testID={`${props.prefix}-card`} title={props.title}>
          {body()}
        </Card>
      );
  },
  { name: 'CallConsole', props: ['prefix', 'title', 'calls', 'color', 'hint', 'isBare'] },
);
