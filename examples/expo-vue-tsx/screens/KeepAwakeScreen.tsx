import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import {
  isAvailableAsync,
  useKeepAwake,
} from '@symbiote-native/keep-awake/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

// Holds the keep-awake lock only while mounted — useKeepAwake() activates in onMounted and
// deactivates in onUnmounted, so toggling the parent's `isHeld` ref in/out of the tree is what
// actually acquires/releases the lock (the composable itself has no on/off switch of its own).
const KeepAwakeHolder = defineComponent(
  () => {
    useKeepAwake();
    return () => null;
  },
  { name: 'KeepAwakeHolder' },
);

/**
 * Keep Awake demo: @symbiote-native/keep-awake/vue's useKeepAwake composable — a toggle mounts/
 * unmounts KeepAwakeHolder, which is the only thing actually holding the lock.
 */
export const KeepAwakeScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake].line];

    const isHeld: Ref<boolean> = ref(false);
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

    function handleToggle() {
      isHeld.value = !isHeld.value;
    }

    return () => (
      <safe-area-view class="screen">
        <ScrollView
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
                @symbiote-native/keep-awake — keeps the screen on for as long as
                a component holding useKeepAwake() stays mounted.
              </text>
            </view>
          </view>

          <view testID="keep-awake-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Screen lock</text>
            </view>
            <ValueRow
              label="isAvailableAsync"
              value={
                isAvailable.value === null
                  ? 'checking…'
                  : isAvailable.value
                    ? 'true'
                    : 'false'
              }
            />
            <ValueRow label="Held" value={isHeld.value ? 'true' : 'false'} />
            <ActionButton
              testID="keep-awake-toggle-button"
              title={
                isHeld.value ? 'Release keep-awake' : 'Activate keep-awake'
              }
              onPress={handleToggle}
              color={lineColor}
            />
            {isHeld.value ? <KeepAwakeHolder /> : null}
          </view>
        </ScrollView>
      </safe-area-view>
    );
  },
  { name: 'KeepAwakeScreen' },
);
