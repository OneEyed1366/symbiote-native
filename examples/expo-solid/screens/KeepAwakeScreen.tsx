import { Show, createSignal } from 'solid-js';
import { isAvailableAsync } from '@symbiote-native/keep-awake';
import { createKeepAwake } from '@symbiote-native/keep-awake/solid';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
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

export function KeepAwakeScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isKeepAwakeOn, setIsKeepAwakeOn] = createSignal(false);
  const [isAvailable, setIsAvailable] = createSignal<boolean | null>(null);

  isAvailableAsync().then(setIsAvailable);

  return (
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
      </scroll-view>
    </safe-area-view>
  );
}
