# Host build of the REAL Fabric C++ core, so `SymbioteTree.cpp` can be tested against real
# `ShadowNode`s instead of against a second implementation written in TypeScript.
#
# Two device aborts on 2026-09-15 (`ShadowNodeFamily::setParent`, `ShadowNode::replaceChild`) sat
# under 5 666 green tests, because those tests ran against `core/test-utils/src/tree-applier.ts` --
# a JS stand-in that cannot abort, cannot hold a family, and duplicates rules nobody cross-checks.
# Both aborts are `react_native_assert`s, i.e. they fire in a build with NDEBUG off. This build has
# NDEBUG off.
#
# Nothing here is invented: React Native already builds this exact set for the host in
# `private/react-native-fantom/tester/CMakeLists.txt` (its `fantom_tester`), and every ReactCommon
# module ships its own `CMakeLists.txt` declaring its own dependencies. We reuse those verbatim via
# `add_subdirectory` and supply only what Fantom gets from a gradle download: the third-party libs.
#
# Fantom's third-party half is where we deliberately diverge. It compiles boost/folly/glog/fmt from
# sources gradle fetches into `ReactAndroid/build/third-party-ndk`, which no `npm install` produces.
# Homebrew already carries all of them, so we point at those instead -- see `FOLLY_NO_CONFIG` below
# for the one consequence.
#
#   pnpm run test:cpp
#
# The build directory is `core/engine/cpp/tests/build`, which `.gitignore` already covers. Warm
# builds are seconds; the first is minutes, because it compiles ReactCommon.

cmake_minimum_required(VERSION 3.20)
project(symbiote_tree_tests CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Asserts are the point of this build. `react_native_assert` compiles to nothing under NDEBUG, which
# is exactly how a Release device build turned a hard abort into a silently mis-attached child.
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Debug)
endif()

# NOT `RN_SERIALIZABLE_STATE`. It would make `Props::rawProps` carry every parsed prop as
# `folly::dynamic`, which is the complete props read-back this harness would like — and it is
# Android-only for a real reason: `State.h` includes `fbjni/fbjni.h` under it. Tried 2026-09-15,
# fails to compile on a host build. What a test can read back about props is therefore what
# `getDebugProps` reports, which is a hand-written SELECTION — see `js/harness.ts`.

# ── Where React Native's C++ lives ───────────────────────────────────────────────────────────────
# The INSTALLED copy, not `.vendors/react-native`: this must be the same source the app ships.
if(NOT DEFINED REACT_COMMON_DIR)
  execute_process(
    COMMAND node -e "process.stdout.write(require('path').dirname(require.resolve('react-native/package.json')))"
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    OUTPUT_VARIABLE REACT_NATIVE_DIR
    RESULT_VARIABLE resolve_status)
  if(NOT resolve_status EQUAL 0)
    message(FATAL_ERROR "could not resolve react-native; run pnpm install first")
  endif()
  set(REACT_COMMON_DIR ${REACT_NATIVE_DIR}/ReactCommon)
  # A few modules (jsinspector-modern) include a helper out of the Android tree even off Android.
  set(REACT_ANDROID_DIR ${REACT_NATIVE_DIR}/ReactAndroid)
endif()
if(NOT EXISTS ${REACT_COMMON_DIR}/react/renderer/core/CMakeLists.txt)
  message(FATAL_ERROR "no ReactCommon CMake files under ${REACT_COMMON_DIR}")
endif()
message(STATUS "ReactCommon: ${REACT_COMMON_DIR}")

# ── Third-party, from Homebrew ───────────────────────────────────────────────────────────────────
find_program(BREW_EXECUTABLE brew REQUIRED)
execute_process(COMMAND ${BREW_EXECUTABLE} --prefix OUTPUT_VARIABLE BREW_PREFIX OUTPUT_STRIP_TRAILING_WHITESPACE)
list(APPEND CMAKE_PREFIX_PATH ${BREW_PREFIX})

