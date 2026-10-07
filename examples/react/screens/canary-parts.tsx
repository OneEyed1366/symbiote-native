import type { ReactElement } from 'react';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

// Hoisted: a component identity that changes per render would remount the dividers on every update
export const MvcpDivider = (): ReactElement => <view className="mvcp-divider" />;

export function FlexButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <view className="flex1">
      <ActionButton title={title} onPress={onPress} color={LINE_COLOR.primitives} />
    </view>
  );
}
