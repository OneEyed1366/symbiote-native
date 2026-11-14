#pragma once

#include <atomic>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>

#include "SymbioteSyntax.h"
#include "SymbioteVarSubstitute.h"

namespace symbiote {

// Each failure maps to one `CSS.registerProperty` error or to an ignored `@property` rule
enum class RegisterOutcome {
  kRegistered,
  kBadName,
  kBadSyntax,
  kMissingInitialValue,
  kBadInitialValue,
  kAlreadyRegistered,
};

// What `computedValue` answered and whether a text matched, shared by the copies of a descriptor
// It empties when the colour parser changes, since the parser decides what a colour is
struct ComputedMemo {
  std::mutex mutex;
  size_t colorGeneration = 0;
  std::unordered_map<std::string, std::optional<std::string>> answers;
  std::unordered_map<std::string, bool> declaredMatches;
};

struct RegisteredProperty {
  Syntax syntax;
  bool inherits;
  std::optional<std::string> initialValue;
  std::shared_ptr<ComputedMemo> memo;
};

// The registered custom properties, one table for all surfaces like the `:root` one
class RegisteredProperties {
 public:
  static RegisteredProperties &instance();

  // The colour grammar belongs to the host, so a typed match asks it
  void setColorParser(ColorParser parser);

  RegisterOutcome add(
      std::string_view name,
      std::string_view syntaxText,
      bool inherits,
      const std::optional<std::string> &initialValue);

  std::optional<RegisteredProperty> find(std::string_view name) const;

  // The descriptor without a copy, `nullptr` when unregistered, and it outlives a removal
  std::shared_ptr<const RegisteredProperty> share(std::string_view name) const;

  // False when the name was not registered
  bool remove(std::string_view name);

  // A literal declaration that fails the syntax is dropped at parse time
  // One holding `var()` cannot be checked yet, so it applies and is checked once substituted
  bool declarationApplies(const RegisteredProperty &property, std::string_view text) const;

  // The substituted text when it matches, else the initial value
  // `nullopt` in means invalid at computed-value time, `nullopt` out means guaranteed-invalid
  std::optional<std::string> computedValue(
      const RegisteredProperty &property, const std::optional<std::string> &substituted) const;

  // `computedValue` for a registered name, the text untouched for any other
  std::optional<std::string> settle(
      std::string_view name, const std::optional<std::string> &substituted) const;

  // Whether a typed name refuses the substituted text, `nullopt` in being refused too
  // A universal syntax refuses nothing, so its invalid value stays guaranteed-invalid
  bool rejects(std::string_view name, const std::optional<std::string> &substituted) const;

  // Lock free, so the lookups of an app that registers nothing pay one load
  bool isEmpty() const;

  void clear();

 private:
  ColorParser colorParser() const;
  bool matches(const RegisteredProperty &property, std::string_view text, ValueContext context) const;
  std::optional<std::string> computeValue(
      const RegisteredProperty &property, const std::optional<std::string> &substituted) const;
  bool matchesDeclared(const RegisteredProperty &property, std::string_view text) const;
  // Callers hold `memo.mutex`
  void dropStale(ComputedMemo &memo) const;

  mutable std::mutex mutex_;
  std::unordered_map<std::string, std::shared_ptr<const RegisteredProperty>> properties_;
  std::atomic<size_t> count_{0};
  std::atomic<size_t> colorGeneration_{0};
  ColorParser parseColor_;
};

// A resolver that settles every name against the registry, with the lookup of the caller
VarResolver registryResolver(VarLookup lookup);

} // namespace symbiote
