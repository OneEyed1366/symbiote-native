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

// One screen over seven sheets, one panel per mechanism, kept in `style-showcase/`
// Each tile is built so a dropped rule PAINTS: it turns square, twin or red
export function StyleShowcaseScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StyleShowcase];

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="style-showcase-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>

        <view className="hero-card">
          <view
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.styling }}
          >
            <text className="hero-badge-text">ST</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Styling showcase</text>
            <text className="hero-body">
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
