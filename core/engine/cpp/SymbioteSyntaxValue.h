#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "SymbioteSyntax.h"

namespace symbiote {

// The decoded form of a whole text that is one CSS identifier, escapes included, or nothing
std::optional<std::string> decodedIdent(std::string_view text);

// A text that is a CSS-wide keyword or `default`, which no identifier syntax may take
bool isReservedIdent(std::string_view decoded);

// `text` without its `/* */` comments, a comment inside a string being part of it
std::string withoutComments(std::string_view text);

// Splits at whitespace or at commas that sit outside brackets and quotes; parts are not trimmed
// An empty part is kept so that `a,,b` is not read as two values
std::vector<std::string> splitValues(std::string_view text, bool atComma);

// Whether one component value `text` (already trimmed) is a whole match for a data type
bool matchesDataType(
    SyntaxType type, std::string_view text, ValueContext context, const ColorParser &parseColor);

// Whether `text` is a value the universal syntax `*` takes
bool matchesUniversal(std::string_view text, ValueContext context);

} // namespace symbiote
