import { useState } from 'react';
import { createAnimatedRef, type IAnimatedRef } from '../../core/animated-ref';

export function useAnimatedRef(): IAnimatedRef {
  const [ref] = useState(createAnimatedRef);
  return ref;
}
