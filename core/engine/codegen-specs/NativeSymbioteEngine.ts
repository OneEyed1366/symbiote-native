// The TurboModule spec, and it exists almost entirely so that the module gets REGISTERED — the
// capability it carries is installed by `installJSIBindingsWithRuntime:`, not by any method here.
//
// Why a spec at all, when nothing calls through it: `RCTTurboModuleManager` only runs the JSI-binding
// hook when it CREATES the module, and it only creates a module some name resolves to. Codegen with
// `ios.modulesProvider` is what puts `SymbioteEngine -> SymbioteEngineModule` into the generated
// `RCTModuleProviders`, which is the lookup bridgeless mode actually consults. `RCT_EXPORT_MODULE`'s
// load-time class registration is the legacy path and is not something to rely on here.
//
// `getVersion` is therefore not ceremony: it is the liveness probe. The JS side calls it to force
// creation and to learn whether the binary it is talking to is old — a native module and the JS that
// drives it ship in two different artefacts (a pod and an npm package), so they can disagree, and
// nothing else in this repo would notice.
//
// This file lives OUTSIDE `src/` deliberately. `core/engine/tsconfig.json` includes only `src`, and
// `core/engine/src` holds zero imports from `react-native` — an invariant the RN-port-elimination
// work depends on. Codegen parses this file; nothing bundles it.

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** The native ABI version. Bumped whenever the host object's shape changes. */
  getVersion(): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SymbioteEngine');
