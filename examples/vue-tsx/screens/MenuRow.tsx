import type { INavLine } from '../navigation-lines';

type IMenuRowProps = {
  testID: string;
  line: INavLine;
  code: string;
  label: string;
  hint: string;
  onPress: () => void;
};

export function MenuRow(props: IMenuRowProps) {
  return (
    <pressable
      testID={props.testID}
      class={`menu-row menu-row-${props.line}`}
      onPress={props.onPress}
    >
      <view class={`menu-badge menu-badge-${props.line}`}>
        <text class="menu-badge-text">{props.code}</text>
      </view>
      <view class="menu-row-copy">
        <text class="menu-row-label">{props.label}</text>
        <text class={`menu-row-hint menu-row-hint-${props.line}`}>
          {props.hint}
        </text>
      </view>
    </pressable>
  );
}
