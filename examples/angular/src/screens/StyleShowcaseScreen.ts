import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import './StyleShowcase.css';
import './StyleShowcase.limits.css';
import './StyleShowcase.media.css';
import './StyleShowcase.lab.css';
import './showcase.scss';
import './showcase.less';
import './showcase.styl';
import {
  ShowcaseCompoundPanel,
  ShowcaseDeclarationsPanel,
  ShowcaseSpecificityPanel,
} from './style-showcase/compiler-panels';
import {
  ShowcaseContainerLab,
  ShowcaseMediaLab,
  ShowcaseVarLab,
} from './style-showcase/lab-panels';
import {
  ShowcaseLimitsPanel,
  ShowcaseMediaPanel,
} from './style-showcase/limits-panels';
import {
  ShowcaseAnimationPanel,
  ShowcaseMergePanel,
  ShowcaseModulesPanel,
  ShowcasePreprocessorsPanel,
} from './style-showcase/mixing-panels';

// Angular twin of `examples/react`, state is signals read from the panel templates
// Each tile is built so a dropped rule PAINTS: it turns square, twin or red
@Component({
  selector: 'StyleShowcaseScreen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ShowcaseDeclarationsPanel,
    ShowcaseSpecificityPanel,
    ShowcaseCompoundPanel,
    ShowcaseMergePanel,
    ShowcaseAnimationPanel,
    ShowcaseModulesPanel,
    ShowcasePreprocessorsPanel,
    ShowcaseLimitsPanel,
    ShowcaseMediaPanel,
    ShowcaseMediaLab,
    ShowcaseContainerLab,
    ShowcaseVarLab,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="style-showcase-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>

        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
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

        <ShowcaseDeclarationsPanel></ShowcaseDeclarationsPanel>
        <ShowcaseSpecificityPanel></ShowcaseSpecificityPanel>
        <ShowcaseCompoundPanel></ShowcaseCompoundPanel>
        <ShowcaseMergePanel></ShowcaseMergePanel>
        <ShowcaseAnimationPanel></ShowcaseAnimationPanel>
        <ShowcaseModulesPanel></ShowcaseModulesPanel>
        <ShowcasePreprocessorsPanel></ShowcasePreprocessorsPanel>
        <ShowcaseLimitsPanel></ShowcaseLimitsPanel>
        <ShowcaseMediaPanel></ShowcaseMediaPanel>
        <ShowcaseMediaLab></ShowcaseMediaLab>
        <ShowcaseContainerLab></ShowcaseContainerLab>
        <ShowcaseVarLab></ShowcaseVarLab>
      </scroll-view>
    </safe-area-view>
  `,
})
export class StyleShowcaseScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StyleShowcase];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.styling };
}
