// Cases ported from web-platform-tests `css/css-variables` (var-parsing, variable-cycles,
// variable-exponential-blowup); a variable that nothing declares is `std::nullopt` in `Decls`
#include <gtest/gtest.h>

#include <chrono>
#include <map>
#include <optional>
#include <string>

#include "SymbioteVarSubstitute.h"

namespace symbiote {
namespace {

using Decls = std::map<std::string, std::string, std::less<>>;
using Result = std::optional<std::string>;

VarResolver resolverOver(const Decls &decls) {
  return VarResolver([&decls](std::string_view name) -> std::optional<std::string> {
    auto found = decls.find(name);
    if (found == decls.end()) {
      return std::nullopt;
    }
    return found->second;
  });
}

Result substitute(const Decls &decls, const std::string &value) {
  return resolverOver(decls).substitute(value);
}

TEST(VarSubstitute, replacesAReferenceWithTheDeclaredValue) {
  EXPECT_EQ(substitute({{"--a", "red"}}, "var(--a)"), Result("red"));
}

TEST(VarSubstitute, keepsTheTextAroundAReference) {
  EXPECT_EQ(substitute({{"--c", "#fff"}}, "1px solid var(--c) !important"),
            Result("1px solid #fff !important"));
}

TEST(VarSubstitute, trimsWhitespaceAroundTheDeclaredValue) {
  EXPECT_EQ(substitute({{"--a", "  4px \n"}}, "var(--a)"), Result("4px"));
}

TEST(VarSubstitute, leavesAValueWithoutReferencesUntouched) {
  EXPECT_EQ(substitute({}, "rgb(1, 2, 3) 10px"), Result("rgb(1, 2, 3) 10px"));
}

TEST(VarSubstitute, usesTheFallbackWhenTheVariableIsUndeclared) {
  EXPECT_EQ(substitute({}, "var(--x, blue)"), Result("blue"));
}

TEST(VarSubstitute, ignoresTheFallbackWhenTheVariableIsDeclared) {
  EXPECT_EQ(substitute({{"--x", "red"}}, "var(--x, blue)"), Result("red"));
}

TEST(VarSubstitute, invalidWhenUndeclaredWithoutAFallback) {
  EXPECT_EQ(substitute({}, "var(--x)"), std::nullopt);
}

TEST(VarSubstitute, anEmptyFallbackIsValidAndEmpty) {
  EXPECT_EQ(substitute({}, "var(--x,)"), Result(""));
  EXPECT_EQ(substitute({}, "var(--x, )"), Result(""));
  EXPECT_EQ(substitute({}, "var(--x ,)"), Result(""));
}

TEST(VarSubstitute, aFallbackRunsToTheClosingParenthesisAcrossCommas) {
  EXPECT_EQ(substitute({}, "var(--x, 1px, 2px)"), Result("1px, 2px"));
}

TEST(VarSubstitute, aFallbackMayHoldNestedFunctionsAndParentheses) {
  EXPECT_EQ(substitute({}, "var(--x, rgb(0, (1), 2))"), Result("rgb(0, (1), 2)"));
}

TEST(VarSubstitute, aFallbackMayReferenceAnotherVariable) {
  EXPECT_EQ(substitute({{"--y", "green"}}, "var(--x, var(--y, pink))"), Result("green"));
  EXPECT_EQ(substitute({}, "var(--x, var(--y, pink))"), Result("pink"));
}

TEST(VarSubstitute, anUnusedFallbackIsNeverResolved) {
  EXPECT_EQ(substitute({{"--x", "ok"}}, "var(--x, var(--missing))"), Result("ok"));
}

TEST(VarSubstitute, resolvesAReferenceHeldInADeclaredValue) {
  EXPECT_EQ(substitute({{"--a", "var(--b)"}, {"--b", "4px"}}, "var(--a)"), Result("4px"));
}

TEST(VarSubstitute, resolvesSeveralReferencesInOneValue) {
  EXPECT_EQ(substitute({{"--a", "1"}, {"--b", "2"}}, "var(--a) var(--b) var(--a)"),
            Result("1 2 1"));
}

TEST(VarSubstitute, matchesTheFunctionNameCaseInsensitively) {
  EXPECT_EQ(substitute({{"--a", "red"}}, "VAR(--a)"), Result("red"));
}

TEST(VarSubstitute, doesNotTreatALongerFunctionNameAsVar) {
  EXPECT_EQ(substitute({}, "myvar(--a) --var(--a)"), Result("myvar(--a) --var(--a)"));
}

TEST(VarSubstitute, leavesAReferenceInsideAStringAlone) {
  EXPECT_EQ(substitute({{"--a", "red"}}, "'var(--a)' \"var(--a)\""),
            Result("'var(--a)' \"var(--a)\""));
}

TEST(VarSubstitute, leavesAReferenceInsideACommentAlone) {
  EXPECT_EQ(substitute({{"--a", "red"}}, "1px /* var(--a) */ 2px"),
            Result("1px /* var(--a) */ 2px"));
}

// var-parsing.html: a malformed reference makes the whole value invalid, declared or not
TEST(VarSubstitute, malformedReferencesAreInvalid) {
  const Decls decls{{"--x", "red"}};
  for (const char *value : {"var(--x ())", "var(--x () )", "var(--x() )", "var(--x (),)",
                            "var(--x(),)", "var(x)", "var()", "var(--)", "var(--x", "var(--x, (",
                            "var(--x, a))", "var(--x y)"}) {
    EXPECT_EQ(substitute(decls, value), std::nullopt) << value;
  }
}

TEST(VarSubstitute, aSelfReferenceIsInvalid) {
  EXPECT_EQ(substitute({{"--a", "var(--a)"}}, "var(--a)"), std::nullopt);
}

TEST(VarSubstitute, aCycleIsInvalidEvenWhenEveryLinkHasAFallback) {
  const Decls decls{{"--a", "var(--b, cycle)"}, {"--b", "var(--c, cycle)"},
                    {"--c", "var(--a, cycle)"}};
  auto resolver = resolverOver(decls);
  EXPECT_EQ(resolver.computed("--a"), std::nullopt);
  EXPECT_EQ(resolver.computed("--b"), std::nullopt);
  EXPECT_EQ(resolver.computed("--c"), std::nullopt);
}

TEST(VarSubstitute, aReferenceIntoACycleTakesItsFallback) {
  const Decls decls{{"--x", "var(--y, valid)"},
                    {"--y", "var(--a, valid)"},
                    {"--a", "var(--b, cycle)"},
                    {"--b", "var(--c, cycle)"},
                    {"--c", "var(--a, cycle)"}};
  auto resolver = resolverOver(decls);
  EXPECT_EQ(resolver.computed("--a"), std::nullopt);
  EXPECT_EQ(resolver.computed("--x"), Result("valid"));
  EXPECT_EQ(resolver.computed("--y"), Result("valid"));
}

TEST(VarSubstitute, aCycleWithAnExtraEdgeStaysInvalidAndTheEdgeStaysValid) {
  const Decls decls{{"--x", "var(--a, valid)"},
                    {"--a", "var(--b, cycle)"},
                    {"--b", "var(--c, cycle)"},
                    {"--c", "var(--a, cycle) var(--y)"},
                    {"--y", "var(--z)"},
                    {"--z", "valid"}};
  auto resolver = resolverOver(decls);
  for (const char *name : {"--a", "--b", "--c"}) {
    EXPECT_EQ(resolver.computed(name), std::nullopt) << name;
  }
  for (const char *name : {"--x", "--y", "--z"}) {
    EXPECT_NE(resolver.computed(name), std::nullopt) << name;
  }
}

TEST(VarSubstitute, aSecondaryCycleInvalidatesEveryMember) {
  const Decls decls{{"--x", "var(--a, valid)"},
                    {"--a", "var(--b, cycle)"},
                    {"--b", "var(--c, cycle) var(--a, cycle)"},
                    {"--c", "var(--d, cycle)"},
                    {"--d", "var(--b, cycle)"}};
  auto resolver = resolverOver(decls);
  for (const char *name : {"--a", "--b", "--c", "--d"}) {
    EXPECT_EQ(resolver.computed(name), std::nullopt) << name;
  }
  EXPECT_EQ(resolver.computed("--x"), Result("valid"));
}

TEST(VarSubstitute, anOverlappingSecondaryCycleKeepsItsSideBranchValid) {
  const Decls decls{{"--x", "var(--a, valid)"},
                    {"--a", "var(--b, cycle)"},
                    {"--b", "var(--c, cycle)"},
                    {"--c", "var(--d, cycle) var(--a, cycle)"},
                    {"--d", "var(--b, cycle) var(--y)"},
                    {"--y", "valid"}};
  auto resolver = resolverOver(decls);
  for (const char *name : {"--a", "--b", "--c", "--d"}) {
    EXPECT_EQ(resolver.computed(name), std::nullopt) << name;
  }
  EXPECT_EQ(resolver.computed("--x"), Result("valid"));
  EXPECT_EQ(resolver.computed("--y"), Result("valid"));
}

TEST(VarSubstitute, aDeeperSecondaryCycleOffTheRootIsInvalid) {
  const Decls decls{{"--x", "var(--a, valid)"},
                    {"--a", "var(--b, cycle) var(--y, valid) var(--c, cycle)"},
                    {"--b", "var(--a, cycle) "},
                    {"--c", "var(--d, cycle)"},
                    {"--d", "var(--a, cycle)"},
                    {"--y", "valid"}};
  auto resolver = resolverOver(decls);
  for (const char *name : {"--a", "--b", "--c", "--d"}) {
    EXPECT_EQ(resolver.computed(name), std::nullopt) << name;
  }
  EXPECT_EQ(resolver.computed("--x"), Result("valid"));
}

TEST(VarSubstitute, computedOfAnUndeclaredVariableIsInvalid) {
  auto resolver = resolverOver({});
  EXPECT_EQ(resolver.computed("--nope"), std::nullopt);
}

// variable-exponential-blowup.html: 31 doublings must not allocate gigabytes or hang
TEST(VarSubstitute, anExponentialDoublingChainIsInvalidAndFast) {
  Decls decls{{"--v0", "\"Something really really really long\""}};
  for (int i = 0; i < 31; ++i) {
    const std::string prev = "var(--v" + std::to_string(i) + ")";
    decls["--v" + std::to_string(i + 1)] = prev + " " + prev;
  }
  const auto started = std::chrono::steady_clock::now();
  EXPECT_EQ(substitute(decls, "var(--v31)"), std::nullopt);
  const auto elapsed = std::chrono::steady_clock::now() - started;
  EXPECT_LT(elapsed, std::chrono::seconds(2));
}

TEST(VarSubstitute, aVeryLongChainOfReferencesIsInvalidWithoutOverflowingTheStack) {
  Decls decls;
  constexpr int kLinks = 100'000;
  for (int i = 0; i < kLinks; ++i) {
    decls["--v" + std::to_string(i)] = "var(--v" + std::to_string(i + 1) + ")";
  }
  decls["--v" + std::to_string(kLinks)] = "end";
  EXPECT_EQ(substitute(decls, "var(--v0)"), std::nullopt);
}

// A registered property computes to its initial value when its substituted text is invalid
Result fallbackToInitial(std::string_view name, const Result &substituted) {
  if (name != "--w") return substituted;
  return substituted == Result("8px") ? substituted : Result("0px");
}

TEST(VarSubstitute, aComputedHookReplacesAnInvalidValueOfItsProperty) {
  const Decls decls{{"--w", "var(--n)"}, {"--n", "8"}};
  VarResolver resolver(
      [&decls](std::string_view name) -> Result {
        const auto found = decls.find(name);
        return found == decls.end() ? std::nullopt : Result(found->second);
      },
      fallbackToInitial);
  EXPECT_EQ(resolver.substitute("var(--w)"), Result("0px"));
}

TEST(VarSubstitute, aComputedHookAnswersACycleAndKeepsOtherNamesAsTheyAre) {
  const Decls decls{{"--w", "var(--w)"}, {"--k", "kept"}};
  VarResolver resolver(
      [&decls](std::string_view name) -> Result {
        const auto found = decls.find(name);
        return found == decls.end() ? std::nullopt : Result(found->second);
      },
      fallbackToInitial);
  EXPECT_EQ(resolver.substitute("var(--w) var(--k)"), Result("0px kept"));
}

// A chain of scopes, each with its own declarations and the one above it, like the node chain
struct Scope {
  Decls decls;
  const Scope *parent = nullptr;
};

// The nearest declaration from `from` (the reader when null) upward, with the scope that holds it
VarLookup scopedLookup(const Scope &reader) {
  return [&reader](std::string_view name, VarScope from) -> std::optional<VarDeclared> {
    for (const Scope *at = from == nullptr ? &reader : static_cast<const Scope *>(from); at != nullptr;
         at = at->parent) {
      const auto found = at->decls.find(name);
      if (found != at->decls.end()) return VarDeclared{found->second, at};
    }
    return std::nullopt;
  };
}

Result substituteIn(const Scope &reader, const std::string &value) {
  return VarResolver(scopedLookup(reader)).substitute(value);
}

TEST(VarSubstituteScopes, resolvesAReferenceInsideADeclarationFromTheScopeThatDeclaresIt) {
  const Scope outer{{{"--a", "var(--b)"}, {"--b", "1px"}}};
  const Scope inner{{{"--b", "2px"}}, &outer};
  EXPECT_EQ(substituteIn(inner, "var(--a)"), Result("1px"));
  EXPECT_EQ(substituteIn(inner, "var(--b)"), Result("2px"));
}

TEST(VarSubstituteScopes, seesTheOtherDeclarationsOfTheScopeThatHoldsTheValue) {
  const Scope outer{{{"--a", "var(--b) var(--c)"}, {"--b", "x"}, {"--c", "y"}}};
  const Scope inner{{{"--b", "no"}}, &outer};
  EXPECT_EQ(substituteIn(inner, "var(--a)"), Result("x y"));
}

TEST(VarSubstituteScopes, keepsAReferenceToTheSameNameInAnotherScopeOutOfACycle) {
  const Scope outer{{{"--x", "1"}, {"--y", "var(--x)"}}};
  const Scope inner{{{"--x", "var(--y)"}}, &outer};
  EXPECT_EQ(substituteIn(inner, "var(--x)"), Result("1"));
}

TEST(VarSubstituteScopes, stillTakesASelfReferenceOnOneScopeForACycle) {
  const Scope only{{{"--c", "var(--c)"}}};
  EXPECT_EQ(substituteIn(only, "var(--c)"), std::nullopt);
}

TEST(VarSubstituteScopes, usesTheFallbackFromTheScopeOfTheReader) {
  const Scope outer{{{"--a", "var(--missing, 3px)"}}};
  const Scope inner{{{"--fb", "9px"}}, &outer};
  EXPECT_EQ(substituteIn(inner, "var(--a)"), Result("3px"));
  EXPECT_EQ(substituteIn(inner, "var(--none, var(--fb))"), Result("9px"));
}

// A lookup that names the scope above the one holding a value, which a rejected value falls back to
VarLookup lookupWithAbove(const Scope &reader) {
  const VarLookup plain = scopedLookup(reader);
  return [plain](std::string_view name, VarScope from) {
    std::optional<VarDeclared> found = plain(name, from);
    if (found.has_value()) found->above = static_cast<const Scope *>(found->scope)->parent;
    return found;
  };
}

const VarRejects rejectsWhatDidNotSubstitute = [](std::string_view, const Result &substituted) {
  return !substituted.has_value();
};

TEST(VarSubstituteScopes, readsAgainAboveTheScopeWhenARejectedValueFallsBackToTheInherited) {
  const Scope outer{{{"--w", "42px"}}};
  const Scope inner{{{"--w", "var(--undefined)"}}, &outer};
  VarResolver resolver(lookupWithAbove(inner), {}, rejectsWhatDidNotSubstitute);
  EXPECT_EQ(resolver.computed("--w"), Result("42px"));
}

TEST(VarSubstituteScopes, keepsAGuaranteedInvalidValueWhenNothingIsAboveTheRejectedOne) {
  const Scope only{{{"--w", "var(--undefined)"}}};
  VarResolver resolver(lookupWithAbove(only), {}, rejectsWhatDidNotSubstitute);
  EXPECT_EQ(resolver.computed("--w"), std::nullopt);
}

} // namespace
} // namespace symbiote
