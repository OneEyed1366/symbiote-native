import { Fragment } from 'react';
import type { FunctionComponent } from 'react';
import { useStackNavigation } from '@symbiote-native/navigation/react';
import type { IScreenOptions } from '@symbiote-native/navigation/react';
import { MENU_SECTIONS, sectionGroups } from '../menu-sections';
import type { IMenuSectionKey } from '../menu-sections';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { MenuRow } from './MenuRow';

function SectionHub({ sectionKey }: { sectionKey: IMenuSectionKey }) {
  const navigation = useStackNavigation();
  const section = MENU_SECTIONS.find(candidate => candidate.key === sectionKey);
  if (!section) return null;
  return (
    <safe-area-view className="screen">
      <scroll-view testID={`hub-scroll-${section.key}`} className="screen">
        <view className="scroll-content">
        <view className="menu-hero">
          <text className="menu-eyebrow">{section.title.toUpperCase()}</text>
          <text className="menu-hero-subtitle">{section.hint}</text>
        </view>
        {sectionGroups(section).map(group => (
          <Fragment key={group.line ?? 'all'}>
            {group.line !== undefined && (
              <text className="hub-group-title">{group.line.toUpperCase()}</text>
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
                  onPress={() => navigation.push(item.route)}
                />
              );
            })}
          </Fragment>
        ))}
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

const HUB_COMPONENT: Record<IMenuSectionKey, FunctionComponent> = {
  framework: FrameworkHubScreen,
  navigation: NavigationHubScreen,
  packages: PackagesHubScreen,
  benchmarks: BenchmarksHubScreen,
};

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
