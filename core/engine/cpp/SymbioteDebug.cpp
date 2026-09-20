#include "SymbioteDebug.h"

#include <atomic>
#include <cstdio>
#include <mutex>

namespace symbiote {
namespace {

std::atomic<bool> gEnabled{false};

// Guarded separately from the flag: the flag is read on every call site and must stay a lock-free
// load, while the buffer is touched only by calls that already passed the gate.
std::mutex gMutex;
std::vector<std::string> gLines;

// A drain that never happens must not grow without bound — an app with the switch on and no test
// reading it would otherwise retain every line for the life of the process. Oldest go first, which
// is the right end to lose: a diagnostic is read after the thing it describes.
constexpr size_t kMaxRetained = 512;

} // namespace

bool debugEnabled() {
  return gEnabled.load(std::memory_order_relaxed);
}

void setDebugEnabled(bool enabled) {
  gEnabled.store(enabled, std::memory_order_relaxed);
}

void debugLog(const std::string &message) {
  const std::string line = "[symbiote] " + message;
  // stderr rather than stdout: unbuffered by default, so a line written just before a crash is not
  // lost with the buffer — which is the case a diagnostic is most often read for.
  std::fputs(line.c_str(), stderr);
  std::fputc('\n', stderr);

  const std::lock_guard<std::mutex> lock(gMutex);
  if (gLines.size() >= kMaxRetained) gLines.erase(gLines.begin());
  gLines.push_back(line);
}

std::vector<std::string> takeDebugLog() {
  const std::lock_guard<std::mutex> lock(gMutex);
  std::vector<std::string> drained;
  drained.swap(gLines);
  return drained;
}

} // namespace symbiote
