/*
 * YTBlock content script.
 * Injects a <style> tag reflecting the user's blocked-element choices and
 * keeps it in sync with storage. Also:
 *   - redirects away from blocked routes (e.g. /shorts/, /feed/subscriptions)
 *   - tracks time spent on YouTube and enforces a hard daily time limit
 *     with a full-page lockout overlay once the budget is spent.
 */
(function () {
  "use strict";

  const STYLE_ID = "ytblock-style";
  const OVERLAY_ID = "ytblock-overlay";
  const HEARTBEAT_MS = 5000; // how often active time is accrued

  let currentSettings = YTBLOCK.normalize({});
  let usage = { date: "", seconds: 0 };
  let overlayTimer = null;

  /* --------------------------- element hiding ----------------------------- */

  function ensureStyleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      // document_start: <head> may not exist yet, fall back to documentElement.
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  function applyCss() {
    ensureStyleEl().textContent = YTBLOCK.buildCss(currentSettings.blocked);
  }

  /* ---------------------------- route blocking ---------------------------- */

  function enforceUrlBlocks() {
    const prefixes = YTBLOCK.blockedUrlPrefixes(currentSettings.blocked);
    if (!prefixes.length) return;
    const path = location.pathname;
    const hit = prefixes.some(function (p) {
      return path.indexOf(p) === 0;
    });
    if (hit) {
      pauseAllVideos();
      location.replace("https://www.youtube.com/");
    }
  }

  /* --------------------------- time-limit logic --------------------------- */

  function todayKey() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function msUntilMidnight() {
    const now = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0
    );
    return next.getTime() - now.getTime();
  }

  function usedSecondsToday() {
    return usage && usage.date === todayKey() ? usage.seconds : 0;
  }

  function pauseAllVideos() {
    document.querySelectorAll("video").forEach(function (v) {
      try {
        v.pause();
      } catch (e) {
        /* ignore */
      }
    });
  }

  // Accrue active time. Read-modify-write via storage so multiple tabs share
  // one counter; we only count the focused, visible tab to avoid double counts.
  function accrueTime(seconds) {
    chrome.storage.local.get("usage", function (data) {
      let u = data.usage || { date: "", seconds: 0 };
      const today = todayKey();
      if (u.date !== today) u = { date: today, seconds: 0 };
      u.seconds += seconds;
      chrome.storage.local.set({ usage: u }, function () {
        usage = u;
        checkLimit();
      });
    });
  }

  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
    return m + "m";
  }

  function buildOverlay() {
    const wrap = document.createElement("div");
    wrap.id = OVERLAY_ID;
    wrap.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "background:#0f0f0f",
        "color:#f1f1f1",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "gap:14px",
        "text-align:center",
        "font-family:'Segoe UI',Roboto,system-ui,sans-serif",
        "padding:24px"
      ].join(";")
    );
    wrap.innerHTML =
      '<div style="background:#ff4e45;color:#fff;font-weight:800;font-size:20px;' +
      'padding:8px 14px;border-radius:10px;letter-spacing:.5px">YTBlock</div>' +
      '<div style="font-size:26px;font-weight:700">Daily limit reached</div>' +
      '<div style="font-size:15px;color:#aaa;max-width:380px">' +
      "You've used up your YouTube time for today.</div>" +
      '<div id="ytblock-reset" style="font-size:14px;color:#3ea6ff"></div>';
    return wrap;
  }

  function showOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = buildOverlay();
      document.documentElement.appendChild(el);
    }
    pauseAllVideos();
    const reset = el.querySelector("#ytblock-reset");
    if (reset) {
      reset.textContent = "Resets in " + fmtClock(msUntilMidnight());
    }
    // Keep it asserted: pause playback and refresh the countdown every second.
    if (!overlayTimer) {
      overlayTimer = setInterval(function () {
        // A new day may have started while the overlay was up.
        if (usage.date !== todayKey()) {
          usage = { date: todayKey(), seconds: 0 };
          checkLimit();
          return;
        }
        pauseAllVideos();
        const r = document.getElementById("ytblock-reset");
        if (r) r.textContent = "Resets in " + fmtClock(msUntilMidnight());
      }, 1000);
    }
  }

  function removeOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    if (overlayTimer) {
      clearInterval(overlayTimer);
      overlayTimer = null;
    }
  }

  function checkLimit() {
    const tl = currentSettings.timeLimit;
    if (!tl || !tl.enabled) {
      removeOverlay();
      return;
    }
    if (usedSecondsToday() >= tl.minutes * 60) {
      showOverlay();
    } else {
      removeOverlay();
    }
  }

  /* ------------------------------ orchestration --------------------------- */

  function refresh() {
    applyCss();
    enforceUrlBlocks();
    checkLimit();
  }

  // Initial load from storage.
  chrome.storage.local.get(["settings", "usage"], function (data) {
    currentSettings = YTBLOCK.normalize(data.settings);
    usage = data.usage || { date: todayKey(), seconds: 0 };
    if (usage.date !== todayKey()) usage = { date: todayKey(), seconds: 0 };
    refresh();
  });

  // React to changes without needing a page reload.
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (changes.settings) {
      currentSettings = YTBLOCK.normalize(changes.settings.newValue);
      refresh();
    }
    if (changes.usage) {
      usage = changes.usage.newValue || { date: todayKey(), seconds: 0 };
      checkLimit();
    }
  });

  // Accrue active time only while this tab is the focused, visible one.
  setInterval(function () {
    if (document.visibilityState === "visible" && document.hasFocus()) {
      accrueTime(HEARTBEAT_MS / 1000);
    }
  }, HEARTBEAT_MS);

  // YouTube is a single-page app: re-check on client-side nav.
  window.addEventListener("yt-navigate-finish", refresh, true);
  window.addEventListener("yt-navigate-start", enforceUrlBlocks, true);
  document.addEventListener("DOMContentLoaded", refresh);
})();
