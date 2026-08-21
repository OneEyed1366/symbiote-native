// State persistence demo: "Serialize" reads the LIVE root Stack state through createNavigationState
// and JSON.stringifies serializeNavigatorState's output; "Restore" parses that same JSON back with
// deserializeNavigatorState (which validates the shape — no blind cast) and hands it to
// navigation().reset(). That round trip is what real @react-navigation persistence
// (initialState/onStateChange) is built on. Restoring genuinely navigates: the stack becomes
// exactly the serialized snapshot, which may move you away from this very screen.
//
// createNavigationState, not useNavigationState: it owns a signal and an emitter subscription, and
// Solid spells an owner `create*` — `use*` is reserved for consuming what already exists
// (useNavigation below). Both hand back accessors, called at each use site.

import { Show, createSignal } from 'solid-js';
import { SafeAreaView, Text, View } from '@symbiote-native/solid';
import {
  deserializeNavigatorState,
  serializeNavigatorState,
} from '@symbiote-native/navigation';
import type { INavigatorState } from '@symbiote-native/navigation';
import {
  createNavigationState,
  useNavigation,
} from '@symbiote-native/navigation/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import './StatePersistenceScreen.css';

const JSON_INDENT = 2;

export function StatePersistenceScreen() {
  // useNavigation, not useStackNavigation: onRestore's `'reset' in handle` guard IS the demo —
  // what a screen that could sit under any navigator has to check before resetting.
  const navigation = useNavigation();
  const state = createNavigationState<INavigatorState>(
    currentState => currentState,
  );
  const [snapshot, setSnapshot] = createSignal<string | undefined>(undefined);
  const [restoreError, setRestoreError] = createSignal<string | undefined>(
    undefined,
  );

  const onSerialize = (): void => {
    setRestoreError(undefined);
    setSnapshot(
      JSON.stringify(serializeNavigatorState(state()), null, JSON_INDENT),
    );
  };

  const onRestore = (): void => {
    const current = snapshot();
    if (current === undefined) return;
    const handle = navigation();
    if (!('reset' in handle)) {
      setRestoreError(
        'this screen is not mounted under a Stack — reset() is unavailable',
      );
      return;
    }
    try {
      const parsed: unknown = JSON.parse(current);
      handle.reset(deserializeNavigatorState(parsed));
      setRestoreError(undefined);
    } catch (error) {
      setRestoreError(
        error instanceof Error ? error.message : 'restore failed',
      );
    }
  };

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StatePersistence];

  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.routing }}
          >
            <Text class="hero-badge-text">SP</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">State persistence</Text>
            <Text class="hero-body">
              The Stack's own state serialized out and deserialized back in —
              restoring exactly where you left off.
            </Text>
          </View>
        </View>
        <Text class="info-text">{`current stack depth: ${state().routes.length}`}</Text>
        <ActionButton
          testID="persist-serialize"
          title="Serialize current stack"
          onPress={onSerialize}
          color={LINE_COLOR.routing}
        />
        <ActionButton
          testID="persist-restore"
          title="Restore serialized snapshot"
          onPress={onRestore}
          color={LINE_COLOR.routing}
        />
        <Show when={restoreError() !== undefined}>
          <Text class="info-text">{`error: ${restoreError()}`}</Text>
        </Show>
        <View class="persist-snapshot">
          <Text testID="persist-snapshot" class="persist-snapshot-text">
            {snapshot() ??
              'tap Serialize to capture the current route stack as JSON'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
