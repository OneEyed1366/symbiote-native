// @vitest-environment happy-dom
// Один и тот же канареечный экран на любом адаптере даёт на странице одни и те же факты
// Здесь он собран напрямую через API узлов движка, это эталон для тестов адаптеров

import {
  appendChild,
  createElement,
  createRawText,
  routeProp,
  TEXT_COMPONENT,
  type IRootTag,
} from '@symbiote-native/engine';
import { createSurface } from '@symbiote-native/engine';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANARY_BOLD_STYLE,
  CANARY_BOX_STYLE,
  CANARY_FACTS,
  disposeCanary,
  renderCanaryOnWeb,
} from './canary';

// The same tree every adapter writes in its own idiom
function mountCanary(rootTag: IRootTag): void {
  const surface = createSurface(rootTag);
  const app = createElement('RCTView');
  routeProp(app, 'testID', 'app');
  routeProp(app, 'style', CANARY_BOX_STYLE);
  const greeting = createElement(TEXT_COMPONENT, true);
  routeProp(greeting, 'testID', 'greeting');
  appendChild(greeting, createRawText('hello '));
  const bold = createElement(TEXT_COMPONENT, true);
  routeProp(bold, 'testID', 'bold');
  routeProp(bold, 'style', CANARY_BOLD_STYLE);
  appendChild(bold, createRawText('web'));
  appendChild(greeting, bold);
  appendChild(app, greeting);
  surface.appendChild(app);
  surface.commit();
}

// The engine surface is all the app there is, so taking it down is the engine's own dispose
const registry = {
  registerComponent: (appKey: string) => appKey,
  runApplication: (_appKey: string, { rootTag }: { rootTag: IRootTag }) =>
    mountCanary(rootTag),
  unmountApplicationComponentAtRootTag: (): void => {},
};

describe('canary on the web', () => {
  afterEach(disposeCanary);

  it('reads the facts of a canary mounted through the engine', async () => {
    const facts = await renderCanaryOnWeb(registry, () => 'unused');

    expect(facts).toEqual(CANARY_FACTS);
  });

  it('leaves the page empty after it is disposed', async () => {
    await renderCanaryOnWeb(registry, () => 'unused');

    await disposeCanary();

    expect(document.getElementById('root')).toBeNull();
  });
});
