import { TRACK_OFF } from '../screens/canary-shared';

type ISwitchRowProps = {
  testID: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color: string;
};

// Label on the left, native switch on the right, tinted by the caller's line colour
export function SwitchRow(props: ISwitchRowProps) {
  return (
    <view class="switch-row">
      <text class="switch-row-label">{props.label}</text>
      <switch
        testID={props.testID}
        value={props.value}
        onValueChange={event => props.onChange(event.value)}
        trackColor={{ false: TRACK_OFF, true: props.color }}
      />
    </view>
  );
}
