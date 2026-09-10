import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import {
  AccessibilityInfo,
  SymbioteHostPropsDirective,
  Text,
  View,
} from '@symbiote-native/angular';

// Static look lives in AccessibilityDemo.css, compiled at build time by @symbiote-native/css-parser.
import './AccessibilityDemo.css';

// View's own primitive host only declares `style` as a real Angular @Input() (see
// adapters/angular/src/primitives/shared.ts) — `accessible`/`accessibilityRole`/`accessibilityLabel`/
// `role`/`aria-label`/`accessibilityState` are NOT declared Inputs, so a bound `[prop]="…"` on a
// bare View fails Angular's real strictTemplates build (NG8002, `examples/angular/tsconfig.angular.json`
// has `strictTemplates: true`) even though it works at runtime via the engine's generic prop router.
// The established fix (see adapters/angular/src/components/pressable/index.ts's `[symbioteHostProps]`
// usage, and SymbioteHostPropsDirective's own docstring) is to bundle such props into one object and
// bind it through `[symbioteHostProps]`, a REAL declared @Input the type-checker already knows about.
@Component({
  selector: 'AccessibilityDemo',
  standalone: true,
  imports: [View, Text, SymbioteHostPropsDirective],
  template: `
    <view class="section-nested">
      <text class="section-label"
        >Accessibility · props → native · aria/role transform ·
        AccessibilityInfo</text
      >
      <text testID="a11y-screen-reader" class="info-text">{{
        'screen reader: ' + screenReader
      }}</text>
      <view [symbioteHostProps]="canonicalLabelProps" class="a11y-card">
        <text class="info-text">canonical label + role=header</text>
      </view>
      <view [symbioteHostProps]="ariaLabelProps" class="a11y-card">
        <text class="info-text">aria-label + role=button</text>
      </view>
      <view [symbioteHostProps]="stateProps" class="a11y-card">
        <text class="info-text">state: disabled + selected</text>
      </view>
    </view>
  `,
})
export class AccessibilityDemo implements OnInit {
  private readonly changeDetector = inject(ChangeDetectorRef);

  screenReader = 'querying…';

  readonly disabledSelectedState = { disabled: true, selected: true };

  readonly canonicalLabelProps = {
    testID: 'a11y-canonical-card',
    accessible: true,
    accessibilityRole: 'header',
    accessibilityLabel: 'a11y-canonical-label',
  };
  readonly ariaLabelProps = {
    testID: 'a11y-aria-card',
    accessible: true,
    role: 'button',
    'aria-label': 'a11y-aria-label',
  };
  readonly stateProps = {
    testID: 'a11y-state-card',
    accessible: true,
    accessibilityLabel: 'a11y-state',
    accessibilityState: this.disabledSelectedState,
  };

  ngOnInit(): void {
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => {
        this.screenReader = enabled ? 'on' : 'off';
        this.changeDetector.detectChanges();
      })
      .catch(() => {
        this.screenReader = 'unavailable';
        this.changeDetector.detectChanges();
      });
    AccessibilityInfo.announceForAccessibility('symbiote accessibility online');
  }
}
