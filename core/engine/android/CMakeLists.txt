# The Android half of the engine's native module. It compiles `../cpp` — the SAME sources the
# podspec globs — plus the JNI registration shim beside this file. Nothing under `cpp/` is copied
# or forked; the whole point of the split is that only the registration is per-platform.
#
# Shaped after the one third-party precedent that is already in this repo's own app trees and
# already builds against RN 0.86: `react-native-screens/android/CMakeLists.txt`.

cmake_minimum_required(VERSION 3.13)

project(symbiote_engine)

set(CMAKE_VERBOSE_MAKEFILE ON)

# Globbed, not listed, and that is deliberate: the iOS podspec globs `cpp/**/*.{h,cpp}`, so a listed
# set here would mean a new shared source compiles on one platform and not the other — a link error
# on Android for a symbol iOS resolves fine, arriving whenever somebody adds a file and forgets this
# line. RN's own fantom tester globs its sources for the same reason.
file(GLOB SYMBIOTE_SHARED_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/*.cpp)

add_library(symbiote_engine
        SHARED
        ${SYMBIOTE_SHARED_SOURCES}
        src/main/cpp/SymbioteEngineJni.cpp
)

# So the JNI shim can say `#include "SymbioteEngineBindings.h"` rather than walk four levels up.
target_include_directories(symbiote_engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../cpp)

# `measure` / `measureInWindow` / `measureLayout` need `react/renderer/dom/DOM.h`. libreactnative.so
# EXPORTS `facebook::react::dom::measure*`, but the prefab ships no `dom/` headers, so without this
# SymbioteTree.cpp's `__has_include` compiles the throwing stubs. Only that one header is copied into
# a private root: putting all of ReactCommon on the path would shadow the prefab's own headers.
set(SYMBIOTE_RN_DOM_HEADER ${REACT_NATIVE_DIR}/ReactCommon/react/renderer/dom/DOM.h)
if(DEFINED REACT_NATIVE_DIR AND EXISTS ${SYMBIOTE_RN_DOM_HEADER})
  set(SYMBIOTE_RN_DOM_ROOT ${CMAKE_CURRENT_BINARY_DIR}/rn-dom-include)
  file(COPY ${SYMBIOTE_RN_DOM_HEADER} DESTINATION ${SYMBIOTE_RN_DOM_ROOT}/react/renderer/dom)
  target_include_directories(symbiote_engine PRIVATE ${SYMBIOTE_RN_DOM_ROOT})
else()
  message(WARNING "symbiote_engine: ${SYMBIOTE_RN_DOM_HEADER} not found, measure* will throw")
endif()

set_target_properties(symbiote_engine PROPERTIES
        CXX_STANDARD 20
        CXX_STANDARD_REQUIRED ON
        CXX_EXTENSIONS OFF
        POSITION_INDEPENDENT_CODE ON
)

# Must match the flags libreactnative.so's folly was built with
# (ReactAndroid/cmake-utils/folly-flags.cmake). FOLLY_MOBILE is ABI, not tuning: without it arm64
# picks the SIMD F14 layout while RN's folly is the fallback one, and the link fails on
# `folly::f14::detail::F14LinkCheck<1>::check()` / `tlsPendingSafeInserts` from any folly::dynamic.
target_compile_definitions(symbiote_engine PRIVATE
        -DFOLLY_NO_CONFIG=1
        -DFOLLY_HAVE_CLOCK_GETTIME=1
        -DFOLLY_USE_LIBCPP=1
        -DFOLLY_CFG_NO_COROUTINES=1
        -DFOLLY_MOBILE=1
        -DFOLLY_HAVE_RECVMMSG=1
        -DFOLLY_HAVE_PTHREAD=1
        -DFOLLY_HAVE_XSI_STRERROR_R=1
)

# `jsi` and `reactnative` are the only two prefab modules ReactAndroid publishes
# (ReactAndroid/build.gradle.kts, the `prefab { }` block — the third is `hermestooling`).
# `reactnative` is the merged library that carries react/renderer/uimanager, react/renderer/mounting
# and the turbomodule JNI headers our C++ includes; there is no separate
# `react_renderer_uimanager` prefab target to link.
# 16 KB page-size devices (Android 15+) refuse a 4 KB-aligned LOAD segment and drop the whole app
# into compat mode. NDK r27 still links 4 KB by default; RN's own libraries already ship 16 KB.
target_link_options(symbiote_engine PRIVATE -Wl,-z,max-page-size=16384)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

target_link_libraries(symbiote_engine
        ReactAndroid::reactnative
        ReactAndroid::jsi
        fbjni::fbjni
        android
)
