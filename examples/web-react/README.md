# web-react

Web canary for the React adapter. It renders `screens/CanaryScreen` alone, with no navigator.
Run it with `npm install` then `npm run web` (Expo CLI, Metro).

Standalone like every `examples/*` app: literal versions, plain `npm install`, no pnpm workspace.

## Status

Bundles and loads in the browser, renders nothing yet. Remaining blockers:

- `@symbiote-native/web` (the DOM host) and the web variant of `@symbiote-native/react/bootstrap`
  do not exist.
- The slider has a no-op web `register` (`packages/slider/src/register/index.web.ts`) and no DOM
  twin, so the slider section has no web view yet. Install a build that contains it.

Design: `.claude/skills/symbiote-web-platform/SKILL.md`.
