import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {
  isAvailableAsync,
  useKeepAwake,
} from '@symbiote-native/keep-awake/vue';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

// `useKeepAwake` has no on/off switch, it holds the lock while its component is mounted
// so mounting and unmounting this child is what turns the lock on and off
const KeepAwakeHolder = defineComponent(
  () => {
    useKeepAwake();
    return () => null;
  },
  { name: 'KeepAwakeHolder' },
);

export const KeepAwakeScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
    const lineColor = LINE_COLOR[lineInfo.line];

    const isKeepAwakeOn = ref(false);
    const isAvailable: Ref<boolean | null> = ref(null);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    onMounted(() => {
      isAvailableAsync().then(value => {
        if (isMounted) isAvailable.value = value;
      });
    });

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="keep-awake-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view class="hero-badge" style={{ backgroundColor: lineColor }}>
              <text class="hero-badge-text">{lineInfo.code}</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">Keep Awake</text>
              <text class="hero-body">
                Stop the screen from dimming and locking while a component is
                mounted, for a recipe, a workout timer, a video or a boarding
                pass.
              </text>
            </view>
          </view>

          <Scenario
            testID="keep-awake-scenario"
            title="Keep the screen on while someone follows a recipe or a workout"
            why="Hands that are busy cannot tap the screen to wake it. The lock lives exactly as long as the component that asked for it, so it cannot be left on by mistake."
            steps={['Turn the switch on', 'Put the phone down and wait past the auto-lock time', 'Turn the switch off and wait again']}
            expect="With the switch on the screen stays lit, and with it off the phone dims and locks after its normal timeout."
          />

          <view testID="keep-awake-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Keep screen awake</text>
            </view>
            <ValueRow
              label="Available"
              value={
                isAvailable.value === null
                  ? 'checking…'
                  : isAvailable.value
                    ? 'Yes'
                    : 'No'
              }
            />
            <view testID="keep-awake-toggle-row" class="capability-row">
              <text class="capability-label">Keep screen awake</text>
              <switch
                testID="keep-awake-switch"
                value={isKeepAwakeOn.value}
                onValueChange={event => {
                  isKeepAwakeOn.value = event.value;
                }}
                trackColor={{ true: lineColor }}
              />
            </view>
            {isKeepAwakeOn.value ? <KeepAwakeHolder /> : null}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'KeepAwakeScreen' },
);
