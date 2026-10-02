import { Component, DestroyRef, inject } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from '@symbiote-native/keep-awake/angular';

const KEEP_AWAKE_TAG = 'keep-awake-screen-demo';

// The lock lives exactly as long as this component. The root-scoped service would outlive it
@Component({
  selector: 'KeepAwakeHolder',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<view></view>`,
})
export class KeepAwakeHolder {
  constructor() {
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    inject(DestroyRef).onDestroy(
      () => void deactivateKeepAwake(KEEP_AWAKE_TAG),
    );
  }
}
