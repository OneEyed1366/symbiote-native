import type { ISolidScreenOptions } from '@symbiote-native/navigation/solid';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { LinkingRecipes } from './linking/LinkingRecipes';

export const deepLinkingScreenOptions: ISolidScreenOptions = {
  title: 'Deep Linking',
  headerShown: true,
  headerTintColor: LINE_COLOR.routing,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

export function DeepLinkingScreen() {
  return (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.DeepLinking}
          title="Deep linking"
          body="A link typed here goes through the same matching a real deep link or a push notification takes."
        />
        <LinkingRecipes />
      </view>
    </scroll-view>
  );
}
