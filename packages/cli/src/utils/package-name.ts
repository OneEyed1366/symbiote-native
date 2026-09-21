// Mirrors create-vue's own isValidPackageName/toValidPackageName exactly (see
// generate.ts's own comment on why this matters) — the app's DIRECTORY name can be anything the
// filesystem accepts ("My Cool App"), but package.json's "name" field is a real npm package name
// with its own character rules; writing the raw app name there unvalidated produces a
// package.json that scaffolds fine and then fails `npm install` with a cryptic npm error.
const VALID_PACKAGE_NAME =
  /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export function isValidPackageName(name: string): boolean {
  return VALID_PACKAGE_NAME.test(name);
}

export function toValidPackageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-');
}
