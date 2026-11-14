// The target of the "./bootstrap" export. Metro applies platform extensions to a relative import,
// not to an exports target, so the folder's `index.web` is reached through this hop

export { bootstrapHost, startApp } from './bootstrap';
export type { IAppHost, IBootstrapHostOptions } from './bootstrap';
