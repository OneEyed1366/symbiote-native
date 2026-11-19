#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "SymbioteStyleText.h"

namespace symbiote {

enum class SyntaxType {
  kLength,
  kNumber,
  kPercentage,
  kLengthPercentage,
  kColor,
  kImage,
  kUrl,
  kInteger,
  kAngle,
  kTime,
  kResolution,
  kTransformFunction,
  kTransformList,
  kCustomIdent,
  kString,
  // A literal keyword, held decoded in `SyntaxTerm::ident`
  kIdent,
};

// How many values a term takes: one, a space separated list (`+`) or a comma separated one (`#`)
enum class Multiplier { kNone, kSpaces, kCommas };

struct SyntaxTerm {
  SyntaxType type;
  Multiplier multiplier;
  std::string ident;
};

// A registered syntax: `*`, or alternatives tried in order
struct Syntax {
  bool isUniversal = false;
  std::vector<SyntaxTerm> terms;
};

// An initial value must not depend on anything computed (`em`, `rem`, `var()`), a declared one may
enum class ValueContext { kInitialValue, kDeclared };

// Parses the string of `CSS.registerProperty({ syntax })` or the `syntax` descriptor of `@property`
// `nullopt` is a syntax error
std::optional<Syntax> parseSyntax(std::string_view text);

// Whether a value text is a whole match for the syntax
bool matchesSyntax(
    const Syntax &syntax, std::string_view value, ValueContext context, const ColorParser &parseColor);

} // namespace symbiote
