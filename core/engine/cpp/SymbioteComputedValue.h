#pragma once

#include <string>
#include <string_view>

#include "SymbioteStyleText.h"
#include "SymbioteSyntax.h"

namespace symbiote {

// The computed value of `text`, which already matches `syntax`, written the way a browser does
// Units fold into px, deg, s and dppx, a `calc()` is evaluated, a colour becomes `rgb()`
// A value with a unit the engine cannot resolve (`vh`, `lh`) stays as written
std::string computedText(const Syntax &syntax, std::string_view text, const ColorParser &parseColor);

} // namespace symbiote
