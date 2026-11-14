import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import './StyleShowcase.css';
import './StyleShowcase.limits.css';
import './StyleShowcase.media.css';
import './StyleShowcase.lab.css';
import './showcase.scss';
import './showcase.less';
import './showcase.styl';
import {
  CompoundPanel,
  DeclarationsPanel,
  SpecificityPanel,
} from './style-showcase/compiler-panels';
import { ContainerLab, MediaLab, VarLab } from './style-showcase/lab-panels';
import { LimitsPanel, MediaPanel } from './style-showcase/limits-panels';
import {
  AnimationPanel,
  MergePanel,
  ModulesPanel,
  PreprocessorsPanel,
} from './style-showcase/mixing-panels';

// Ported from `examples/react`, with the same sheets copied byte for byte
// Each tile is built so a dropped rule PAINTS: it turns square, twin or red
export function StyleShowcaseScreen() {
  // A module constant indexed by a literal, nothing here to keep reactive
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StyleShowcase];

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="style-showcase-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>

        <view class="hero-card">
          <view
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.styling }}
          >
            <text class="hero-badge-text">ST</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Styling showcase</text>
            <text class="hero-body">
              Seven stylesheets driving one screen — plain CSS, CSS Modules,
              SCSS, Less, Stylus, a sheet of things the compiler refuses and one
              for @media. Every tile is built so a dropped rule is visible
              rather than silent.
            </text>
          </view>
        </view>

        <DeclarationsPanel />
        <SpecificityPanel />
        <CompoundPanel />
        <MergePanel />
        <AnimationPanel />
        <ModulesPanel />
        <PreprocessorsPanel />
        <LimitsPanel />
        <MediaPanel />
        <MediaLab />
        <ContainerLab />
        <VarLab />
      </scroll-view>
    </safe-area-view>
  );
}
