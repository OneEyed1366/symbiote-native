import { defineComponent, ref } from 'vue';
import {
  deserializeNavigatorState,
  serializeNavigatorState,
} from '@symbiote-native/navigation';
import {
  useNavigation,
  useNavigationState,
} from '@symbiote-native/navigation/vue';
import type { INavigatorState } from '@symbiote-native/navigation';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * State persistence demo: "Serialize" reads the LIVE root Stack state via useNavigationState and
 * JSON.stringifies serializeNavigatorState's output for display; "Restore" parses that same JSON
 * back with deserializeNavigatorState (which validates the shape, no blind `as`) and hands it to
 * navigation.reset() — the round trip real @react-navigation persistence (initialState/
 * onStateChange) is built on. Restoring genuinely navigates: the stack becomes exactly the
 * serialized snapshot, which may move you away from this very screen.
 */
export const StatePersistenceScreen = defineComponent(
  () => {
    const navigation = useNavigation();
    const state = useNavigationState<INavigatorState>(
      currentState => currentState,
    );
    const snapshot = ref<string | undefined>(undefined);
    const restoreError = ref<string | undefined>(undefined);

    const onSerialize = (): void => {
      restoreError.value = undefined;
      snapshot.value = JSON.stringify(
        serializeNavigatorState(state.value),
        null,
        2,
      );
    };

    const onRestore = (): void => {
      if (snapshot.value === undefined) return;
      if (!('reset' in navigation.value)) {
        restoreError.value =
          'this screen is not mounted under a Stack — reset() is unavailable';
        return;
      }
      try {
        const parsed: unknown = JSON.parse(snapshot.value);
        navigation.value.reset(deserializeNavigatorState(parsed));
        restoreError.value = undefined;
      } catch (error) {
        restoreError.value =
          error instanceof Error ? error.message : 'restore failed';
      }
    };

    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StatePersistence];

    return () => (
      <safe-area-view class="screen">
        <view class="section">
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view
              class="hero-badge"
              style={{ backgroundColor: LINE_COLOR.routing }}
            >
              <text class="hero-badge-text">SP</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">State persistence</text>
              <text class="hero-body">
                The Stack's own state serialized out and deserialized back in —
                restoring exactly where you left off.
              </text>
            </view>
          </view>
          <text class="info-text">{`current stack depth: ${state.value.routes.length}`}</text>
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
          {restoreError.value !== undefined && (
            <text class="info-text">{`error: ${restoreError.value}`}</text>
          )}
          <view class="box-list160">
            <text testID="persist-snapshot" class="list-row-text">
              {snapshot.value ??
                'tap Serialize to capture the current route stack as JSON'}
            </text>
          </view>
        </view>
      </safe-area-view>
    );
  },
  { name: 'StatePersistenceScreen' },
);
