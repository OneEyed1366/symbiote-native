// Container color of the `RNSScreenStack` host element, shared by every adapter

import { describe, expect, it } from 'vitest';
import { resolveNativeContainerProps } from './stack-container';

describe('stack container props', () => {
  it('sends nativeContainerStyle backgroundColor as nativeContainerBackgroundColor', () => {
    expect(resolveNativeContainerProps({ backgroundColor: '#112233' })).toEqual(
      { nativeContainerBackgroundColor: '#112233' },
    );
  });

  it('adds nothing when the app sets no container style', () => {
    expect(resolveNativeContainerProps(undefined)).toEqual({});
  });

  it('adds nothing when the container style has no background color', () => {
    expect(resolveNativeContainerProps({})).toEqual({});
  });

  it('ignores a container style that is not an object, as a template attribute may be', () => {
    expect(resolveNativeContainerProps('#112233')).toEqual({});
  });

  it('reads the color from an untyped object, as an adapter attribute bag holds it', () => {
    const attribute: unknown = { backgroundColor: '#112233' };

    expect(resolveNativeContainerProps(attribute)).toEqual({
      nativeContainerBackgroundColor: '#112233',
    });
  });
});
