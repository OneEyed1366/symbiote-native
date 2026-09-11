import {
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/react';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

// A second native screen, pushed onto the SAME RNSScreenStack the canary screen lives
// in — proves push/pop, the native header (title from options, back button/back-title),
// and route.params round-tripping through the navigator handle.
export function DetailsScreen() {
  const route = useRoute();
  const navigation = useStackNavigation();
  const params = route.params;
  const paramsLabel =
    typeof params === 'object' && params !== null && 'openedFrom' in params
      ? String(params.openedFrom)
      : 'none';
  return (
    <safe-area-view className="screen">
      <view className="section">
        <text className="section-label">Navigation demo · Details screen</text>
        <text className="info-text">{`route.params: ${paramsLabel}`}</text>
        <text className="info-text">{`canGoBack: ${navigation.canGoBack()}`}</text>
        <ActionButton
          testID="nav-pop"
          title="← Pop back"
          onPress={() => navigation.pop()}
          color={LINE_COLOR.primitives}
        />
      </view>
    </safe-area-view>
  );
}
