import type { ReactNode } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

// A mid slate stays clearly off beside the lime without vanishing into the button fill
const OFF_TINT = '#8ea3c6';

type IToggleProps = {
  label: string;
  active: boolean;
  onToggle: () => void;
  testID: string;
};

export function Toggle({ label, active, onToggle, testID }: IToggleProps) {
  return (
    <ActionButton
      testID={testID}
      title={`${label} — ${active ? 'on' : 'off'}`}
      color={active ? LINE_COLOR.styling : OFF_TINT}
      onPress={onToggle}
    />
  );
}

type ITileProps = {
  label: string;
  caption: string;
  children: ReactNode;
};

export function Tile({ label, caption, children }: ITileProps) {
  return (
    <view className="sc-pair-half">
      <text className="sc-tile-label">{label}</text>
      {children}
      <text className="sc-tile-caption">{caption}</text>
    </view>
  );
}

// Written out, not hidden in a helper, since the readout under each dynamic tile prints this string
export function classList(
  base: string,
  modifiers: Record<string, boolean>,
): string {
  const on = Object.keys(modifiers).filter(name => modifiers[name]);
  return [base, ...on].join(' ');
}
