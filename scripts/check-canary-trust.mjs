// Preflight for the canary-publish job (.github/workflows/release.yml): refuses
// to let CI attempt a canary publish for a package that has never been published
// to npm at all. npm's OIDC trusted-publishing (`npm trust github`, see
// trust-publishers.mjs) can only be registered for a package that already exists
// on the registry, so a never-published package would otherwise 404 silently
// deep inside `changeset publish` instead of failing here with a clear reason.
import { execFileSync } from 'node:child_process';

const rawPackages = (process.env.CANARY_PACKAGES ?? '').trim();
const packages = rawPackages
  ? rawPackages.split(',').map((name) => name.trim()).filter(Boolean)
  : [];

if (packages.length === 0) {
  console.error('CANARY_PACKAGES must be set (expected from the preceding "Resolve changed publishable packages" step).');
  process.exit(1);
}

const shortName = (name) => name.replace('@symbiote-native/', '');

const neverPublished = packages.filter((name) => {
  try {
    execFileSync('npm', ['view', name, 'version'], { stdio: 'pipe' });
    return false;
  } catch {
    return true;
  }
});

if (neverPublished.length > 0) {
  console.error(
    `The following package(s) have never been published to npm, so OIDC trust cannot be registered for them yet: ${neverPublished.join(', ')}\n` +
      `Run \`pnpm run trust:publishers <short-name>\` locally first (one-off, interactive) for each of: ${neverPublished.map(shortName).join(', ')}.`,
  );
  process.exit(1);
}

console.log(`npm trust preflight OK for: ${packages.join(', ')}`);
