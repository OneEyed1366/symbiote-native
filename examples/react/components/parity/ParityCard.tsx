import { useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from '@symbiote-native/react';
import { LINE_COLOR, NAV_LINE } from '../../navigation-lines';
import { ActionButton } from '../ActionButton';

export const VERDICT = {
  pass: 'pass',
  fail: 'fail',
  look: 'look',
} as const;

export type IParityVerdict = (typeof VERDICT)[keyof typeof VERDICT];

export type IProbeResult = {
  isOk: boolean;
  detail: string;
};

type IParityCardProps = {
  title: string;
  // What stock React Native does, the line the check is held against
  rn: string;
  // What the eye or the ear has to confirm, or what the badge reads
  look: string;
  verdict?: IParityVerdict;
  children?: ReactNode;
};

const VERDICT_LABEL: Record<IParityVerdict, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  look: 'LOOK',
};

export const PARITY_COLOR = LINE_COLOR[NAV_LINE.Introspection];

// Cards whose behavior only an Android device can show are not mounted elsewhere
export const isAndroid = Platform.select({ android: true, default: false });

export function ParityCard({
  title,
  rn,
  look,
  verdict = VERDICT.look,
  children,
}: IParityCardProps) {
  return (
    <view className="parity-card">
      <view className="parity-card-head">
        <text className="parity-card-title">{title}</text>
        <view className={`parity-badge parity-badge-${verdict}`}>
          <text className="parity-badge-text">{VERDICT_LABEL[verdict]}</text>
        </view>
      </view>
      <text className="parity-rn">{`RN: ${rn}`}</text>
      <text className="parity-look">{`Check: ${look}`}</text>
      {children}
    </view>
  );
}

// A thrown error is a FAIL with its own message, never a red box over the whole screen
function runGuarded(run: () => IProbeResult): IProbeResult {
  try {
    return run();
  } catch (error) {
    return { isOk: false, detail: `threw: ${String(error)}` };
  }
}

function verdictOf(result: IProbeResult | null): IParityVerdict {
  if (result === null) return VERDICT.look;
  return result.isOk ? VERDICT.pass : VERDICT.fail;
}

type IParityProbeProps = {
  title: string;
  rn: string;
  run: () => IProbeResult;
};

// A check the code answers itself: tap Run, the badge reads PASS or FAIL
export function ParityProbe({ title, rn, run }: IParityProbeProps) {
  const [result, setResult] = useState<IProbeResult | null>(null);
  const verdict = verdictOf(result);
  return (
    <ParityCard
      title={title}
      rn={rn}
      look="tap Run, the badge turns PASS"
      verdict={verdict}
    >
      <ActionButton
        title="Run"
        color={PARITY_COLOR}
        onPress={() => setResult(runGuarded(run))}
      />
      {result !== null && <text className="parity-detail">{result.detail}</text>}
    </ParityCard>
  );
}
