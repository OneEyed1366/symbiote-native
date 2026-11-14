import { defineComponent } from 'vue';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const OFF_TINT = '#41506a';

type IToggleProps = {
  label: string;
  active: boolean;
  onToggle: () => void;
  testID: string;
};

export const Toggle = defineComponent<IToggleProps>(
  props => {
    return () => (
      <ActionButton
        testID={props.testID}
        title={`${props.label} — ${props.active ? 'on' : 'off'}`}
        color={props.active ? LINE_COLOR.styling : OFF_TINT}
        onPress={props.onToggle}
      />
    );
  },
  { name: 'Toggle', props: ['label', 'active', 'onToggle', 'testID'] },
);

type ITileProps = {
  label: string;
  caption: string;
};

// React's `children` arrives as Vue's default slot, so the props type stops at the two strings
export const Tile = defineComponent<ITileProps>(
  (props, { slots }) => {
    return () => (
      <view class="sc-pair-half">
        <text class="sc-tile-label">{props.label}</text>
        {slots.default?.()}
        <text class="sc-tile-caption">{props.caption}</text>
      </view>
    );
  },
  { name: 'Tile', props: ['label', 'caption'] },
);

// Written out, not hidden in a helper, since the readout under each dynamic tile prints this string
export function classList(
  base: string,
  modifiers: Record<string, boolean>,
): string {
  const on = Object.keys(modifiers).filter(name => modifiers[name]);
  return [base, ...on].join(' ');
}
