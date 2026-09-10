import { Show, createSignal } from 'solid-js';
import { ScrollView } from '@symbiote-native/solid';
import { isAvailableAsync } from '@symbiote-native/keep-awake';
import { createKeepAwake } from '@symbiote-native/keep-awake/solid';
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

// createKeepAwake() has no on/off param - it activates for as long as its owner is alive and
// deactivates in onCleanup when that owner is disposed. Mounting/unmounting THIS child (via
// <Show> below) is what turns the lock on and off, mirroring upstream's own "call the hook only
// while you want the screen awake" idiom.
function KeepAwakeHolder() {
  createKeepAwake();
  return null;
}

/**
 * @symbiote-native/keep-awake canary demo: a toggle whose "on" state mounts KeepAwakeHolder,
 * activating the keep-awake lock; toggling off unmounts it, deactivating the lock. Plus a
 * capability row for isAvailableAsync().
 */
export function KeepAwakeScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isKeepAwakeOn, setIsKeepAwakeOn] = createSignal(false);
  const [isAvailable, setIsAvailable] = createSignal<boolean | null>(null);

  isAvailableAsync().then(setIsAvailable);

  return (
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
              @symbiote-native/keep-awake — keeps the screen on for the lifetime
              of a mounted component.
            </text>
          </view>
        </view>

        <view testID="keep-awake-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Keep screen awake</text>
          </view>
          <ValueRow
            label="Available"
            value={
              isAvailable() === null
                ? 'checking…'
                : isAvailable()
                  ? 'Yes'
                  : 'No'
            }
          />
          <view testID="keep-awake-toggle-row" class="capability-row">
            <text class="capability-label">Keep screen awake</text>
            <switch
              testID="keep-awake-switch"
              value={isKeepAwakeOn()}
              onValueChange={event => setIsKeepAwakeOn(event.value)}
              trackColor={{ true: lineColor }}
            />
          </view>
          <Show when={isKeepAwakeOn()}>
            <KeepAwakeHolder />
          </Show>
        </view>
      </ScrollView>
    </safe-area-view>
  );
}
