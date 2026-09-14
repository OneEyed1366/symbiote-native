import { defineComponent } from 'vue';
import { useRoute, useStackNavigation } from '@symbiote-native/navigation/vue';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

// A second native screen, pushed onto the SAME RNSScreenStack the canary screen lives
// in — proves push/pop, the native header (title from options, back button/back-title),
// and route.params round-tripping through the navigator handle. Only ever mounted under a
// Stack, so useStackNavigation() hands back the Stack handle directly; useRoute() reads the route.
export const DetailsScreen = defineComponent(
  () => {
    const route = useRoute();
    const navigation = useStackNavigation();
    return () => {
      const params = route.value.params;
      const paramsLabel =
        typeof params === 'object' && params !== null && 'openedFrom' in params
          ? String(params.openedFrom)
          : 'none';
      return (
        <safe-area-view class="screen">
          <view class="section">
            <text class="section-label">Navigation demo · Details screen</text>
            <text class="info-text">{`route.params: ${paramsLabel}`}</text>
            <text class="info-text">{`canGoBack: ${navigation.value.canGoBack()}`}</text>
            <ActionButton
              testID="nav-pop"
              title="← Pop back"
              onPress={() => navigation.value.pop()}
              color={LINE_COLOR.primitives}
            />
          </view>
        </safe-area-view>
      );
    };
  },
  { name: 'DetailsScreen' },
);
