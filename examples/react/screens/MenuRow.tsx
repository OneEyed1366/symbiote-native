import type { INavLine } from '../navigation-lines';

type IMenuRowProps = {
  testID: string;
  line: INavLine;
  code: string;
  label: string;
  hint: string;
  onPress: () => void;
};

export function MenuRow({
  testID,
  line,
  code,
  label,
  hint,
  onPress,
}: IMenuRowProps) {
  return (
    <pressable
      testID={testID}
      className={`menu-row menu-row-${line}`}
      onPress={onPress}
    >
      <view className={`menu-badge menu-badge-${line}`}>
        <text className="menu-badge-text">{code}</text>
      </view>
      <view className="menu-row-copy">
        <text className="menu-row-label">{label}</text>
        <text className={`menu-row-hint menu-row-hint-${line}`}>{hint}</text>
      </view>
    </pressable>
  );
}
