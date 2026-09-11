import { useState } from 'react';
import {
  deserializeNavigatorState,
  serializeNavigatorState,
} from '@symbiote-native/navigation';
import {
  useNavigation,
  useNavigationState,
} from '@symbiote-native/navigation/react';
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
export function StatePersistenceScreen() {
  const navigation = useNavigation();
  const state = useNavigationState<INavigatorState>(
    currentState => currentState,
  );
  const [snapshot, setSnapshot] = useState<string | undefined>(undefined);
  const [restoreError, setRestoreError] = useState<string | undefined>(
    undefined,
  );

  const onSerialize = () => {
    setRestoreError(undefined);
    setSnapshot(JSON.stringify(serializeNavigatorState(state), null, 2));
  };

  const onRestore = () => {
    if (snapshot === undefined) return;
    if (!('reset' in navigation)) {
      setRestoreError(
        'this screen is not mounted under a Stack — reset() is unavailable',
      );
      return;
    }
    try {
      const parsed: unknown = JSON.parse(snapshot);
      navigation.reset(deserializeNavigatorState(parsed));
      setRestoreError(undefined);
    } catch (error) {
      setRestoreError(
        error instanceof Error ? error.message : 'restore failed',
      );
    }
  };

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StatePersistence];

  return (
    <safe-area-view className="screen">
      <view className="section">
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.routing }}
          >
            <text className="hero-badge-text">SP</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">State persistence</text>
            <text className="hero-body">
              The Stack's own state serialized out and deserialized back in —
              restoring exactly where you left off.
            </text>
          </view>
        </view>
        <text className="info-text">{`current stack depth: ${state.routes.length}`}</text>
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
        {restoreError !== undefined && (
          <text className="info-text">{`error: ${restoreError}`}</text>
        )}
        <view className="box-list160">
          <text testID="persist-snapshot" className="list-row-text">
            {snapshot ??
              'tap Serialize to capture the current route stack as JSON'}
          </text>
        </view>
      </view>
    </safe-area-view>
  );
}
