import { AnimationsSection } from './reanimated/AnimationsSection';
import { CssSection } from './reanimated/CssSection';
import { DerivedSection } from './reanimated/DerivedSection';
import { EnteringExitingSection } from './reanimated/EnteringExitingSection';
import { FramesSection } from './reanimated/FramesSection';
import { LayoutTransitionSection } from './reanimated/LayoutTransitionSection';
import { FlatListSection } from './reanimated/ListSection';
import { MeasureSection } from './reanimated/MeasureSection';
import { ParitySection } from './reanimated/ParitySection';
import { ScrollSection } from './reanimated/ScrollSection';
import { SharedStateSection } from './reanimated/SharedStateSection';
import { SharedTransitionSection } from './reanimated/SharedTransitionSection';
import { TransformOriginSection } from './reanimated/TransformOriginSection';
import { WorkletsSection } from './reanimated/WorkletsSection';
import './reanimated/keyframes.css';
import './reanimated/sections.css';

// Everything react-native-reanimated 4.7.1 does, one section each, running on the UI thread over
// the native half of Reanimated. The last section checks the package's exports against the list
export function ReanimatedScreen() {
  return (
    <safe-area-view class="ra-screen">
      <scroll-view class="ra-scroll" contentContainerStyle="ra-content">
        <text class="ra-title">Reanimated</text>
        <AnimationsSection />
        <DerivedSection />
        <EnteringExitingSection />
        <LayoutTransitionSection />
        <TransformOriginSection />
        <ScrollSection />
        <FlatListSection />
        <FramesSection />
        <CssSection />
        <WorkletsSection />
        <SharedStateSection />
        <SharedTransitionSection />
        <MeasureSection />
        <ParitySection />
      </scroll-view>
    </safe-area-view>
  );
}
