import type { IScreenOptions } from '@symbiote-native/navigation/vue';
import { MENU_SECTIONS } from '../menu-sections';
import { LINE_COLOR } from '../navigation-lines';
import SectionHubScreen from './SectionHubScreen.vue';

// One stack registration per section, App.vue renders them beside the demo screens
export const HUB_SCREENS = MENU_SECTIONS.map(section => {
  const options: IScreenOptions = {
    title: section.title,
    headerShown: true,
    headerTintColor: LINE_COLOR[section.line],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
  };
  return {
    name: section.route,
    component: SectionHubScreen,
    options,
  };
});
