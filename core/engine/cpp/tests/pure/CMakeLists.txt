# Tests for the engine's pure C++ modules: no React Native, folly or JSI, so a configure takes seconds
#   cmake -S core/engine/cpp/tests/pure -B core/engine/cpp/tests/pure/build
#   cmake --build core/engine/cpp/tests/pure/build && ctest --test-dir core/engine/cpp/tests/pure/build
cmake_minimum_required(VERSION 3.20)
project(symbiote_pure_tests CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

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

add_executable(symbiote_pure_tests
  var-substitute.test.cpp
  global-variables.test.cpp
  var-readers.test.cpp
  surface-variables.test.cpp
  calc.test.cpp
  math.test.cpp
  shorthand.test.cpp
  structured-style.test.cpp
  structured-style-upstream.test.cpp
  syntax.test.cpp
  registered-properties.test.cpp
  registered-read-cost.test.cpp
  container-query.test.cpp
  container-variants.test.cpp
  computed-value.test.cpp
  deferred-consumers.test.cpp
  adversarial.test.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteContainerQuery.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteComputedValue.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteRegisteredProperties.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteSyntax.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteSyntaxNumber.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteSyntaxValue.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteCalc.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteMath.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteMathOps.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteShorthand.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteStyleText.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteShadow.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteFilter.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteTransform.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteStructuredStyle.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteVarSubstitute.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteGlobalVariables.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteSurfaceVariables.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../SymbioteVarReaders.cpp)
target_include_directories(symbiote_pure_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../..)
target_compile_options(symbiote_pure_tests PRIVATE -Wall -Wextra)
target_link_libraries(symbiote_pure_tests PRIVATE GTest::gtest_main)
add_test(NAME symbiote_pure_tests COMMAND symbiote_pure_tests)
