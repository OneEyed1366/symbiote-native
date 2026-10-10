---
name: symbiote-release-tweet
description: "Draft a short X/Twitter announcement for a fresh symbiote-native release. Read the git history and changelogs first, never memory. Use after a release merge (`Release DD.MM.YYYY`, `chore: version packages`) or when asked for 'твит', 'tweet', 'анонс', 'announce release', 'пост в X/twitter', 'хештеги'. Output is a DRAFT only: the maintainer posts it by hand, nothing goes out through an API."
---

# Release tweet

## 1. Source the facts (mandatory)

```
git log --oneline -15                                        # find the release merge
git show -s --format=%B <release-merge>                      # squashed commit list
git show <version-packages-commit> -- '*/CHANGELOG.md' | \grep '^+- '   # what shipped
```

Lead with `feat(...)` entries that a user can see. Skip `docs/chore/test/refactor/ci` unless
they are the whole story. Every claim in the draft has to trace to a commit or changelog line.
WHY: one draft claimed Expo support was new when it had shipped a release earlier. Only 9
wrappers were new.

## 2. Shape

```
Main tweet   160-220 chars, hard cap 280
  line 1     user-visible win, framed for Vue/Svelte/Solid/Angular devs
             (the differentiator: native RN without React)
  line 2     the count or one command (`npx @symbiote-native/cli add --<flag>`)
  media      GIF/video from an examples/* canary > screenshot > none
  tags       <=2 hashtags, at the end
Reply        changelog / release link. NEVER a link in the main tweet:
             X down-ranks external links, hardest for non-Premium accounts
```

Banned: "Excited to announce", "vX.Y.Z released" as the hook, emoji walls, a list of more
than 4 items.

## 3. Discoverability (hashtags and mentions)

More than 2 hashtags trips X's spam classifier and costs reach. Pick by the release's audience:

| Release touches | Hashtags (pick up to 2) |
|---|---|
| Expo wrappers | `#Expo` `#ReactNative` |
| Vue adapter | `#VueJS` `#ReactNative` |
| Svelte / Solid / Angular | `#Svelte` / `#SolidJS` / `#Angular` + `#ReactNative` |
| Perf / engine | `#ReactNative` `#OpenSource` |
| Generic | `#buildinpublic` (community tag, the best single pick) |

Mentions (`@expo`, `@vuejs`, `@sveltejs`, `@solid_js`, `@angular`) go in the REPLY, at most one,
and only when the release is mainly about that ecosystem. Several brand tags in one
main tweet read as spam.

## 4. Hand-off

Return the draft in a fenced block, plus one line on which media to record. Never post. X API
writes are paid, and any outbound action needs the maintainer's explicit per-action yes.
