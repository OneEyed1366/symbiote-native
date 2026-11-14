#include "SymbioteSurfaceVariables.h"

namespace symbiote {

SurfaceVariables &SurfaceVariables::instance() {
  static SurfaceVariables table;
  return table;
}

void SurfaceVariables::set(int32_t surface, std::string name, std::string value) {
  std::lock_guard<std::mutex> lock(mutex_);
  bySurface_[surface][std::move(name)] = std::move(value);
}

void SurfaceVariables::erase(int32_t surface, std::string_view name) {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto table = bySurface_.find(surface);
  if (table == bySurface_.end()) return;
  table->second.erase(std::string(name));
  if (table->second.empty()) bySurface_.erase(table);
}

std::optional<std::string> SurfaceVariables::get(int32_t surface, std::string_view name) const {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto table = bySurface_.find(surface);
  if (table == bySurface_.end()) return std::nullopt;
  const auto found = table->second.find(std::string(name));
  if (found == table->second.end()) return std::nullopt;
  return found->second;
}

void SurfaceVariables::clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  bySurface_.clear();
}

} // namespace symbiote
