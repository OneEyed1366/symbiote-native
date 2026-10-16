// RN's `Mounting-itest` with `useLISAlgorithmInDifferentiator` off
// @symbiote-fabric-flags {"useLISAlgorithmInDifferentiator":false}

import { defineMountingCases } from './mounting-cases';
import { report } from './harness';

defineMountingCases(false);
report();
