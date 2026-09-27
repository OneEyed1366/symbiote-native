# The Hermes feasibility probe

`hermes-probe.cpp` answers one question and nothing else: **can a plain macOS binary host Hermes
through the same JSI headers our engine compiles against?** It does, which is why
`-DSYMBIOTE_JS_ENGINE=hermes` exists on the tester.

It is deliberately NOT a CMake target — it settles a toolchain yes/no, and a target nobody runs is a
target that rots. Build it by hand when the answer needs re-checking, after a React Native or
`hermes-engine` bump:

```bash
D=examples/bare-rn/ios/Pods/hermes-engine/destroot
clang++ -std=c++20 -O2 core/engine/cpp/tests/hermes-probe/hermes-probe.cpp \
  -I"$D/include" -I.vendors/react-native/packages/react-native/ReactCommon/jsi \
  -F"$D/Library/Frameworks/macosx" -framework hermesvm \
  -Wl,-rpath,"$PWD/$D/Library/Frameworks/macosx" -o /tmp/hermes-probe && /tmp/hermes-probe
```

Expected:

```
sum=2
text=0,2,4
arraySum=28
```

The destroot arrives with `pod install` in any example and is NOT tracked — `ios/Pods/` is
gitignored. If it is missing, run `pod install` in one of the example apps first.

**The one thing to re-check on a bump** is that `$D/include/jsi/jsi.h` is still byte-identical to
`.vendors/react-native/.../ReactCommon/jsi/jsi.h`. A JSI ABI mismatch between the prebuilt dylib and
the headers our C++ compiles against does not crash — it returns wrong numbers, which is the worst
failure a measurement host can have:

```bash
diff -q "$D/include/jsi/jsi.h" \
  .vendors/react-native/packages/react-native/ReactCommon/jsi/jsi.h
```
