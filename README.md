# YTBlock — YouTube UI Blocker

A Chromium (Brave/Chrome/Edge) extension that hides distracting YouTube UI
elements. Unblocking anything is deliberately gated behind a **snooze delay** so
you can't cave on impulse.

## What it can block

Shorts (shelves, nav links, and the Shorts player itself), the home-feed
recommendation grid, the Subscriptions feed, up-next / related videos,
end-screen suggestions, comments, live chat, Explore & Trending, Playables,
community posts, the notification bell, and hover video previews.

## Hard daily time limit

Enable a daily budget (in minutes) in the popup. YTBlock accrues time only
while a YouTube tab is focused and visible; once you hit the budget, every
YouTube tab shows a full-page lockout until local midnight. Usage is shared
across tabs and resets each day.

The limit follows the same "stricter is free, looser is gated" rule as blocking:
turning the limit **on** or **lowering** the minutes is instant, while turning
it **off** or **raising** the minutes requires an open snooze window.

## The snooze lock

- **Turning a block ON is instant** — being stricter never needs permission.
- **Turning a block OFF requires an open editing window.** To open it, press
  **Snooze**, then wait `snoozeDelayMinutes` (default 30). Once the wait
  elapses you get `unlockWindowMinutes` (default 5) to make changes, then
  everything re-locks automatically.
- The delay/window lengths can only be shortened while nothing is blocked yet
  or during an open window — so you can't just set the delay to zero.

The countdown is stored persistently, so you can close the popup, come back
later, and the window will be open (or still counting) as expected.

## Install (unpacked)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder
   (`.../Extensions/YTBlock`).
4. Pin the extension and click its icon to choose what to block.

Changes apply live on open YouTube tabs — no reload needed.

## Layout

```
manifest.json         MV3 manifest
src/elements.js       Element definitions + CSS/URL helpers (shared)
src/content.js        Injects hiding CSS, redirects blocked routes (e.g. /shorts/)
src/popup.html/css/js Popup UI + snooze-lock state machine
icons/                Extension icons
```

## Notes

- Selectors track YouTube's current DOM. YouTube changes often; if something
  stops hiding, update the relevant entry's `css` array in `src/elements.js`.
- Uses `:has()` selectors, supported in current Chromium.
- Storage is `chrome.storage.local` (per-browser, not synced).
