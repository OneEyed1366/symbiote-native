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

set_target_properties(symbiote_engine PROPERTIES
        CXX_STANDARD 20
        CXX_STANDARD_REQUIRED ON
        CXX_EXTENSIONS OFF
        POSITION_INDEPENDENT_CODE ON
)

target_compile_definitions(symbiote_engine PRIVATE -DFOLLY_NO_CONFIG=1)

# `jsi` and `reactnative` are the only two prefab modules ReactAndroid publishes
# (ReactAndroid/build.gradle.kts, the `prefab { }` block — the third is `hermestooling`).
# `reactnative` is the merged library that carries react/renderer/uimanager, react/renderer/mounting
# and the turbomodule JNI headers our C++ includes; there is no separate
# `react_renderer_uimanager` prefab target to link.
find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

target_link_libraries(symbiote_engine
        ReactAndroid::reactnative
        ReactAndroid::jsi
        fbjni::fbjni
        android
)
