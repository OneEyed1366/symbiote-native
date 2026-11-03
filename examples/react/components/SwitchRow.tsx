import { TRACK_OFF } from '../screens/canary-shared';

type ISwitchRowProps = {
  testID: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color: string;
};

// Label on the left, native switch on the right, tinted by the caller's line colour
export function SwitchRow({
  testID,
  label,
  value,
  onChange,
  color,
}: ISwitchRowProps) {
  return (
    <view className="switch-row">
      <text className="switch-row-label">{label}</text>
      <switch
        testID={testID}
        value={value}
        onValueChange={event => onChange(event.value)}
        trackColor={{ false: TRACK_OFF, true: color }}
      />
    </view>
  );
}
