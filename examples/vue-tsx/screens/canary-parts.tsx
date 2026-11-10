import { defineComponent } from 'vue';
import { ActionButton } from '../components/ActionButton';
import { ACCENT } from './canary-shared';

// Hoisted: a component identity that changes per render would remount the dividers on every update
export const MvcpDivider = defineComponent({
  name: 'MvcpDivider',
  setup() {
    return () => <view class="mvcp-divider" />;
  },
});

export type IFlexButtonProps = { title: string; onPress: () => void };

export const FlexButton = defineComponent<IFlexButtonProps>(
  props => () => (
    <view class="flex1">
      <ActionButton title={props.title} onPress={props.onPress} color={ACCENT} />
    </view>
  ),
  { name: 'FlexButton', props: ['title', 'onPress'] },
);
