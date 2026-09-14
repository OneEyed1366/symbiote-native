// Control for engine-share-of-pass1.bench.ts: proves the bench's class strings actually RESOLVE.
// A registry that matched nothing would make routeProp's class branch nearly free and the whole
// measurement a report about a path that never ran.
import { expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  registerRules,
  routeProp,
} from '../index';

const fabric = installFabric();

it('the bench class strings resolve to real style', () => {
  registerRules([
    {
      tokens: ['bench-row'],
      specificity: [0, 1, 0],
      order: 0,
      style: { flexDirection: 'row', alignItems: 'center', height: 44 },
    },
  ]);
  const surface = createSurface(99_001);
  const node = createElement('RCTView');
  routeProp(node, 'class', 'bench-row');
  surface.appendChild(node);
  surface.commit();
  const committed = fabric.appRoot().children[0];
  expect(committed.props).toMatchObject({ flexDirection: 'row', height: 44 });
});
