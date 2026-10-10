import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  AppState,
  ColorSchemeService,
  KEYBOARD_EVENT,
  Keyboard,
  PixelRatio,
  Platform,
  StyleSheet,
  SYMBIOTE_ELEMENTS,
  WindowDimensionsService,
} from '@symbiote-native/angular';
import { keyboardHeightOf } from './canary-shared';

const PLATFORM_KIND = Platform.select({
  ios: 'native ios',
  android: 'native android',
  default: '?',
});
const PAD_NOTE = Platform.isPad ? ' · iPad' : '';

// Runtime modules read live. A fractional hairline (0.333 on @3x) proves the scale resolved
@Component({
  selector: 'CanaryRuntimeNotes',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <text
      testID="angular-platform"
      class="hairline-note"
      [style]="hairlineStyle"
      >{{ platformNote }}</text
    >
    <text testID="angular-dimensions" class="header-note">{{
      screenNote()
    }}</text>
    <text testID="angular-keyboard" class="header-note">{{
      keyboardNote()
    }}</text>
  `,
})
export class CanaryRuntimeNotes {
  private readonly dimensions = inject(WindowDimensionsService).dimensions;
  private readonly colorScheme = inject(ColorSchemeService).colorScheme;

  readonly hairlineStyle = { borderTopWidth: StyleSheet.hairlineWidth };
  readonly platformNote =
    `${Platform.OS} ${Platform.Version}${PAD_NOTE} · ${PLATFORM_KIND}` +
    ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`;

  private readonly keyboardHeight = signal(0);
  private readonly appPhase = signal<string>(
    AppState.currentState ?? 'unknown',
  );
  readonly keyboardNote = computed(() =>
    this.keyboardHeight() > 0
      ? `keyboard up · ${this.keyboardHeight()}px`
      : 'keyboard down',
  );
  readonly screenNote = computed(() => {
    const size = this.dimensions();
    return (
      `${Math.round(size.width)}×${Math.round(size.height)} @${PixelRatio.get()}x` +
      ` · ${this.colorScheme() ?? 'no-scheme'} · ${this.appPhase()}`
    );
  });

  constructor() {
    // native -> JS: the device hub pushes keyboard frames and lifecycle changes
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, (payload: unknown) =>
        this.keyboardHeight.set(keyboardHeightOf(payload)),
      ),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () =>
        this.keyboardHeight.set(0),
      ),
      AppState.addEventListener('change', next => this.appPhase.set(next)),
    ];
    inject(DestroyRef).onDestroy(() =>
      subscriptions.forEach(subscription => subscription.remove()),
    );
  }
}
