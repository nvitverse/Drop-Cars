(function () {
  "use strict";

  // Cache to prevent duplicate reporting of the same message/type within the session
  var reportedErrors = {};

  function reportDropCarsError(type, message, details) {
    // Basic deduplication
    var errorKey = type + ":" + message;
    if (reportedErrors[errorKey]) {
      return;
    }
    reportedErrors[errorKey] = true;

    var payload = {
      type: type || "client_error",
      message: message || "Unknown client error",
      url: window.location.href,
      user_agent: navigator.userAgent,
      details: details || {}
    };

    var base = typeof window.DROP_CARS_BASE_PATH === "string" ? window.DROP_CARS_BASE_PATH.trim() : "";
    var endpoint = window.location.origin + (base.charAt(0) !== "/" ? "/" + base : base).replace(/\/$/, "") + "/api/report-error.php";

    if (typeof fetch === "function") {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })["catch"](function (err) {
        console.error("Failed to send error report:", err);
      });
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify(payload));
    }
  }

  // Expose globally
  window.reportDropCarsError = reportDropCarsError;

  // 1. Listen for global runtime errors
  window.addEventListener("error", function (event) {
    var target = event.target || event.srcElement;
    if (target && (target.tagName === "SCRIPT" || target.tagName === "LINK" || target.tagName === "IMG")) {
      var src = target.src || target.href;
      if (src && (
        src.indexOf("googletagmanager") !== -1 ||
        src.indexOf("googleadservices") !== -1 ||
        src.indexOf("googleads") !== -1 ||
        src.indexOf("doubleclick") !== -1 ||
        src.indexOf("google-analytics") !== -1 ||
        src.indexOf("analytics") !== -1 ||
        src.indexOf("facebook") !== -1 ||
        src.indexOf("fbevents") !== -1 ||
        src.indexOf("productlogos/translate") !== -1 ||
        src.indexOf("translate.svg") !== -1
      )) {
        return; // Ignore ad-blocker / analytics / translate widget blockages
      }
      reportDropCarsError("resource_load_failure", "Failed to load resource: " + src, {
        tagName: target.tagName,
        outerHTML: target.outerHTML ? target.outerHTML.substring(0, 200) : ""
      });
      return;
    }

    var errorMsg = event.message || (event.error && event.error.message) || "Unknown JS error";
    var filename = event.filename || "";
    var lineno = event.lineno || 0;
    var colno = event.colno || 0;
    var stack = (event.error && event.error.stack) || "";

    // Ignore browser extension noise
    if (filename && (filename.indexOf("chrome-extension") !== -1 || filename.indexOf("moz-extension") !== -1)) {
      return;
    }

    reportDropCarsError("js_runtime_error", errorMsg, {
      filename: filename,
      line: lineno,
      col: colno,
      stack: stack ? stack.substring(0, 500) : ""
    });
  }, true); // Capture phase to catch resource loading failures

  // 2. Listen for unhandled promise rejections
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var message = "Unhandled Promise Rejection";
    var details = {};

    if (reason) {
      if (reason instanceof Error) {
        message = reason.message;
        details.stack = reason.stack ? reason.stack.substring(0, 500) : "";
      } else if (typeof reason === "object") {
        try {
          message = JSON.stringify(reason);
        } catch (e) {
          message = String(reason);
        }
      } else {
        message = String(reason);
      }
    }

    reportDropCarsError("unhandled_promise_rejection", message, details);
  });
})();
