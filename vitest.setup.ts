import { mkdirSync } from 'node:fs';

// RN's source reads a bare `__DEV__`, which Metro defines and Node does not
// `RN$Bridgeless` makes RN pick its bridgeless `UIManager`, as on the device we target
Object.assign(globalThis, { __DEV__: true, RN$Bridgeless: true });

// The probe tests dump a census into `.docs/`, which `.gitignore` leaves out of a fresh clone
mkdirSync(new URL('.docs/', import.meta.url), { recursive: true });