function(symbiote_brew_lib target package lib_name)
  execute_process(COMMAND ${BREW_EXECUTABLE} --prefix ${package}
    OUTPUT_VARIABLE prefix OUTPUT_STRIP_TRAILING_WHITESPACE RESULT_VARIABLE status)
  # `brew --prefix <formula>` answers for a formula it merely KNOWS, installed or not, so the exit
  # code proves nothing and the directory has to be checked instead.
  if(NOT status EQUAL 0 OR NOT IS_DIRECTORY ${prefix})
    message(FATAL_ERROR "missing dependency: brew install ${package}")
  endif()
  add_library(${target} INTERFACE IMPORTED GLOBAL)
  target_include_directories(${target} INTERFACE ${prefix}/include)
  if(NOT lib_name STREQUAL "HEADER_ONLY")
    find_library(${target}_PATH ${lib_name} HINTS ${prefix}/lib REQUIRED NO_DEFAULT_PATH)
    target_link_libraries(${target} INTERFACE ${${target}_PATH})
  endif()
endfunction()

# The names on the left are what ReactCommon's own CMakeLists link against.
symbiote_brew_lib(folly_runtime folly folly)
symbiote_brew_lib(glog glog glog)
symbiote_brew_lib(fmt fmt fmt)
symbiote_brew_lib(double-conversion double-conversion double-conversion)
symbiote_brew_lib(gflags gflags gflags)
symbiote_brew_lib(boost boost HEADER_ONLY)

# The one dependency Homebrew is not asked for: React Native pins fast_float to an exact tag
# (`third-party-podspecs/fast_float.podspec`), it is header-only, and a version drift here changes
# how CSS numbers parse. Fetch that tag rather than whatever the machine happens to carry.
include(FetchContent)
FetchContent_Declare(fast_float_src
  GIT_REPOSITORY https://github.com/fastfloat/fast_float.git
  GIT_TAG v8.0.0
  GIT_SHALLOW TRUE)
FetchContent_Populate(fast_float_src)
add_library(fast_float INTERFACE)
target_include_directories(fast_float INTERFACE ${fast_float_src_SOURCE_DIR}/include)
# `react_renderer_core` includes `CSSTokenizer.h` without linking the css module, so on Android this
# header is found through a global third-party include path. Reproduce that rather than patch RN.
include_directories(${fast_float_src_SOURCE_DIR}/include)

# glog >= 0.6 refuses to be included without this; RN's own builds get it from their vendored copy.
target_compile_definitions(glog INTERFACE GLOG_USE_GLOG_EXPORT)

# ReactCommon links `folly_runtime` alone, because its own folly is built with those dependencies
# folded in. Homebrew's is a normal library with normal dependencies, so they have to travel with it
# -- folly's HEADERS alone reach into boost's preprocessor and fmt's formatter.
set_property(TARGET folly_runtime APPEND PROPERTY
  INTERFACE_LINK_LIBRARIES boost fmt glog gflags double-conversion)

add_library(glog_init INTERFACE)

# ── ReactCommon, module by module, using React Native's own build files ──────────────────────────
# Several of those files call `react_native_android_selector` without including what defines it --
# it is expected to already be in scope, which on Android it is. Define it here, once, for all of
# them: functions declared in this directory are visible to every `add_subdirectory` below.
include(${REACT_COMMON_DIR}/cmake-utils/internal/react-native-platform-selector.cmake)

# Several modules carry a `platform/{android,cxx,ios}` split and export their chosen one PUBLIC --
# and modules that include those headers without linking the module (componentregistry reaching for
# `HostPlatformViewProps.h`, for one) rely on the path being global. `cxx` is the non-Apple,
# non-Android variant, and it is the one a host build wants.
foreach(module
    react/renderer/components/modal
    react/renderer/components/scrollview
    react/renderer/components/text
    react/renderer/components/view
    react/renderer/graphics
    react/renderer/imagemanager
    react/renderer/textlayoutmanager
    react/utils
    runtimeexecutor)
  include_directories(${REACT_COMMON_DIR}/${module}/platform/cxx)
