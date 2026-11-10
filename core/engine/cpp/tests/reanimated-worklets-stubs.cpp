// What Reanimated's layout animations proxy takes from Worklets, answered for a test with no UI
// runtime of its own: the UI thread is the calling thread, and a job runs where it is scheduled
#include <worklets/Compat/StableApi.h>

#include <jsi/jsi.h>

#include <stdexcept>

namespace worklets {

namespace jsi = facebook::jsi;

Serializable::~Serializable() = default;

namespace {

class UndefinedSerializable : public Serializable {
 public:
  UndefinedSerializable() : Serializable(ValueType::UndefinedType) {}
  jsi::Value toJSValue(jsi::Runtime &) override { return jsi::Value::undefined(); }
};

} // namespace

std::shared_ptr<Serializable> Serializable::undefined() {
  static const auto value = std::make_shared<UndefinedSerializable>();
  return value;
}

void scheduleOnUI(const std::shared_ptr<UIScheduler> &, const std::function<void()> &job) {
  job();
}

bool isOnUIThread(const std::shared_ptr<UIScheduler> &) {
  return true;
}

jsi::Runtime &getJSIRuntimeFromWorkletRuntime(const std::shared_ptr<WorkletRuntime> &) {
  throw std::logic_error("the proxy is given its UI runtime directly");
}

} // namespace worklets
