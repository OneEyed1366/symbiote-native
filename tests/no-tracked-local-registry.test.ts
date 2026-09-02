// Nothing TRACKED may point npm at a machine-local registry.
//
// The release path publishes to npmjs from GitHub Actions using trusted publishing — `id-token:
// write` in `release.yml`, an OIDC exchange between the workflow and npmjs. That mechanism does not
// read a registry URL out of a config file, and `setup-node` writes `registry-url:
// https://registry.npmjs.org` at job start regardless. So the cloud publish is insulated from the
// local dev registry by construction.
//
// This test exists because "by construction" decays. The local loop
// (`scripts/local-registry.mjs`) works by writing `examples/<app>/.npmrc` with a
// `@symbiote-native:registry=http://localhost:4873/` line, and those files are gitignored for a
// hard reason: **npm has no registry fallback chain.** A configured registry that is unreachable is
// an install FAILURE, not a quiet fall-through to npmjs. One such line committed by accident — a
// `git add -f`, a loosened ignore rule, a helpful copy into the repo root — breaks `npm install`
// for every clone that is not running Verdaccio, and breaks it with a network error that reads as
// a broken machine rather than a bad commit.
//
// The check is on the git INDEX, not the working tree: an untracked `.npmrc` full of localhost is
// the normal, intended state of a developer's checkout.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

function trackedFiles(pattern: string): string[] {
  const output = execFileSync('git', ['ls-files', pattern], {
    encoding: 'utf8',
  }).trim();
  return output === '' ? [] : output.split('\n');
}

function registryLines(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line: string) => !line.trimStart().startsWith('#'))
    .filter((line: string) => /registry\s*=/.test(line));
}

describe('no tracked file points npm at a local registry', () => {
  it('every tracked .npmrc is free of a loopback registry', () => {
    const offenders = trackedFiles('*.npmrc')
      .concat(trackedFiles('**/.npmrc'))
      .flatMap(path =>
        registryLines(path)
          .filter((line: string) =>
            LOCAL_HOSTS.some(host => line.includes(host)),
          )
          .map((line: string) => `${path}: ${line.trim()}`),
      );

    expect(offenders).toEqual([]);
  });

  // The template is deliberately full of localhost — it is what somebody copies INTO an example.
  // What must never happen is it being named `.npmrc`, because then npm READS it. Pinning the name
  // is the whole guard: the two files differ by a suffix and sit at the same level, which is
  // exactly the pair a tidying commit collapses.
  //
  // Asserted on DISK, not on the git index. Whether the template is committed is the maintainer's
  // decision and can legitimately be "not yet"; that it is not called `.npmrc` is the property.
  it('the template is a template, not an active config', () => {
    expect(existsSync('.npmrc.example')).toBe(true);
    expect(readFileSync('.npmrc.example', 'utf8')).toContain('localhost:4873');
    // The active root config, which npm does read, must stay clean — covered above, pinned here
    // as the pair so the two files are never conflated.
    expect(registryLines('.npmrc')).toEqual([]);
  });

  // THE SECOND CHANNEL, and the header above named only the first for as long as this file existed.
  // `.npmrc` decides where npm LOOKS; `package-lock.json` records where it FOUND it, one
  // `"resolved": "http://localhost:4873/..."` per package. npm prefers that URL on a later install,
  // so a committed lockfile breaks a clone exactly as a committed `.npmrc` would — same hard
  // failure, same misleading network error, and this one arrives through an ordinary `npm install`
  // rather than through anyone editing a config.
  //
  // Measured 2026-09-02: one `registry:refresh` across the examples left every tracked lockfile
  // carrying 8-31 such lines. Nothing was committed, and nothing would have said so.
  //
  // Read from the INDEX (`git show :path`), never from disk. A working tree full of localhost is
  // the NORMAL state while the local loop is in use — a disk check would fail for everyone using
  // the thing this repo recommends. What must never happen is that state being staged.
  it('no lockfile staged for commit resolves through a local registry', () => {
    const offenders = trackedFiles('**/package-lock.json').flatMap(path => {
      const staged = execFileSync('git', ['show', `:${path}`], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 64,
      });
      return staged
        .split('\n')
        .filter((line: string) => line.includes('"resolved"'))
        .filter((line: string) => LOCAL_HOSTS.some(host => line.includes(host)))
        .map((line: string) => `${path}: ${line.trim()}`);
    });

    expect(offenders).toEqual([]);
  });

  // The RULE, rather than a check on whoever is still tracked. As of 2026-09-02 eleven examples
  // gitignore their lockfile and only `bare-rn` does not — so the row above now inspects one file
  // that carries no `@symbiote-native` dependency and therefore cannot be contaminated. Left alone
  // it would be a guard reading a permanently clean subject.
  //
  // This asserts the property that keeps it that way: an example that resolves our packages does
  // not track its lockfile. Derived from `examples/` on disk, so the next example added is covered
  // the day its folder exists — a hand-written list is the staleness bug `adapterNames()` exists to
  // kill, and this file would inherit it.
  //
  // `bare-rn` is excluded BY THE DERIVATION, not by name: it declares no `@symbiote-native`
  // dependency (deliberately — it is the stock-React-Native measurement baseline), so nothing can
  // resolve through the local registry there and pinning it has real value.
  it('an example resolving our packages does not track its lockfile', () => {
    const offenders = readdirSync('examples', { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .filter(entry => existsSync(`examples/${entry.name}/package.json`))
      .filter(entry =>
        readFileSync(`examples/${entry.name}/package.json`, 'utf8').includes(
          '@symbiote-native/',
        ),
      )
      .map(entry => `examples/${entry.name}/package-lock.json`)
      .filter(path => trackedFiles(path).length > 0);

    expect(offenders).toEqual([]);
  });

  // The control. Every assertion above is "a list is empty" / "a file exists", and a `trackedFiles`
  // that returned nothing would satisfy them for the wrong reason — the false green this repo has
  // now hit in five different harnesses. Prove the helper reads a real, non-empty index.
  it('reads a real git index, so an empty offender list means agreement', () => {
    expect(trackedFiles('package.json').length).toBeGreaterThan(0);
    expect(trackedFiles('.npmrc')).toEqual(['.npmrc']);
    // Both lockfile rows are derived, and both are satisfied by an empty derivation: no tracked
    // lockfile at all, or no example declaring one of our packages. Pin that neither list is empty.
    expect(trackedFiles('**/package-lock.json').length).toBeGreaterThan(0);
    expect(
      readdirSync('examples', { withFileTypes: true }).filter(
        entry =>
          entry.isDirectory() &&
          existsSync(`examples/${entry.name}/package.json`) &&
          readFileSync(`examples/${entry.name}/package.json`, 'utf8').includes(
            '@symbiote-native/',
          ),
      ).length,
    ).toBeGreaterThan(0);
  });
});
