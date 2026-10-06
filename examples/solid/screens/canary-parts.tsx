import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

// Hoisted: a component identity that changes per render would remount the dividers on every update
export function MvcpDivider() {
  return <view class="mvcp-divider" />;
}

export function FlexButton(props: { title: string; onPress: () => void }) {
  return (
    <view class="flex1">
      <ActionButton title={props.title} onPress={props.onPress} color={LINE_COLOR.primitives} />
    </view>
  );
}
