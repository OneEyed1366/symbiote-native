import { For, Show, createSignal } from 'solid-js';
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
export function CallConsole(props: ICallConsoleProps) {
  const [output, setOutput] = createSignal('no call yet');

  const invoke = (call: ICall) => {
    setOutput(`${call.label}…`);
    Promise.resolve()
      .then(call.run)
      .then(value => setOutput(`${call.label} ->\n${summarize(value)}`))
      .catch((error: Error) =>
        setOutput(`${call.label} failed: ${error.message}`),
      );
  };

  const body = () => (
    <>
      <Show when={props.hint !== undefined}>
        <text class="info-text">{props.hint}</text>
      </Show>
      <view class="button-row">
        <For each={props.calls}>
          {call => (
            <ActionButton
              testID={`${props.prefix}-${slug(call.label)}`}
              title={call.label}
              onPress={() => invoke(call)}
              color={props.color}
            />
          )}
        </For>
      </view>
      <text testID={`${props.prefix}-output`} class="info-text">
        {output()}
      </text>
    </>
  );

  return (
    <Show
      when={props.isBare === true}
      fallback={
        <Card testID={`${props.prefix}-card`} title={props.title}>
          {body()}
        </Card>
      }
    >
      <view testID={`${props.prefix}-card`} class="console-bare">
        {body()}
      </view>
    </Show>
  );
}
