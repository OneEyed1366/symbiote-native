import { act, createElement, useReducer } from 'react';
import { mount, unmount } from '@symbiote-native/react';

let nextRootTag = 20_000;

// Renders `hook` in a component under the React adapter and keeps what it returned each render
export function renderHook<Result, Props = undefined>(
  hook: (props: Props) => Result,
  initialProps: Props,
) {
  nextRootTag += 1;
  const rootTag = nextRootTag;
  const results: Result[] = [];
  let props = initialProps;
  let render: () => void = () => undefined;

  function Probe() {
    const [, again] = useReducer((count: number) => count + 1, 0);
    render = again;
    results.push(hook(props));
    return createElement('view');
  }

  act(() => mount(rootTag, createElement(Probe)));
  return {
    // The result of the latest render
    latest: (): Result => {
      const last = results.at(-1);
      if (last === undefined) throw new Error('the hook has not rendered');
      return last;
    },
    renders: () => results.length,
    rerender: (nextProps: Props): void => {
      props = nextProps;
      act(() => render());
    },
    unmount: (): void => act(() => unmount(rootTag)),
  };
}
