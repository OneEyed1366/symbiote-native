// @vitest-environment happy-dom
// Канареечный экран на Angular оставляет на странице те же факты, что и на остальных адаптерах

import '@angular/compiler';
import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import {
  CANARY_BOLD_STYLE,
  CANARY_BOX_STYLE,
  CANARY_FACTS,
  disposeCanary,
  renderCanaryOnWeb,
} from '@symbiote-native/web/canary';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRegistry } from './modules/app-registry';
import './register';

@Component({
  selector: 'canary-app',
  template: `
    <view testID="app" [style]="box">
      <text testID="greeting"
        >hello <text testID="bold" [style]="bold">web</text></text
      >
    </view>
  `,
  schemas: [NO_ERRORS_SCHEMA],
})
class CanaryApp {
  readonly box = CANARY_BOX_STYLE;
  readonly bold = CANARY_BOLD_STYLE;
}

describe('Angular canary on the web', () => {
  afterEach(disposeCanary);

  it('leaves the canary facts on the page', async () => {
    const facts = await renderCanaryOnWeb(AppRegistry, () => CanaryApp);

    expect(facts).toEqual(CANARY_FACTS);
  });
});
