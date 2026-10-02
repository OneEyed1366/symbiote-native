import { Component, DestroyRef, inject, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from '@symbiote-native/screen-capture/angular';

// Protection lasts exactly as long as this component, and the key is applied once at creation
@Component({
  selector: 'ScreenCapturePreventHolder',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<view></view>`,
})
export class ScreenCapturePreventHolder {
  readonly keyName = input.required<string>();

  constructor() {
    inject(DestroyRef).onDestroy(
      () => void allowScreenCaptureAsync(this.keyName()),
    );
  }

  ngOnInit(): void {
    void preventScreenCaptureAsync(this.keyName());
  }
}
