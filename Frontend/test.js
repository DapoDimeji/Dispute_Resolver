/* Browser smoke tests for no-SDK proxy mode.
 * Enable with: index.html?test=1
 */
(async function () {
  function log(ok, msg) {
    const prefix = ok ? "[PASS]" : "[FAIL]";
    console.log(prefix, msg);
  }

  try {
    if (!window.glClient) {
      throw new Error("window.glClient missing");
    }
    if (typeof window.glClient.get_all_disputes !== "function") {
      throw new Error("glClient.get_all_disputes missing");
    }
    log(true, "Bridge client loaded");

    try {
      await window.glClient.get_all_disputes();
      log(true, "Read endpoint reachable");
    } catch (e) {
      log(false, "Read endpoint error: " + (e && e.message ? e.message : String(e)));
    }
  } catch (err) {
    log(false, err && err.message ? err.message : String(err));
  }
})();
