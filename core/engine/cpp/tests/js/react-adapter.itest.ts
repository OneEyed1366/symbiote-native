// The React adapter on the real engine — the second half of the "can an adapter run here" question.
//
// React is the one that could genuinely have failed where Vue did not: it drags `react-reconciler`
// in, which schedules work rather than rendering inline, and a scheduler wants a host environment
// this runtime does not obviously have. If it mounts, every adapter shape in the repo has a route
// here, because React's is the heaviest.
//
// `createElement` rather than JSX so the subject stays the adapter. JSX is a bundler setting, and a
// failure in it would be indistinguishable from a failure in the reconciler.

import { createElement } from 'react';

import { mount } from '@symbiote-native/react';

import {
  committedShape,
  describe,
  expect,
  flushTimers,
  it,
  report,
} from './harness';

describe('the React adapter on the real engine', () => {
  // why: the reconciler is the part that might not run at all here. One host element proves the
  // whole chain: fiber -> host config -> engine -> applyOps -> ShadowTree.
  it('renders a host element into the committed tree', () => {
    const surface = mount(1, createElement('view', { testID: 'from-react' }));
    flushTimers();
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View()))');
  });

  // why: children go through `appendChild` on the host config, which is the path an adapter test
  // actually exercises.
  it('renders nested host elements in order', () => {
    const surface = mount(
      1,
      createElement(
        'view',
        { testID: 'outer' },
        createElement('view', { testID: 'first' }),
        createElement('view', { testID: 'second' }),
      ),
    );
    flushTimers();
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View(View()View())))');
  });
});

report();
