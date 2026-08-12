/*
 * Popup UI + snooze-lock logic.
 *
 * Core rule set:
 *   - Turning a block ON is ALWAYS allowed (being stricter needs no permission).
 *   - Turning a block OFF (unblocking) is only allowed during an "open" window.
 *   - To open that window you press Snooze, then wait `snoozeDelayMinutes`.
 *     Once the wait elapses you get `unlockWindowMinutes` to make changes,
 *     after which everything re-locks automatically.
 *   - Delay/window lengths can only be shortened while nothing is blocked or
 *     during an open window, so you can't trivially set the delay to zero.
 */
(function () {
  "use strict";

  const MIN = 60 * 1000;
  const STATE = { LOCKED: "LOCKED", WAITING: "WAITING", OPEN: "OPEN" };

  let settings = YTBLOCK.normalize({});
  let usage = { date: "", seconds: 0 };
  let tick = null;

  const els = {
    statusPill: document.getElementById("statusPill"),
    lockMsg: document.getElementById("lockMsg"),
    snoozeBtn: document.getElementById("snoozeBtn"),
    list: document.getElementById("list"),
    delayInput: document.getElementById("delayInput"),
    windowInput: document.getElementById("windowInput"),
    settingsHint: document.getElementById("settingsHint"),
    tlEnable: document.getElementById("tlEnable"),
    tlSwitch: document.getElementById("tlSwitch"),
    tlMinutes: document.getElementById("tlMinutes"),
    tlBar: document.getElementById("tlBar"),
    tlUsage: document.getElementById("tlUsage")
  };

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

  function usedMinutesToday() {
    const secs = usage && usage.date === todayKey() ? usage.seconds : 0;
    return secs / 60;
  }

  /* ------------------------------ persistence ----------------------------- */

  function load() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(["settings", "usage"], function (data) {
        settings = YTBLOCK.normalize(data.settings);
        usage = data.usage || { date: todayKey(), seconds: 0 };
        resolve();
      });
    });
  }

  function save() {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ settings: settings }, resolve);
    });
  }

  /* ------------------------------ state logic ----------------------------- */

  function readyAt() {
    if (!settings.snoozeStartedAt) return 0;
    return settings.snoozeStartedAt + settings.snoozeDelayMinutes * MIN;
  }

  function windowEnd() {
    if (!settings.snoozeStartedAt) return 0;
    return readyAt() + settings.unlockWindowMinutes * MIN;
  }

  function currentState() {
    if (!settings.snoozeStartedAt) return STATE.LOCKED;
    const now = Date.now();
    if (now < readyAt()) return STATE.WAITING;
    if (now < windowEnd()) return STATE.OPEN;
    return STATE.LOCKED; // window elapsed
  }

  function anyBlocked() {
    return YTBLOCK.ELEMENTS.some(function (e) {
      return settings.blocked[e.id];
    });
  }

  // Once the snooze window has fully elapsed, clear the marker so we don't
  // keep recomputing an expired window.
  function reapExpired() {
    if (settings.snoozeStartedAt && Date.now() >= windowEnd()) {
      settings.snoozeStartedAt = 0;
      return true;
    }
    return false;
  }

  /* ------------------------------ formatting ------------------------------ */

  function fmt(ms) {
    if (ms < 0) ms = 0;
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  /* ------------------------------- rendering ------------------------------ */

  function renderList() {
    const state = currentState();
    const canUnblock = state === STATE.OPEN;
    els.list.innerHTML = "";

    YTBLOCK.ELEMENTS.forEach(function (e) {
      const blocked = !!settings.blocked[e.id];
      // A toggle is disabled only when the action it *would* perform is barred:
      // an ON->OFF flip (unblock) requires the open window.
      const disabled = blocked && !canUnblock;

      const item = document.createElement("div");
      item.className = "item";

      const text = document.createElement("div");
      text.className = "item-text";
      const title = document.createElement("div");
      title.className = "item-title";
      title.textContent = e.label;
      const desc = document.createElement("div");
      desc.className = "item-desc";
      desc.textContent = e.desc;
      text.appendChild(title);
      text.appendChild(desc);

      const sw = document.createElement("label");
      sw.className = "switch" + (disabled ? " locked" : "");
      sw.title = disabled
        ? "Snooze to unlock before you can turn this off"
        : "";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = blocked;
      cb.disabled = disabled;
      cb.addEventListener("change", function () {
        onToggle(e.id, cb.checked, cb);
      });
      const slider = document.createElement("span");
      slider.className = "slider";
      sw.appendChild(cb);
      sw.appendChild(slider);

      item.appendChild(text);
      item.appendChild(sw);
      els.list.appendChild(item);
    });
  }

  function renderLockBar() {
    const state = currentState();
    const now = Date.now();

    if (state === STATE.LOCKED) {
      els.statusPill.textContent = "Locked";
      els.statusPill.className = "pill pill-locked";
      els.lockMsg.innerHTML = anyBlocked()
        ? "Settings are <strong>locked</strong>. To turn anything off, snooze and wait."
        : "Turn things on freely. To unblock later you'll need to snooze first.";
      els.snoozeBtn.textContent =
        "Snooze " + settings.snoozeDelayMinutes + " min to unlock";
      els.snoozeBtn.className = "btn btn-primary";
      els.snoozeBtn.disabled = false;
    } else if (state === STATE.WAITING) {
      els.statusPill.textContent = "Waiting";
      els.statusPill.className = "pill pill-waiting";
      els.lockMsg.innerHTML =
        "Unlocks in <strong>" + fmt(readyAt() - now) + "</strong>. Hang tight.";
      els.snoozeBtn.textContent = "Cancel snooze";
      els.snoozeBtn.className = "btn btn-ghost";
      els.snoozeBtn.disabled = false;
    } else {
      // OPEN
      els.statusPill.textContent = "Unlocked";
      els.statusPill.className = "pill pill-open";
      els.lockMsg.innerHTML =
        "Editing window open — <strong>" +
        fmt(windowEnd() - now) +
        "</strong> left. Make your changes now.";
      els.snoozeBtn.textContent = "Lock now";
      els.snoozeBtn.className = "btn btn-danger";
      els.snoozeBtn.disabled = false;
    }
  }

  function renderSettings() {
    const state = currentState();
    // Editable while nothing is blocked yet (first-time setup) or during the
    // open window. Otherwise you can't weaken your own guardrails.
    const editable = state === STATE.OPEN || !anyBlocked();
    els.delayInput.value = settings.snoozeDelayMinutes;
    els.windowInput.value = settings.unlockWindowMinutes;
    els.delayInput.disabled = !editable;
    els.windowInput.disabled = !editable;
    els.settingsHint.textContent = editable
      ? "Changes save automatically."
      : "Locked. Snooze to unlock, or clear all blocks, to change these.";
  }

  function renderTimeLimit() {
    const state = currentState();
    const tl = settings.timeLimit;
    // Turning the limit OFF is "more lenient" → needs the open window.
    els.tlEnable.checked = tl.enabled;
    els.tlEnable.disabled = tl.enabled && state !== STATE.OPEN;
    els.tlSwitch.classList.toggle("locked", els.tlEnable.disabled);
    els.tlSwitch.title = els.tlEnable.disabled
      ? "Snooze to unlock before you can turn the limit off"
      : "";

    els.tlMinutes.value = tl.minutes;
    // The field stays enabled (you may always lower it); raising it while the
    // limit is active is rejected in the change handler unless the window is open.

    const used = usedMinutesToday();
    const pct = tl.minutes > 0 ? Math.min(100, (used / tl.minutes) * 100) : 0;
    els.tlBar.style.width = pct + "%";
    els.tlBar.className =
      "bar-fill" + (pct >= 100 ? " full" : pct >= 80 ? " warn" : "");

    const usedR = Math.floor(used);
    if (!tl.enabled) {
      els.tlUsage.textContent = "Off · " + usedR + " min watched today";
    } else if (used >= tl.minutes) {
      els.tlUsage.textContent =
        "Limit reached (" + usedR + "/" + tl.minutes + " min) · YouTube is locked until midnight";
    } else {
      els.tlUsage.textContent =
        usedR + " / " + tl.minutes + " min used · " + Math.ceil(tl.minutes - used) + " min left today";
    }
  }

  function render() {
    reapExpired();
    renderLockBar();
    renderList();
    renderTimeLimit();
    renderSettings();
    manageTicker();
  }

  // Keep a 1s ticker running only while a countdown is visible.
  function manageTicker() {
    const state = currentState();
    const needTicker = state === STATE.WAITING || state === STATE.OPEN;
    if (needTicker && !tick) {
      tick = setInterval(onTick, 1000);
    } else if (!needTicker && tick) {
      clearInterval(tick);
      tick = null;
    }
  }

  function onTick() {
    const before = currentState();
    if (reapExpired()) {
      save().then(render);
      return;
    }
    // Re-render countdown; do a full render if the state changed.
    if (currentState() !== before) {
      render();
    } else {
      renderLockBar();
    }
  }

  /* ------------------------------- actions -------------------------------- */

  function onToggle(id, checked, cb) {
    const state = currentState();
    if (!checked && state !== STATE.OPEN) {
      // Unblocking is not allowed right now — revert the UI.
      cb.checked = true;
      render();
      return;
    }
    settings.blocked[id] = checked;
    save().then(render);
  }

  function onSnoozeClick() {
    const state = currentState();
    if (state === STATE.LOCKED) {
      settings.snoozeStartedAt = Date.now();
    } else if (state === STATE.WAITING) {
      settings.snoozeStartedAt = 0; // cancel
    } else {
      settings.snoozeStartedAt = 0; // lock now
    }
    save().then(render);
  }

  function onTlEnableChange() {
    const checked = els.tlEnable.checked;
    // Disabling the limit is more lenient → only during the open window.
    if (!checked && currentState() !== STATE.OPEN) {
      els.tlEnable.checked = true;
      render();
      return;
    }
    settings.timeLimit.enabled = checked;
    save().then(render);
  }

  function onTlMinutesChange() {
    let v = parseInt(els.tlMinutes.value, 10);
    if (isNaN(v)) v = settings.timeLimit.minutes;
    v = Math.max(1, Math.min(1440, v));
    const old = settings.timeLimit.minutes;
    // Raising the limit while it's active is more lenient → needs the window.
    if (v > old && settings.timeLimit.enabled && currentState() !== STATE.OPEN) {
      els.tlMinutes.value = old;
      els.tlUsage.textContent = "Snooze to unlock before raising the limit.";
      return;
    }
    settings.timeLimit.minutes = v;
    els.tlMinutes.value = v;
    save().then(render);
  }

  function onDelayChange() {
    let v = parseInt(els.delayInput.value, 10);
    if (isNaN(v)) v = settings.snoozeDelayMinutes;
    v = Math.max(1, Math.min(1440, v));
    settings.snoozeDelayMinutes = v;
    els.delayInput.value = v;
    save();
  }

  function onWindowChange() {
    let v = parseInt(els.windowInput.value, 10);
    if (isNaN(v)) v = settings.unlockWindowMinutes;
    v = Math.max(1, Math.min(120, v));
    settings.unlockWindowMinutes = v;
    els.windowInput.value = v;
    save();
  }

  /* --------------------------------- init --------------------------------- */

  els.snoozeBtn.addEventListener("click", onSnoozeClick);
  els.delayInput.addEventListener("change", onDelayChange);
  els.windowInput.addEventListener("change", onWindowChange);
  els.tlEnable.addEventListener("change", onTlEnableChange);
  els.tlMinutes.addEventListener("change", onTlMinutesChange);

  // Reflect external changes (e.g. window expiring while popup is open elsewhere,
  // or usage ticking up in another tab).
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (changes.settings) {
      settings = YTBLOCK.normalize(changes.settings.newValue);
      render();
    }
    if (changes.usage) {
      usage = changes.usage.newValue || { date: todayKey(), seconds: 0 };
      renderTimeLimit();
    }
  });

  load().then(function () {
    // Persist any auto-reaped expiry immediately.
    if (reapExpired()) save();
    render();
  });
})();
