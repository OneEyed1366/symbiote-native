import { For } from 'solid-js';
import type { Component } from 'solid-js';
import { useStackNavigation } from '@symbiote-native/navigation/solid';
import type { ISolidScreenOptions } from '@symbiote-native/navigation/solid';
import { MENU_SECTIONS, sectionGroups } from '../menu-sections';
import type { IMenuSectionKey } from '../menu-sections';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { MenuRow } from './MenuRow';

// The key is a constant per screen, so the section is looked up once, as the body runs once
function SectionHub(props: { sectionKey: IMenuSectionKey }) {
  const navigation = useStackNavigation();
  const section = MENU_SECTIONS.find(
    candidate => candidate.key === props.sectionKey,
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
          <For each={sectionGroups(section)}>
            {group => (
              <>
                {group.line && (
                  <text class="hub-group-title">{group.line.toUpperCase()}</text>
                )}
                <For each={group.items}>
                  {item => {
                    const lineInfo = ROUTE_LINE_INFO[item.route];
                    return (
                      <MenuRow
                        testID={`menu-row-${item.route}`}
                        line={lineInfo.line}
                        code={lineInfo.code}
                        label={item.label}
                        hint={item.hint}
                        onPress={() => navigation().push(item.route)}
                      />
                    );
                  }}
                </For>
              </>
            )}
          </For>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}

export function FrameworkHubScreen() {
  return <SectionHub sectionKey="framework" />;
}

export function NavigationHubScreen() {
  return <SectionHub sectionKey="navigation" />;
}

export function PackagesHubScreen() {
  return <SectionHub sectionKey="packages" />;
}

export function BenchmarksHubScreen() {
  return <SectionHub sectionKey="benchmarks" />;
}

const HUB_COMPONENT: Record<IMenuSectionKey, Component> = {
  framework: FrameworkHubScreen,
  navigation: NavigationHubScreen,
  packages: PackagesHubScreen,
  benchmarks: BenchmarksHubScreen,
};

// One stack registration per section, App.tsx renders them beside the demo screens
export const HUB_SCREENS = MENU_SECTIONS.map(section => {
  const options: ISolidScreenOptions = {
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
