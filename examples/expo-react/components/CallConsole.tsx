import { useState } from 'react';
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
export function CallConsole({
  prefix,
  title,
  calls,
  color,
  hint,
  isBare = false,
}: ICallConsoleProps) {
  const [output, setOutput] = useState('no call yet');

  const invoke = (call: ICall) => {
    setOutput(`${call.label}…`);
    Promise.resolve()
      .then(call.run)
      .then(value => setOutput(`${call.label} ->\n${summarize(value)}`))
      .catch((error: Error) =>
        setOutput(`${call.label} failed: ${error.message}`),
      );
  };

  const body = (
    <>
      {hint !== undefined && <text className="info-text">{hint}</text>}
      <view className="button-row">
        {calls.map(call => (
          <ActionButton
            key={call.label}
            testID={`${prefix}-${slug(call.label)}`}
            title={call.label}
            onPress={() => invoke(call)}
            color={color}
          />
        ))}
      </view>
      <text testID={`${prefix}-output`} className="info-text">
        {output}
      </text>
    </>
  );
  return isBare ? (
    <view testID={`${prefix}-card`} className="console-bare">{body}</view>
  ) : (
    <Card testID={`${prefix}-card`} title={title}>{body}</Card>
  );
}
