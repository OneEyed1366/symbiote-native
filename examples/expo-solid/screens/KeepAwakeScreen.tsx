import { Show, createSignal } from 'solid-js';
import {
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  View,
} from '@symbiote-native/solid';
import { isAvailableAsync } from '@symbiote-native/keep-awake';
import { createKeepAwake } from '@symbiote-native/keep-awake/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <Text class="value-text">{props.value}</Text>
    </View>
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
    <SafeAreaView class="screen">
      <ScrollView
        testID="keep-awake-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text class="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Keep Awake</Text>
            <Text class="hero-body">
              @symbiote-native/keep-awake — keeps the screen on for the lifetime
              of a mounted component.
            </Text>
          </View>
        </View>

        <View testID="keep-awake-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Keep screen awake</Text>
          </View>
          <ValueRow
            label="Available"
            value={
              isAvailable() === null ? 'checking…' : isAvailable() ? 'Yes' : 'No'
            }
          />
          <View testID="keep-awake-toggle-row" class="capability-row">
            <Text class="capability-label">Keep screen awake</Text>
            <Switch
              testID="keep-awake-switch"
              value={isKeepAwakeOn()}
              onValueChange={setIsKeepAwakeOn}
              trackColor={{ true: lineColor }}
            />
          </View>
          <Show when={isKeepAwakeOn()}>
            <KeepAwakeHolder />
          </Show>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
