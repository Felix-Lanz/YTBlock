/*
 * Shared definitions for YTBlock.
 * Loaded both as a content script and inside the popup (via <script>).
 * Exposes a global `YTBLOCK` object. No modules so it works in both contexts.
 */
(function (root) {
  "use strict";

  // Each entry describes one blockable piece of YouTube UI.
  //  id        : stable key used in storage
  //  label     : shown in the popup
  //  desc      : short explanation shown in the popup
  //  css       : selectors hidden when this element is blocked
  //  blockUrls : path prefixes that should be redirected away when blocked
  const ELEMENTS = [
    {
      id: "shorts",
      label: "Shorts",
      desc: "Hide every Shorts shelf, the Shorts nav links, and block the Shorts player.",
      blockUrls: ["/shorts/"],
      css: [
        // Home / feed shelves
        "ytd-rich-shelf-renderer[is-shorts]",
        "ytd-reel-shelf-renderer",
        "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])",
        "ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)",
        "ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)",
        "grid-shelf-view-model",
        // Individual Shorts items scattered through feeds / search
        "ytd-video-renderer:has(a[href^='/shorts'])",
        "ytd-grid-video-renderer:has(a[href^='/shorts'])",
        "ytd-rich-item-renderer:has(a[href^='/shorts'])",
        "ytm-shorts-lockup-view-model",
        // Left nav (full + mini) entries
        "ytd-guide-entry-renderer:has(a[href^='/shorts'])",
        "ytd-mini-guide-entry-renderer:has(a[href^='/shorts'])",
        // Shorts tab on channel pages
        "yt-tab-shape[tab-title='Shorts']",
        "tp-yt-paper-tab:has(a[href$='/shorts'])"
      ]
    },
    {
      id: "home_feed",
      label: "Home feed recommendations",
      desc: "Blank the endless grid of recommended videos on the YouTube home page.",
      css: [
        "ytd-browse[page-subtype='home'] ytd-rich-grid-renderer",
        "ytd-browse[page-subtype='home'] #contents.ytd-rich-grid-renderer"
      ]
    },
    {
      id: "subscriptions_feed",
      label: "Subscriptions feed",
      desc: "Block the Subscriptions page and hide its nav links.",
      blockUrls: ["/feed/subscriptions"],
      css: [
        "ytd-browse[page-subtype='subscriptions'] ytd-rich-grid-renderer",
        "ytd-guide-entry-renderer:has(a[href^='/feed/subscriptions'])",
        "ytd-mini-guide-entry-renderer:has(a[href^='/feed/subscriptions'])"
      ]
    },
    {
      id: "sidebar_recs",
      label: "Up-next / related videos",
      desc: "Hide the recommended-videos sidebar next to the video you're watching.",
      css: [
        "ytd-watch-next-secondary-results-renderer",
        "#related",
        "#secondary #related"
      ]
    },
    {
      id: "end_screen",
      label: "End screen suggestions",
      desc: "Remove the grid of suggested videos and cards shown at the end of a video.",
      css: [
        ".html5-endscreen",
        ".ytp-endscreen-content",
        ".ytp-ce-element"
      ]
    },
    {
      id: "comments",
      label: "Comments",
      desc: "Hide the comments section under videos.",
      css: [
        "ytd-comments#comments",
        "#comments"
      ]
    },
    {
      id: "live_chat",
      label: "Live chat",
      desc: "Hide the live-chat panel on streams and premieres.",
      css: [
        "#chat",
        "#chat-container",
        "ytd-live-chat-frame"
      ]
    },
    {
      id: "explore_trending",
      label: "Explore & Trending",
      desc: "Hide Explore / Trending links in the left navigation.",
      css: [
        "ytd-guide-entry-renderer:has(a[href^='/feed/trending'])",
        "ytd-guide-entry-renderer:has(a[href^='/feed/explore'])",
        "ytd-mini-guide-entry-renderer:has(a[href^='/feed/trending'])",
        "ytd-mini-guide-entry-renderer:has(a[href^='/feed/explore'])"
      ]
    },
    {
      id: "playables",
      label: "Playables (games)",
      desc: "Hide YouTube Playables shelves and nav links.",
      css: [
        "ytd-guide-entry-renderer:has(a[href^='/playables'])",
        "ytd-mini-guide-entry-renderer:has(a[href^='/playables'])",
        "ytd-rich-section-renderer:has(a[href^='/playables'])"
      ]
    },
    {
      id: "community_posts",
      label: "Community posts",
      desc: "Hide community / backstage posts that appear in feeds.",
      css: [
        "ytd-post-renderer",
        "ytd-backstage-post-thread-renderer",
        "ytd-rich-item-renderer:has(ytd-post-renderer)"
      ]
    },
    {
      id: "notifications",
      label: "Notification bell",
      desc: "Hide the notifications button in the top bar.",
      css: [
        "ytd-notification-topbar-button-renderer"
      ]
    },
    {
      id: "hover_previews",
      label: "Hover video previews",
      desc: "Stop thumbnails from auto-playing a muted preview when hovered.",
      css: [
        "ytd-video-preview",
        "#video-preview",
        "#mouseover-overlay"
      ]
    }
  ];

  // Storage defaults. `blocked` maps element id -> boolean.
  const DEFAULT_SETTINGS = (function () {
    const blocked = {};
    ELEMENTS.forEach(function (e) {
      blocked[e.id] = false;
    });
    return {
      blocked: blocked,
      // Hard daily time limit (usage tracked separately under the "usage" key)
      timeLimit: {
        enabled: false,
        minutes: 60
      },
      // Snooze / lock state
      snoozeDelayMinutes: 30, // how long you must wait before you can unblock
      unlockWindowMinutes: 5, // how long the editing window stays open once ready
      snoozeStartedAt: 0, // epoch ms when the snooze countdown began (0 = none)
      version: 1
    };
  })();

  // Build a single CSS string for the currently-blocked elements.
  function buildCss(blocked) {
    const selectors = [];
    ELEMENTS.forEach(function (e) {
      if (blocked && blocked[e.id]) {
        e.css.forEach(function (sel) {
          selectors.push(sel);
        });
      }
    });
    if (!selectors.length) return "";
    return selectors.join(",\n") + " { display: none !important; }";
  }

  // Path prefixes that should be redirected when their element is blocked.
  function blockedUrlPrefixes(blocked) {
    const out = [];
    ELEMENTS.forEach(function (e) {
      if (blocked && blocked[e.id] && e.blockUrls) {
        e.blockUrls.forEach(function (p) {
          out.push(p);
        });
      }
    });
    return out;
  }

  root.YTBLOCK = {
    ELEMENTS: ELEMENTS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    buildCss: buildCss,
    blockedUrlPrefixes: blockedUrlPrefixes,
    // Deep-ish merge of stored settings onto defaults so new elements get defaults.
    normalize: function (stored) {
      const s = Object.assign({}, DEFAULT_SETTINGS, stored || {});
      s.blocked = Object.assign({}, DEFAULT_SETTINGS.blocked, (stored && stored.blocked) || {});
      s.timeLimit = Object.assign({}, DEFAULT_SETTINGS.timeLimit, (stored && stored.timeLimit) || {});
      return s;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
