// @vitest-environment happy-dom
// Канареечный экран на Vue оставляет на странице те же факты, что и на остальных адаптерах

import {
  CANARY_BOLD_STYLE,
  CANARY_BOX_STYLE,
  CANARY_FACTS,
  disposeCanary,
  renderCanaryOnWeb,
} from '@symbiote-native/web/canary';
import { h } from '@vue/runtime-core';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRegistry } from './modules/app-registry';

const Canary = () =>
  h('view', { testID: 'app', style: CANARY_BOX_STYLE }, [
    h('text', { testID: 'greeting' }, [
      'hello ',
      h('text', { testID: 'bold', style: CANARY_BOLD_STYLE }, 'web'),
    ]),
  ]);

describe('Vue canary on the web', () => {
  afterEach(disposeCanary);

  it('leaves the canary facts on the page', async () => {
    const facts = await renderCanaryOnWeb(AppRegistry, () => Canary);

    expect(facts).toEqual(CANARY_FACTS);
  });
});
