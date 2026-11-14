import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const OFF_TINT = '#41506a';

type IToggleProps = {
  label: string;
  active: boolean;
  onToggle: () => void;
  testID: string;
};

export function Toggle(props: IToggleProps) {
  return (
    <ActionButton
      testID={props.testID}
      title={`${props.label} — ${props.active ? 'on' : 'off'}`}
      color={props.active ? LINE_COLOR.styling : OFF_TINT}
      onPress={() => props.onToggle()}
    />
  );
}

type ITileProps = {
  label: string;
  caption: string;
  children?: JSX.Element;
};

export function Tile(props: ITileProps) {
  return (
    <view class="sc-pair-half">
      <text class="sc-tile-label">{props.label}</text>
      {props.children}
      <text class="sc-tile-caption">{props.caption}</text>
    </view>
  );
}

// Written out, not hidden in a helper, since the readout under each dynamic tile prints this string
// Unrelated to Solid's DOM-only `classList` prop, the engine takes one merged string via `class`
export function classList(
  base: string,
  modifiers: Record<string, boolean>,
): string {
  const on = Object.keys(modifiers).filter(name => modifiers[name]);
  return [base, ...on].join(' ');
}