endforeach()

function(add_react_common_subdir relative_path)
  add_subdirectory(${REACT_COMMON_DIR}/${relative_path} ReactCommon/${relative_path})
endfunction()

add_react_common_subdir(jsi)
add_react_common_subdir(logger)
add_react_common_subdir(oscompat)
add_react_common_subdir(reactperflogger)
add_react_common_subdir(runtimeexecutor)
add_react_common_subdir(callinvoker)
add_react_common_subdir(yoga)
add_react_common_subdir(react/debug)
add_react_common_subdir(react/utils)
add_react_common_subdir(react/timing)
add_react_common_subdir(react/featureflags)
add_react_common_subdir(react/bridging)
add_react_common_subdir(react/renderer/debug)
add_react_common_subdir(react/renderer/graphics)
add_react_common_subdir(react/renderer/mapbuffer)
add_react_common_subdir(react/renderer/css)
add_react_common_subdir(react/renderer/runtimescheduler)
add_react_common_subdir(react/renderer/core)
add_react_common_subdir(react/renderer/componentregistry)
add_react_common_subdir(react/renderer/consistency)
add_react_common_subdir(react/renderer/leakchecker)
add_react_common_subdir(react/renderer/telemetry)
add_react_common_subdir(react/renderer/mounting)
add_react_common_subdir(react/renderer/observers/events)
add_react_common_subdir(react/renderer/components/view)
add_react_common_subdir(react/renderer/components/root)

