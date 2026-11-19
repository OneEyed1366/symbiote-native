// Prices the parts of a registered `var()` read, to attribute the cost the itest fixture measures
// Prints ns per call; only meaningful in a Release build (`-DCMAKE_BUILD_TYPE=Release`)
#include <gtest/gtest.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <optional>
#include <string>

#include "SymbioteComputedValue.h"
#include "SymbioteRegisteredProperties.h"
#include "SymbioteVarSubstitute.h"

namespace symbiote {
namespace {

constexpr int kIterations = 200'000;
constexpr int kRounds = 5;

std::optional<long long> noColor(const std::string &) {
  return std::nullopt;
}

// Best of the rounds, because noise only adds
template <class Body>
double nanosPerCall(Body &&body) {
  double best = 1e18;
  for (int round = 0; round < kRounds; round += 1) {
    const auto start = std::chrono::steady_clock::now();
    for (int at = 0; at < kIterations; at += 1) body();
    const std::chrono::duration<double, std::nano> took = std::chrono::steady_clock::now() - start;
    best = std::min(best, took.count() / kIterations);
  }
  return best;
}

volatile size_t gSink = 0;

TEST(RegisteredReadCost, PricesEachPartOfATypedRead) {
  RegisteredProperties &registry = RegisteredProperties::instance();
  registry.clear();
  registry.setColorParser(noColor);
  registry.add("--w", "<length>", true, std::string("0px"));
  const auto shared = registry.share("--w");
  ASSERT_NE(shared, nullptr);
  const std::optional<std::string> text = std::string("40px");
  const PlainVarLookup lookup = [](std::string_view) { return std::optional<std::string>("40px"); };

  const auto print = [](const char *label, double nanos) {
    std::printf("DEBUG REGREAD %-18s %8.1f ns\n", label, nanos);
  };
  print("share", nanosPerCall([&] { gSink += registry.share("--w") != nullptr; }));
  print("find copy", nanosPerCall([&] { gSink += registry.find("--w").has_value(); }));
  print("declarationApplies", nanosPerCall([&] { gSink += registry.declarationApplies(*shared, "40px"); }));
  print("computedValue", nanosPerCall([&] { gSink += registry.computedValue(*shared, text)->size(); }));
  print("settle", nanosPerCall([&] { gSink += registry.settle("--w", text)->size(); }));
  print("computedText", nanosPerCall([&] { gSink += computedText(shared->syntax, "40px", noColor).size(); }));
  print("substitute plain", nanosPerCall([&] {
          VarResolver resolver(lookup);
          gSink += resolver.substitute("var(--w)")->size();
        }));
  print("substitute typed", nanosPerCall([&] {
          VarResolver resolver(lookup, [&](std::string_view name, const std::optional<std::string> &substituted) {
            return registry.settle(name, substituted);
          });
          gSink += resolver.substitute("var(--w)")->size();
        }));
  registry.clear();
}

} // namespace
} // namespace symbiote
