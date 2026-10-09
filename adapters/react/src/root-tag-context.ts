// RN's `RootTagContext`: every `mount` provides the tag of its surface, 0 stays the default

import { createContext } from 'react';
import type { IRootTag } from '@symbiote-native/engine';

const NO_SURFACE = 0;

export const RootTagContext = createContext<IRootTag>(NO_SURFACE);