# ── The codegen'd core spec ──────────────────────────────────────────────────────────────────────
# `Modal`, `SafeAreaView`, `TextInput` and `Switch` include
# `react/renderer/components/FBReactNativeSpec/EventEmitters.h` and link `react_codegen_rncore`,
# both of which an app gets from React Native's codegen. Running that codegen here produces
# nothing — it reports "Skipping … as it has been generated already", because React Native SHIPS
# the generated sources at `React/FBReactNativeSpec`. So the target is built from those, rather
# than from a generation step a test build has no reason to own.
set(FB_SPEC_DIR ${REACT_NATIVE_DIR}/React/FBReactNativeSpec)
if(EXISTS ${FB_SPEC_DIR}/react/renderer/components/FBReactNativeSpec/EventEmitters.cpp)
  file(GLOB fb_spec_SRC CONFIGURE_DEPENDS
    ${FB_SPEC_DIR}/react/renderer/components/FBReactNativeSpec/*.cpp)
  add_library(react_codegen_rncore STATIC ${fb_spec_SRC})
  target_include_directories(react_codegen_rncore PUBLIC ${FB_SPEC_DIR} ${REACT_COMMON_DIR})
  target_link_libraries(react_codegen_rncore
    folly_runtime glog react_renderer_core react_renderer_componentregistry
    react_renderer_debug react_renderer_graphics react_renderer_imagemanager rrc_view yoga)
  # NOT `safeareaview`: its own CMakeLists links `fbjni` and `reactnativejni` unconditionally, so it
  # is Android-only however the spec is supplied. `modal` needs `rrc_image`, which is why that one
  # is here too rather than for its own sake.
  add_react_common_subdir(react/renderer/components/image)
  add_react_common_subdir(react/renderer/components/modal)
else()
  message(STATUS "no shipped FBReactNativeSpec: Modal and Image stay unregistered")
endif()
add_react_common_subdir(react/renderer/element)
add_react_common_subdir(cxxreact)
add_react_common_subdir(jsinspector-modern)
add_react_common_subdir(jsinspector-modern/cdp)
add_react_common_subdir(jsinspector-modern/network)
add_react_common_subdir(jsinspector-modern/tracing)
add_react_common_subdir(react/performance/timeline)
add_react_common_subdir(react/renderer/attributedstring)
add_react_common_subdir(react/renderer/textlayoutmanager)
add_react_common_subdir(react/renderer/imagemanager)
add_react_common_subdir(react/renderer/components/text)
add_react_common_subdir(react/renderer/components/scrollview)
add_react_common_subdir(react/renderer/components/legacyviewmanagerinterop)
add_react_common_subdir(react/renderer/bridging)
add_react_common_subdir(react/renderer/dom)
add_react_common_subdir(react/renderer/uimanager)
add_react_common_subdir(react/renderer/uimanager/consistency)

# Yoga's own CMakeLists names the target `yogacore`; ReactCommon links it as `yoga`.
if(TARGET yogacore AND NOT TARGET yoga)
  add_library(yoga ALIAS yogacore)
endif()

# ── Two compile flags React Native sets that this build has to undo ──────────────────────────────
#
# `-DFOLLY_NO_CONFIG=1` (from `cmake-utils/react-native-flags.cmake`) tells folly's headers to guess
# their configuration instead of reading `folly-config.h`. That is right when folly is compiled from
# source alongside, and wrong here: Homebrew's `libfolly` was built WITH a config, so guessing would
# give our translation units a different folly than the one they link against. `-U` after the `-D`
# wins on the clang command line, which is why this runs after every `add_subdirectory`.
#
# `-Werror` is React Native's, against React Native's pinned toolchain. Ours is whatever Xcode ships.
#
# The walk also collects every target it touches, because ReactCommon is built almost entirely out
# of OBJECT libraries and CMake does not carry an object library's objects through ANOTHER object
# library. Linking only the modules we name directly leaves the ones they depend on as undefined
# symbols. React Native's own host build hits this and answers it the same way -- Fantom's
# `target_link_libraries` enumerates all sixty-odd targets by hand. Collecting them is the same
# answer without the hand.
function(symbiote_walk_react_targets dir out_var)
  set(collected ${${out_var}})
  get_property(targets DIRECTORY ${dir} PROPERTY BUILDSYSTEM_TARGETS)
  foreach(target ${targets})
    get_target_property(type ${target} TYPE)
    if(NOT type STREQUAL "INTERFACE_LIBRARY")
      target_compile_options(${target} PRIVATE -UFOLLY_NO_CONFIG -Wno-error)
      list(APPEND collected ${target})
    endif()
  endforeach()
  get_property(children DIRECTORY ${dir} PROPERTY SUBDIRECTORIES)
  foreach(child ${children})
    symbiote_walk_react_targets(${child} collected)
  endforeach()
  set(${out_var} ${collected} PARENT_SCOPE)
endfunction()

set(REACT_TARGETS "")
symbiote_walk_react_targets(${CMAKE_CURRENT_SOURCE_DIR} REACT_TARGETS)
list(REMOVE_DUPLICATES REACT_TARGETS)

# ── The tests ────────────────────────────────────────────────────────────────────────────────────
# React Native's own C++ tests are gtest, so these are too. Homebrew's googletest is used when it is
# there; otherwise it is fetched into the build directory rather than installed onto the machine.
find_package(GTest QUIET)
if(NOT TARGET GTest::gtest_main)
  include(FetchContent)
  FetchContent_Declare(googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.17.0
    GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(googletest)
endif()
enable_testing()

# JavaScriptCore is an Apple framework on macOS and WebKitGTK ships the same C API elsewhere, so
# `ReactCommon/jsc/JSCRuntime.cpp` compiles against either once the include path is right.
if(APPLE)
  set(SYMBIOTE_JSC_LINK ${SYMBIOTE_JSC_LINK})
else()
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(JSCGTK REQUIRED javascriptcoregtk-4.1)
  set(SYMBIOTE_JSC_LINK ${JSCGTK_LINK_LIBRARIES})
  include_directories(${JSCGTK_INCLUDE_DIRS})
endif()

# A REAL JSI runtime, so `Tree::applyOps` is called the way the device calls it -- same argument
# decoding, same `NativeState` ownership, same `Int32Array`. Hermes would need its source fetched and
# built; JavaScriptCore ships with macOS and React Native already carries a JSI binding for it
# (`ReactCommon/jsc/JSCRuntime.cpp`, no CMakeLists of its own, so it is compiled in directly).
add_executable(symbiote_tree_tests
  harness-smoke.cpp
  tree-through-jsi.cpp
  mounted-tree.cpp
  ${REACT_COMMON_DIR}/jsc/JSCRuntime.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteTree.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteDebug.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteFabricProps.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteEngineBindings.cpp)
target_include_directories(symbiote_tree_tests PRIVATE
  ${REACT_COMMON_DIR} ${REACT_COMMON_DIR}/jsi ${REACT_COMMON_DIR}/jsc
  ${CMAKE_CURRENT_SOURCE_DIR}/..)
target_compile_options(symbiote_tree_tests PRIVATE -fexceptions -frtti -Wall)
target_link_libraries(symbiote_tree_tests PRIVATE
  GTest::gtest_main
  folly_runtime
  ${REACT_TARGETS}
  ${SYMBIOTE_JSC_LINK})

add_test(NAME symbiote_tree_tests COMMAND symbiote_tree_tests)

# ── The JavaScript half ──────────────────────────────────────────────────────────────────────────
# Same engine, driven from JS instead of from C++, so the adapter and engine test suites can stop
# committing into a TypeScript stand-in. React Native's own host harness has this shape too: a
# bundler produces one file and a native binary evaluates it (`private/react-native-fantom`).
add_executable(symbiote_tester
  symbiote-tester.cpp
  ${REACT_COMMON_DIR}/jsc/JSCRuntime.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteTree.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteDebug.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteFabricProps.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteEngineBindings.cpp)
target_include_directories(symbiote_tester PRIVATE
  ${REACT_COMMON_DIR} ${REACT_COMMON_DIR}/jsi ${REACT_COMMON_DIR}/jsc
  ${CMAKE_CURRENT_SOURCE_DIR}/..)
target_compile_options(symbiote_tester PRIVATE -fexceptions -frtti -Wall)

# ── The ANDROID arm ──────────────────────────────────────────────────────────────────────────────
# `-DSYMBIOTE_PLATFORM_ANDROID=ON` compiles the rule file's Android branches instead of its default
# ones, into a SECOND build directory the itest runner reaches with `SYMBIOTE_ITEST_BUILD`.
#
# WHY IT WAS WORTH BUILDING. Five ported rules carry a platform split that no view NAME can express —
# `android_ripple`, `underlineColorAndroid`, `decelerationRate`'s constants, Button's uppercase label
# and its Material style, TouchableNativeFeedback's background — and every one of them landed with
# the same note: "a compile-time branch is only testable in a build that compiles it". Before this,
# closing that meant a device. It means a second `cmake --build` now.
#
# SCOPED TO ONE TRANSLATION UNIT, deliberately. All twelve `#ifdef ANDROID` sites live in
# `SymbioteFabricProps.cpp`, which includes nothing but `folly/dynamic.h` and our own headers — so
# the define reaches our rules and never ReactCommon, whose own Android branches want fbjni and a
# real NDK. Defining it target-wide is the version of this that does not compile.
#
# It is NOT a substitute for a device: `Platform.OS` in JS still reads the host, so an arm that needs
# the JS half to agree has to say so itself. What this build settles is what the RULE emits.
option(SYMBIOTE_PLATFORM_ANDROID "Compile the rule file's Android branches" OFF)
if(SYMBIOTE_PLATFORM_ANDROID)
  set_source_files_properties(
    ${CMAKE_CURRENT_SOURCE_DIR}/../SymbioteFabricProps.cpp
    PROPERTIES COMPILE_DEFINITIONS ANDROID)
endif()
target_link_libraries(symbiote_tester PRIVATE
  folly_runtime
  ${REACT_TARGETS}
  ${SYMBIOTE_JSC_LINK})
