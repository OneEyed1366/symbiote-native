---
name: symbiote-ios26-chrome-vs-app-bug
description: "Read when investigating a visual glitch on iOS (flicker, seam, border, color snap, momentary artifact near screen edges/corners/navigation header) reported against a Symbiote example app on iOS 26+. Covers two confirmed iOS 26 'Liquid Glass' system rendering behaviors mistaken for app bugs during a real navigation investigation: (1) a 1px anti-aliasing seam at the device's rounded screen corners, brightness ~130-215 gray, position drifting by x as y changes (following the corner arc) — confirmed present in Settings.app, not Symbiote-specific; (2) UINavigationBar back buttons rendering as a translucent floating pill immediately after a push/pop, then morphing into the flat/opaque bar style — also confirmed in Settings.app on a dark screen. Covers the decisive verification method: reproduce the SAME interaction in a stock system app (Settings) at the same screen position/theme, since iOS 26 chrome varies by background lightness (near-invisible on light screens, obvious on dark ones) — this cross-app comparison is what actually settles 'is this ours or the platform's', not code reading or pixel analysis alone. Trigger on: 'screen flickers/blinks near edges after a transition', 'button changes color/shape right after focus', 'thin line/seam at the corner', 'is this our bug or iOS', any RNS/native-stack visual glitch triage on iOS 26 simulators/devices."
---

# iOS 26 system chrome vs. an actual Symbiote bug

Investigation: 2026-07, `packages/navigation` Stack transitions. Reported symptom: "screen
flickers along its edges with the previous screen for ~0.5s after a push/pop." Two of three
suspected symptoms turned out to be iOS 26's own "Liquid Glass" rendering — not SymbioteNative,
not react-native-screens, not fixable/patchable JS-side. Not adapter-specific (platform chrome,
reproduces identically in Settings.app); no cross-link to an adapter skill applies.

```
§1_corner_seam := {
  bug: "1px anti-aliasing seam at device's rounded screen corners, RGB ~(130-220,130-220,130-220) light gray",
  position: "sits on boundary between app content and area beyond the rounded corner;
             x drifts ~1px as y changes, tracing the corner's arc",
  root_cause: "textbook clip-mask anti-aliasing artifact, not a color/logic bug",
  ruled_out_first: "headerTintColor / headerStyle / .screen CSS border-radius — checked clean
                    via code read BEFORE the cross-app test",
  verified: "ImageMagick `magick <crop>.png txt:-` pixel dump (verification-before-completion
             skill's pixel-forensics technique) + reproduced identically in Settings.app on a
             dark settings screen, same simulator position"
}

§2_backbutton_morph := {
  bug: "UINavigationBar back button renders as a translucent floating pill (Liquid Glass
        in-transition style) immediately after push/pop, then snaps to the flat opaque
        nav-bar style once the transition settles",
  visibility: "only perceptible against a dark screen background; same morph happens on
               light screens too, just imperceptible there — why it went unnoticed until a
               dark-themed screen was involved",
  verified: "reproduced in Settings.app"
}

§3_verification_method := {
  method: "reproduce the exact same interaction in a stock system app (Settings.app —
           always available) at the same screen position AND same background lightness",
  why_lightness_matters: "iOS 26 Liquid Glass chrome intensity is background-dependent —
                          near-invisible on light/white screens, obvious on dark ones
                          ⟶ wrong-lightness comparison gives a false negative",
  precedent: "same methodology used earlier in this investigation to rule out a suspected
              device-bezel line (screenshot comparison, identical simulator position)",
  generalizes_to: "any 'is this our rendering or the platform's' question on iOS
                   ⟶ resolve by reproducing in a stock app, not by reading source or
                   reasoning about compositing order",
  order: "code-read to rule out 'is it even our prop' FIRST, cross-app test is the
          DECIDING evidence, not a first resort"
}

§4_open := {
  finding: "Stack's pop path shows a consistent ~480ms gap between the native pop
            transition starting (onWillDisappear) and the JS reducer's Fabric commit
            actually removing the popped route",
  measured_via: "dlog in packages/navigation/src/react/stack.ts",
  status: "unconfirmed whether this lag has ANY visible consequence, now that the two
           suspected symptoms above turned out to be platform chrome — treat as a known
           timing characteristic, not a proven bug, unless a NEW visual symptom survives
           its own cross-app test (§3)"
}
```
