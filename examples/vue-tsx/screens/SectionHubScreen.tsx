import { Fragment, defineComponent } from 'vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import type { IScreenOptions } from '@symbiote-native/navigation/vue';
import { MENU_SECTIONS, sectionGroups } from '../menu-sections';
import type { IMenuSectionKey } from '../menu-sections';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { MenuRow } from './MenuRow';

function createHubScreen(sectionKey: IMenuSectionKey) {
  return defineComponent(
    () => {
      const navigation = useStackNavigation();
      return () => {
        const section = MENU_SECTIONS.find(
          candidate => candidate.key === sectionKey,
        );
        if (!section) return null;
        return (
          <safe-area-view class="screen">
            <scroll-view testID={`hub-scroll-${section.key}`} class="screen">
              <view class="scroll-content">
                <view class="menu-hero">
                  <text class="menu-eyebrow">{section.title.toUpperCase()}</text>
                  <text class="menu-hero-subtitle">{section.hint}</text>
                </view>
                {sectionGroups(section).map(group => (
                  <Fragment key={group.line ?? 'all'}>
                    {group.line !== undefined && (
                      <text class="hub-group-title">
                        {group.line.toUpperCase()}
                      </text>
                    )}
                    {group.items.map(item => {
                      const lineInfo = ROUTE_LINE_INFO[item.route];
                      return (
                        <MenuRow
                          key={item.route}
                          testID={`menu-row-${item.route}`}
                          line={lineInfo.line}
                          code={lineInfo.code}
                          label={item.label}
                          hint={item.hint}
                          onPress={() => navigation.value.push(item.route)}
                        />
                      );
                    })}
                  </Fragment>
                ))}
              </view>
            </scroll-view>
          </safe-area-view>
        );
      };
    },
    { name: `${sectionKey}HubScreen` },
  );
}

export const FrameworkHubScreen = createHubScreen('framework');
export const NavigationHubScreen = createHubScreen('navigation');
export const PackagesHubScreen = createHubScreen('packages');
export const BenchmarksHubScreen = createHubScreen('benchmarks');

const HUB_COMPONENT = {
  framework: FrameworkHubScreen,
  navigation: NavigationHubScreen,
  packages: PackagesHubScreen,
  benchmarks: BenchmarksHubScreen,
} as const satisfies Record<IMenuSectionKey, unknown>;

// One stack registration per section, App.tsx renders them beside the demo screens
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
    component: HUB_COMPONENT[section.key],
    options,
  };
});
