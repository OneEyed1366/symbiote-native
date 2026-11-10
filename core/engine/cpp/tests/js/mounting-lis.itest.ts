// RN's `Mounting-itest` with `useLISAlgorithmInDifferentiator` on
// @symbiote-fabric-flags {"useLISAlgorithmInDifferentiator":true}

import { defineMountingCases } from './mounting-cases';
import { report } from './harness';

defineMountingCases(true);
report();
