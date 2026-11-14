import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// RN's source reads a bare `__DEV__`, which Metro defines and Node does not
// `RN$Bridgeless` makes RN pick its bridgeless `UIManager`, as on the device we target
Object.assign(globalThis, { __DEV__: true, RN$Bridgeless: true });

// The probe tests dump a census into `.docs/`, which `.gitignore` leaves out of a fresh clone
// A path, not a `file:` URL: a DOM test environment swaps the global `URL` for one fs rejects
mkdirSync(join(import.meta.dirname, '.docs'), { recursive: true });
