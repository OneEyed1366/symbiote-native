import { useStackNavigation } from '@symbiote-native/navigation/react';
import { MENU_SECTIONS } from '../menu-sections';
import { MenuRow } from './MenuRow';

// Root menu, one row per section, each pushes its hub screen with the section's stops
export function MenuScreen() {
  const navigation = useStackNavigation();
  return (
    <safe-area-view className="screen">
      <scroll-view testID="menu-scroll" className="screen">
        <view className="scroll-content">
        <view className="menu-hero">
          <text className="menu-eyebrow">SYMBIOTE NATIVE DEMO SUITE</text>
          <text className="menu-hero-title">Four sections to explore</text>
          <text className="menu-hero-subtitle">
            Framework covers primitives, React APIs and CSS styling. Navigation
            drives @symbiote-native/navigation on a real native stack. Packages
            shows the companion libraries. Benchmarks times the engine's own
            commit path.
          </text>
        </view>
        {MENU_SECTIONS.map(section => (
          <MenuRow
            key={section.route}
            testID={`menu-row-${section.route}`}
            line={section.line}
            code={section.code}
            label={section.title}
            hint={section.hint}
            onPress={() => navigation.push(section.route)}
          />
        ))}
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
