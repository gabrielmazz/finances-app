// Linux operator processes only. Prevent kernel/WSL piped core collectors from
// receiving financial memory; RLIMIT_CORE alone does not cover piped collectors.
#include <sys/prctl.h>
#include <unistd.h>

#ifdef NODE_ADDON
#include <node_api.h>
static napi_value is_protected(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_get_boolean(env, prctl(PR_GET_DUMPABLE) == 0, &result);
  return result;
}
NAPI_MODULE_INIT() {
  if (prctl(PR_SET_DUMPABLE, 0) != 0) {
    napi_throw_error(env, NULL, "Cannot disable process dumps");
    return NULL;
  }
  napi_value check;
  napi_create_function(env, "isProtected", NAPI_AUTO_LENGTH, is_protected, NULL, &check);
  napi_set_named_property(env, exports, "isProtected", check);
  return exports;
}
#else
__attribute__((constructor)) static void disable_dumps(void) {
  if (prctl(PR_SET_DUMPABLE, 0) != 0 || prctl(PR_GET_DUMPABLE) != 0) _exit(78);
#ifndef BROWSER_GUARD
  if (write(3, "D", 1) != 1) _exit(79);
  close(3);
#endif
}
#endif
