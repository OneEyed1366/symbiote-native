#include "SymbioteMathOps.h"

#include <algorithm>
#include <cmath>
#include <string>
#include <unordered_map>

namespace symbiote {

namespace {

using Values = std::vector<MathValue>;

bool hasNoDimension(const MathType &type) {
  return type.length == 0 && type.angle == 0 && type.time == 0 && type.resolution == 0;
}

bool isNumberLike(const MathType &type) {
  return hasNoDimension(type) && !type.hasPercent;
}

bool isPurePercent(const MathType &type) {
  return hasNoDimension(type) && type.hasPercent;
}

bool isPlainLength(const MathType &type) {
  return type.length == 1 && type.angle == 0 && type.time == 0 && type.resolution == 0;
}

bool sameDimensions(const MathType &left, const MathType &right) {
  return left.length == right.length && left.angle == right.angle && left.time == right.time &&
      left.resolution == right.resolution;
}

// The type two terms of a sum share, a percentage meeting a length as a length with a percentage
std::optional<MathType> unifiedType(const MathType &left, const MathType &right) {
  MathType merged = left;
  merged.hasPercent = left.hasPercent || right.hasPercent;
  if (sameDimensions(left, right)) {
    const bool isNumberAgainstPercent = hasNoDimension(left) && left.hasPercent != right.hasPercent;
    return isNumberAgainstPercent ? std::nullopt : std::optional<MathType>(merged);
  }
  if (isPurePercent(left) && isPlainLength(right)) {
    MathType length = right;
    length.hasPercent = true;
    return length;
  }
  if (isPurePercent(right) && isPlainLength(left)) return merged;
  return std::nullopt;
}

std::optional<MathType> sharedType(const Values &values) {
  std::optional<MathType> shared = values.front().type;
  for (const MathValue &value : values) {
    if (!shared.has_value()) return std::nullopt;
    shared = unifiedType(*shared, value.type);
  }
  return shared;
}

MathType combinedDimensions(const MathType &left, const MathType &right, int direction) {
  MathType out;
  out.length = left.length + direction * right.length;
  out.angle = left.angle + direction * right.angle;
  out.time = left.time + direction * right.time;
  out.resolution = left.resolution + direction * right.resolution;
  return out;
}

// An opaque value has no amount, so whatever the arithmetic left in it is dropped
// A known one may be infinite or NaN, which IEEE arithmetic carries on as the web does
MathValue settled(MathValue value) {
  if (!value.isOpaque) return value;
  value.amount = 0;
  value.percent = 0;
  return value;
}

MathValue flagged(const MathType &type, const MathValue &left, const MathValue &right) {
  MathValue out;
  out.type = type;
  out.isOpaque = left.isOpaque || right.isOpaque;
  out.isRelative = left.isRelative || right.isRelative;
  return out;
}

// Only the parts a value holds are scaled, since 0 * infinity would turn an absent part into NaN
MathValue scaled(const MathValue &value, double factor, bool isDivision) {
  MathValue out = value;
  const auto apply = [&](double part) { return isDivision ? part / factor : part * factor; };
  if (!isPurePercent(value.type)) out.amount = apply(value.amount);
  if (value.type.hasPercent) out.percent = apply(value.percent);
  return out;
}

// What the arguments of a comparing function can be ordered by
enum class Basis { kAmount, kPercent, kNone };

Basis basisOf(const Values &values) {
  const bool isEveryPlain = std::all_of(values.begin(), values.end(),
      [](const MathValue &value) { return value.percent == 0; });
  if (isEveryPlain) return Basis::kAmount;
  const bool isEveryPercent = std::all_of(values.begin(), values.end(),
      [](const MathValue &value) { return isPurePercent(value.type); });
  return isEveryPercent ? Basis::kPercent : Basis::kNone;
}

double fieldOf(const MathValue &value, Basis basis) {
  return basis == Basis::kPercent ? value.percent : value.amount;
}

// The result of a function over `sources`, known only when every source is and the basis is
MathValue made(const MathType &type, double number, Basis basis, const Values &sources) {
  MathValue out;
  out.type = type;
  if (basis == Basis::kPercent) out.percent = number;
  else out.amount = number;
  out.isOpaque = basis == Basis::kNone;
  for (const MathValue &source : sources) {
    out.isOpaque = out.isOpaque || source.isOpaque;
    out.isRelative = out.isRelative || source.isRelative;
  }
  return out;
}

std::optional<Values> presentValues(const MathCall &call, size_t count) {
  if (call.args.size() != count) return std::nullopt;
  Values values;
  for (const std::optional<MathValue> &arg : call.args) {
    if (!arg.has_value()) return std::nullopt;
    values.push_back(*arg);
  }
  return values;
}

std::optional<Values> numberValues(const MathCall &call, size_t count) {
  std::optional<Values> values = presentValues(call, count);
  if (!values.has_value()) return std::nullopt;
  const bool isEveryNumber = std::all_of(values->begin(), values->end(),
      [](const MathValue &value) { return isNumberLike(value.type); });
  return isEveryNumber ? values : std::nullopt;
}

MathValue numberResult(double number, const Values &sources) {
  return made(MathType{}, number, Basis::kAmount, sources);
}

// The larger or the smaller of two, NaN winning over both
double pickOf(double left, double right, bool isMax) {
  if (std::isnan(left) || std::isnan(right)) return std::nan("");
  return isMax ? std::max(left, right) : std::min(left, right);
}

std::optional<MathValue> minOrMax(const MathCall &call, bool isMax) {
  if (call.args.empty()) return std::nullopt;
  const std::optional<Values> values = presentValues(call, call.args.size());
  if (!values.has_value()) return std::nullopt;
  const std::optional<MathType> type = sharedType(*values);
  if (!type.has_value()) return std::nullopt;
  const Basis basis = basisOf(*values);
  double best = fieldOf(values->front(), basis);
  for (const MathValue &value : *values) best = pickOf(best, fieldOf(value, basis), isMax);
  return settled(made(*type, best, basis, *values));
}

std::optional<MathValue> minOf(const MathCall &call) {
  return minOrMax(call, false);
}

std::optional<MathValue> maxOf(const MathCall &call) {
  return minOrMax(call, true);
}

std::optional<MathValue> clampOf(const MathCall &call) {
  if (call.args.size() != 3 || !call.args[1].has_value()) return std::nullopt;
  Values present;
  for (const std::optional<MathValue> &arg : call.args) {
    if (arg.has_value()) present.push_back(*arg);
  }
  const std::optional<MathType> type = sharedType(present);
  if (!type.has_value()) return std::nullopt;
  const Basis basis = basisOf(present);
  double chosen = fieldOf(*call.args[1], basis);
  if (call.args[2].has_value()) chosen = pickOf(chosen, fieldOf(*call.args[2], basis), false);
  if (call.args[0].has_value()) chosen = pickOf(fieldOf(*call.args[0], basis), chosen, true);
  return settled(made(*type, chosen, basis, present));
}

std::optional<MathValue> absOf(const MathCall &call) {
  const std::optional<Values> values = presentValues(call, 1);
  if (!values.has_value()) return std::nullopt;
  const Basis basis = basisOf(*values);
  return settled(made(values->front().type, std::fabs(fieldOf(values->front(), basis)), basis, *values));
}

std::optional<MathValue> signOf(const MathCall &call) {
  const std::optional<Values> values = presentValues(call, 1);
  if (!values.has_value()) return std::nullopt;
  const Basis basis = basisOf(*values);
  const double field = fieldOf(values->front(), basis);
  const double sign = std::isnan(field) ? field : static_cast<double>((field > 0) - (field < 0));
  MathValue out = numberResult(sign, *values);
  out.isOpaque = out.isOpaque || basis == Basis::kNone;
  return settled(out);
}

double roundedTo(double amount, double interval, RoundStrategy strategy) {
  const double quotient = amount / interval;
  switch (strategy) {
    case RoundStrategy::kUp:
      return std::ceil(quotient) * interval;
    case RoundStrategy::kDown:
      return std::floor(quotient) * interval;
    case RoundStrategy::kToZero:
      return std::trunc(quotient) * interval;
    default:
      return std::floor(quotient + 0.5) * interval;
  }
}

// The interval of `round(A)` is the number one, which only a number may leave out
std::optional<Values> roundOperands(const MathCall &call) {
  if (call.args.size() == 1 && call.args[0].has_value() && isNumberLike(call.args[0]->type)) {
    MathValue one;
    one.amount = 1;
    return Values{*call.args[0], one};
  }
  return presentValues(call, 2);
}

std::optional<MathValue> roundOf(const MathCall &call) {
  const std::optional<Values> values = roundOperands(call);
  if (!values.has_value()) return std::nullopt;
  const std::optional<MathType> type = sharedType(*values);
  if (!type.has_value()) return std::nullopt;
  const Basis basis = basisOf(*values);
  const double interval = std::fabs(fieldOf((*values)[1], basis));
  return settled(made(*type, roundedTo(fieldOf((*values)[0], basis), interval, call.strategy), basis, *values));
}

// `mod` takes the sign of the divisor and `rem` the sign of the dividend
double remainderOf(double dividend, double divisor, bool isModulus) {
  const double remainder = std::fmod(dividend, divisor);
  const bool isOtherSign = remainder != 0 && (remainder < 0) != (divisor < 0);
  return isModulus && isOtherSign ? remainder + divisor : remainder;
}

std::optional<MathValue> modOrRem(const MathCall &call, bool isModulus) {
  const std::optional<Values> values = presentValues(call, 2);
  if (!values.has_value()) return std::nullopt;
  const std::optional<MathType> type = sharedType(*values);
  if (!type.has_value()) return std::nullopt;
  const Basis basis = basisOf(*values);
  const double divisor = fieldOf((*values)[1], basis);
  return settled(made(*type, remainderOf(fieldOf((*values)[0], basis), divisor, isModulus), basis, *values));
}

std::optional<MathValue> modOf(const MathCall &call) {
  return modOrRem(call, true);
}

std::optional<MathValue> remOf(const MathCall &call) {
  return modOrRem(call, false);
}

std::optional<MathValue> powOf(const MathCall &call) {
  const std::optional<Values> values = numberValues(call, 2);
  if (!values.has_value()) return std::nullopt;
  return settled(numberResult(std::pow((*values)[0].amount, (*values)[1].amount), *values));
}

std::optional<MathValue> sqrtOf(const MathCall &call) {
  const std::optional<Values> values = numberValues(call, 1);
  if (!values.has_value()) return std::nullopt;
  return settled(numberResult(std::sqrt(values->front().amount), *values));
}

std::optional<MathValue> hypotOf(const MathCall &call) {
  if (call.args.empty()) return std::nullopt;
  const std::optional<Values> values = presentValues(call, call.args.size());
  if (!values.has_value()) return std::nullopt;
  const std::optional<MathType> type = sharedType(*values);
  if (!type.has_value()) return std::nullopt;
  const Basis basis = basisOf(*values);
  double length = 0;
  for (const MathValue &value : *values) length = std::hypot(length, fieldOf(value, basis));
  return settled(made(*type, length, basis, *values));
}

std::optional<MathValue> expOf(const MathCall &call) {
  const std::optional<Values> values = numberValues(call, 1);
  if (!values.has_value()) return std::nullopt;
  return settled(numberResult(std::exp(values->front().amount), *values));
}

std::optional<MathValue> logOf(const MathCall &call) {
  if (call.args.size() != 1 && call.args.size() != 2) return std::nullopt;
  const std::optional<Values> values = numberValues(call, call.args.size());
  if (!values.has_value()) return std::nullopt;
  const double base = values->size() == 2 ? std::log((*values)[1].amount) : 1;
  return settled(numberResult(std::log(values->front().amount) / base, *values));
}

const double kRadiansPerDegree = std::acos(-1.0) / 180;

MathType angleType() {
  MathType type;
  type.angle = 1;
  return type;
}

bool isAngleType(const MathType &type) {
  return type.angle == 1 && type.length == 0 && type.time == 0 && type.resolution == 0 && !type.hasPercent;
}

// A bare number is in radians and an angle is held in degrees
std::optional<MathValue> trigOf(const MathCall &call, double (*function)(double)) {
  const std::optional<Values> values = presentValues(call, 1);
  if (!values.has_value()) return std::nullopt;
  const MathValue &angle = values->front();
  if (!isNumberLike(angle.type) && !isAngleType(angle.type)) return std::nullopt;
  const double radians = isNumberLike(angle.type) ? angle.amount : angle.amount * kRadiansPerDegree;
  return settled(numberResult(function(radians), *values));
}

std::optional<MathValue> inverseTrigOf(const MathCall &call, double (*function)(double)) {
  const std::optional<Values> values = numberValues(call, 1);
  if (!values.has_value()) return std::nullopt;
  const double degrees = function(values->front().amount) / kRadiansPerDegree;
  return settled(made(angleType(), degrees, Basis::kAmount, *values));
}

std::optional<MathValue> sinOf(const MathCall &call) {
  return trigOf(call, std::sin);
}

std::optional<MathValue> cosOf(const MathCall &call) {
  return trigOf(call, std::cos);
}

std::optional<MathValue> tanOf(const MathCall &call) {
  return trigOf(call, std::tan);
}

std::optional<MathValue> asinOf(const MathCall &call) {
  return inverseTrigOf(call, std::asin);
}

std::optional<MathValue> acosOf(const MathCall &call) {
  return inverseTrigOf(call, std::acos);
}

std::optional<MathValue> atanOf(const MathCall &call) {
  return inverseTrigOf(call, std::atan);
}

std::optional<MathValue> atan2Of(const MathCall &call) {
  const std::optional<Values> values = presentValues(call, 2);
  if (!values.has_value() || !sharedType(*values).has_value()) return std::nullopt;
  const Basis basis = basisOf(*values);
  const double degrees = std::atan2(fieldOf((*values)[0], basis), fieldOf((*values)[1], basis)) / kRadiansPerDegree;
  MathValue out = made(angleType(), degrees, Basis::kAmount, *values);
  out.isOpaque = out.isOpaque || basis == Basis::kNone;
  return settled(out);
}

using MathHandler = std::optional<MathValue> (*)(const MathCall &);

const std::unordered_map<std::string, MathHandler> &handlers() {
  static const std::unordered_map<std::string, MathHandler> table = {
      {"min", minOf}, {"max", maxOf}, {"clamp", clampOf}, {"abs", absOf}, {"sign", signOf},
      {"round", roundOf}, {"mod", modOf}, {"rem", remOf}, {"pow", powOf}, {"sqrt", sqrtOf},
      {"hypot", hypotOf}, {"exp", expOf}, {"log", logOf}, {"sin", sinOf}, {"cos", cosOf},
      {"tan", tanOf}, {"asin", asinOf}, {"acos", acosOf}, {"atan", atanOf}, {"atan2", atan2Of}};
  return table;
}

} // namespace

std::optional<MathValue> sumValues(const MathValue &left, const MathValue &right, bool isSubtraction) {
  const std::optional<MathType> type = unifiedType(left.type, right.type);
  if (!type.has_value()) return std::nullopt;
  const double direction = isSubtraction ? -1 : 1;
  MathValue out = flagged(*type, left, right);
  out.amount = left.amount + direction * right.amount;
  out.percent = left.percent + direction * right.percent;
  return settled(out);
}

std::optional<MathValue> multiplyValues(const MathValue &left, const MathValue &right) {
  if (isNumberLike(left.type) || isNumberLike(right.type)) {
    const bool isLeftFactor = isNumberLike(left.type);
    const MathValue &other = isLeftFactor ? right : left;
    MathValue out = scaled(other, (isLeftFactor ? left : right).amount, false);
    out.isOpaque = left.isOpaque || right.isOpaque;
    out.isRelative = left.isRelative || right.isRelative;
    return settled(out);
  }
  if (left.type.hasPercent || right.type.hasPercent) return std::nullopt;
  MathValue out = flagged(combinedDimensions(left.type, right.type, 1), left, right);
  out.amount = left.amount * right.amount;
  return settled(out);
}

std::optional<MathValue> divideValues(const MathValue &left, const MathValue &right) {
  if (right.type.hasPercent) return std::nullopt;
  if (isNumberLike(right.type)) {
    MathValue out = scaled(left, right.amount, true);
    out.isOpaque = left.isOpaque || right.isOpaque;
    out.isRelative = left.isRelative || right.isRelative;
    return settled(out);
  }
  if (left.type.hasPercent) return std::nullopt;
  MathValue out = flagged(combinedDimensions(left.type, right.type, -1), left, right);
  out.amount = left.amount / right.amount;
  return settled(out);
}

bool isMathFunction(std::string_view name) {
  return handlers().count(std::string(name)) != 0;
}

std::optional<MathValue> callMathFunction(std::string_view name, const MathCall &call) {
  const auto found = handlers().find(std::string(name));
  if (found == handlers().end()) return std::nullopt;
  return found->second(call);
}

} // namespace symbiote
