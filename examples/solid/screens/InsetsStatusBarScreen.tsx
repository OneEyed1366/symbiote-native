import type { IScreenOptionsResolver } from '@symbiote-native/navigation/solid';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { InsetRecipes } from './insets/InsetRecipes';
import { insetsOptionsOf, readInsetsSettings } from './insets/insets-settings';
import { IS_STATUS_BAR_SETTABLE } from './insets/status-bar-support';
import { SystemBarRecipes } from './insets/SystemBarRecipes';

// Every panel switch lands in the route params, this resolver turns them into the screen options
export const insetsStatusBarScreenOptions: IScreenOptionsResolver = ({
  route,
}) => ({
  title: 'Status bar and insets',
  headerShown: true,
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  ...insetsOptionsOf(readInsetsSettings(route.params), IS_STATUS_BAR_SETTABLE),
});

export function InsetsStatusBarScreen() {
  return (
    <scroll-view
      testID="insets-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.InsetsStatusBar}
          title="Status bar and insets"
          body="The chrome around this screen: status bar, orientation, home indicator and where content may go under them."
        />
        <SystemBarRecipes />
        <InsetRecipes />
      </view>
    </scroll-view>
  );
}
