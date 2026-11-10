import type { IScreenOptionsResolver } from '@symbiote-native/navigation/solid';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { RuntimeRecipes } from './runtime-config/RuntimeRecipes';
import {
  legacyInsetOptionsOf,
  readIsLegacyInset,
} from './runtime-config/runtime-config';

export const runtimeConfigScreenOptions: IScreenOptionsResolver = ({
  route,
}) => ({
  title: 'Runtime config',
  headerShown: true,
  headerTintColor: LINE_COLOR.introspection,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  ...legacyInsetOptionsOf(readIsLegacyInset(route.params)),
});

export function RuntimeConfigScreen() {
  return (
    <scroll-view
      testID="runtime-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.RuntimeConfig}
          title="Runtime config"
          body="The global switches of the screens library as this app reads them right now."
        />
        <RuntimeRecipes />
      </view>
    </scroll-view>
  );
}
