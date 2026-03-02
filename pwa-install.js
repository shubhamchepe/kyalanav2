/**
 * ═══════════════════════════════════════════════════════════════
 *  pwa-install.js — PWA Service Worker Registration + Install UI
 *
 *  This file handles:
 *  1. Service Worker registration
 *  2. Update detection and user notification
 *  3. Custom "Install App" button (beforeinstallprompt)
 *  4. iOS Safari install instructions (no beforeinstallprompt support)
 *  5. Standalone mode detection
 *
 *  Drop this script into any static site. No frameworks required.
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

(function () {

  /* ───────────────────────────────────────────────────────────
     CONFIG — adjust these to match your app
  ─────────────────────────────────────────────────────────── */
  const SW_PATH  = 'sw.js';           // relative path
const SW_SCOPE = '/kyalanav2/';             // Scope of the service worker
  const UPDATE_INTERVAL = 60 * 60 * 1000; // Check for SW updates every 1 hour


  /* ───────────────────────────────────────────────────────────
     1. SERVICE WORKER REGISTRATION
  ─────────────────────────────────────────────────────────── */
  function registerServiceWorker() {
    // Service workers require HTTPS (or localhost for dev)
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service workers not supported in this browser.');
      return;
    }

    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register(SW_PATH, {
          scope: SW_SCOPE,
          // updateViaCache: 'none' forces the browser to always check
          // the server for a new SW file (ignores HTTP cache for sw.js)
          updateViaCache: 'none',
        });

        console.log('[PWA] Service Worker registered. Scope:', registration.scope);

        // ── Detect first-time install ──────────────────────────
        if (registration.installing) {
          console.log('[PWA] SW installing for the first time…');
          trackInstallState(registration.installing);
        }

        // ── Detect updates to an already-active SW ─────────────
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('[PWA] New service worker found — tracking state…');
          trackInstallState(newWorker, /* isUpdate */ true);
        });

        // ── Periodically poll for updates (background tabs) ────
        setInterval(() => {
          registration.update().catch(() => {});
        }, UPDATE_INTERVAL);

        // ── Listen for controller change (new SW took over) ────
        // This fires after a new SW activates. We notify the user
        // so they can reload to get the latest version.
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          console.log('[PWA] New SW controller — page will reload for update.');
          window.location.reload();
        });

      } catch (err) {
        console.error('[PWA] Service Worker registration failed:', err);
      }
    });
  }

  /**
   * Track a service worker through its state transitions.
   * Fires showUpdateBanner() when the new worker is waiting
   * (installed but not yet controlling the page).
   */
  function trackInstallState(worker, isUpdate = false) {
    worker.addEventListener('statechange', () => {
      console.log('[PWA] SW state →', worker.state);

      if (worker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          // A previous SW was controlling — new version is waiting
          if (isUpdate) {
            showUpdateBanner(worker);
          }
        } else {
          // First-time install — app is now cached for offline use
          console.log('[PWA] App is now available offline! 🎉');
          showOfflineReadyToast();
        }
      }
    });
  }


  /* ───────────────────────────────────────────────────────────
     2. "INSTALL APP" BUTTON  (beforeinstallprompt)
     Only shown by Chrome/Edge when the PWA criteria are met.
  ─────────────────────────────────────────────────────────── */
  let deferredInstallPrompt = null; // holds the deferred event

  /**
   * Capture the browser's install prompt before it auto-fires.
   * We'll trigger it manually from our custom button.
   */
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // Stop the mini-infobar from appearing
    deferredInstallPrompt = event;
    console.log('[PWA] Install prompt deferred — showing install button.');
    showInstallButton();
  });

  /**
   * After the user accepts/dismisses, hide the button and log the outcome.
   */
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully! 🎉');
    deferredInstallPrompt = null;
    hideInstallButton();
    showToast('Fresh Market installed! Open it from your home screen 🌿', 5000);
  });

  /**
   * Triggered when the user taps our custom "Install App" button.
   */
  async function handleInstallClick() {
    if (!deferredInstallPrompt) {
      console.warn('[PWA] No deferred install prompt available.');
      return;
    }

    // Show the browser's native install dialog
    deferredInstallPrompt.prompt();

    // Wait for the user's choice
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] Install prompt outcome:', outcome);

    if (outcome === 'accepted') {
      console.log('[PWA] User accepted installation.');
    } else {
      console.log('[PWA] User dismissed installation.');
      // You could hide the button for this session or show it again later
    }

    // The prompt can only be used once — reset it
    deferredInstallPrompt = null;
    hideInstallButton();
  }


  /* ───────────────────────────────────────────────────────────
     3. iOS SAFARI INSTALL INSTRUCTIONS
     Safari doesn't support beforeinstallprompt, so we show a
     custom tip for iOS users (phone + not in standalone mode).
  ─────────────────────────────────────────────────────────── */
  function checkIosInstallHint() {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
                            || window.navigator.standalone === true;

    if (isIos && !isInStandaloneMode) {
      // Only show once per session
      if (sessionStorage.getItem('ios-hint-shown')) return;
      sessionStorage.setItem('ios-hint-shown', '1');

      setTimeout(() => showIosInstallHint(), 4000); // Delay so page settles first
    }
  }


  /* ───────────────────────────────────────────────────────────
     4. STANDALONE MODE DETECTION
     When the app is running as an installed PWA, we hide browser
     UI chrome and can apply custom styles.
  ─────────────────────────────────────────────────────────── */
  function detectStandaloneMode() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                      || window.navigator.standalone === true;

    if (isStandalone) {
      document.documentElement.classList.add('is-pwa');
      console.log('[PWA] Running in standalone (installed PWA) mode.');
    }

    // Listen for mode changes (e.g. user installs mid-session)
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      document.documentElement.classList.toggle('is-pwa', e.matches);
    });
  }


  /* ───────────────────────────────────────────────────────────
     UI COMPONENTS
     Pure CSS + JS — no external libraries.
  ─────────────────────────────────────────────────────────── */

  // Inject all PWA UI styles once into <head>
  function injectStyles() {
    if (document.getElementById('pwa-styles')) return;

    const style = document.createElement('style');
    style.id = 'pwa-styles';
    style.textContent = `
      /* ── Install Button ─────────────────────────────── */
      #pwa-install-btn {
        display: none; /* hidden until beforeinstallprompt fires */
        position: fixed;
        bottom: 88px; /* above bottom nav / cart bar */
        right: 16px;
        z-index: 800;
        align-items: center;
        gap: 8px;
        padding: 12px 18px;
        background: linear-gradient(135deg, #1b5e20, #2e7d32);
        color: #fff;
        border: none;
        border-radius: 50px;
        font-family: 'DM Sans', sans-serif;
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(30, 107, 30, 0.45), 0 1px 6px rgba(0,0,0,0.2);
        transition: transform 0.2s cubic-bezier(0.34, 1.4, 0.64, 1),
                    box-shadow 0.2s ease,
                    opacity 0.2s ease;
        animation: pwaSlideUp 0.4s cubic-bezier(0.34, 1.3, 0.64, 1) both;
        white-space: nowrap;
        letter-spacing: 0.2px;
      }

      #pwa-install-btn.visible { display: flex; }

      #pwa-install-btn:hover {
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 8px 28px rgba(30, 107, 30, 0.5);
      }

      #pwa-install-btn:active { transform: scale(0.97); }

      #pwa-install-btn .pwa-btn-icon { font-size: 1.1rem; line-height: 1; }

      #pwa-install-btn .pwa-btn-dismiss {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255,255,255,0.25);
        font-size: 0.65rem;
        font-weight: 900;
        margin-left: 4px;
        cursor: pointer;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      #pwa-install-btn .pwa-btn-dismiss:hover { background: rgba(255,255,255,0.42); }

      @keyframes pwaSlideUp {
        from { opacity: 0; transform: translateY(20px) scale(0.92); }
        to   { opacity: 1; transform: translateY(0)    scale(1);    }
      }

      /* ── Update Banner ──────────────────────────────── */
      #pwa-update-banner {
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 900;
        background: linear-gradient(90deg, #1565c0, #1976d2);
        color: #fff;
        padding: 10px 16px;
        align-items: center;
        gap: 10px;
        font-family: 'DM Sans', sans-serif;
        font-size: 0.84rem;
        font-weight: 500;
        box-shadow: 0 2px 12px rgba(0,0,0,0.2);
        animation: pwaSlideDown 0.35s ease both;
      }

      #pwa-update-banner.visible { display: flex; }

      #pwa-update-banner .pwa-update-text { flex: 1; }

      #pwa-update-banner .pwa-update-reload {
        background: rgba(255,255,255,0.22);
        border: 1.5px solid rgba(255,255,255,0.5);
        color: #fff;
        border-radius: 50px;
        padding: 6px 14px;
        font-family: 'DM Sans', sans-serif;
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s;
        white-space: nowrap;
        flex-shrink: 0;
      }
      #pwa-update-banner .pwa-update-reload:hover { background: rgba(255,255,255,0.35); }

      #pwa-update-banner .pwa-update-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.7);
        font-size: 1rem;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        transition: color 0.12s;
        flex-shrink: 0;
      }
      #pwa-update-banner .pwa-update-close:hover { color: #fff; }

      @keyframes pwaSlideDown {
        from { opacity: 0; transform: translateY(-100%); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ── iOS Install Hint ───────────────────────────── */
      #pwa-ios-hint {
        display: none;
        position: fixed;
        bottom: 16px;
        left: 16px; right: 16px;
        z-index: 800;
        background: #fff;
        border-radius: 18px;
        padding: 18px 18px 16px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.1);
        animation: pwaSlideUp 0.4s cubic-bezier(0.34, 1.3, 0.64, 1) both;
      }

      #pwa-ios-hint.visible { display: block; }

      #pwa-ios-hint .pih-close {
        position: absolute;
        top: 12px; right: 14px;
        background: #f5f5f5;
        border: none;
        border-radius: 50%;
        width: 28px; height: 28px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 0.75rem; color: #777;
      }

      #pwa-ios-hint .pih-title {
        font-family: 'DM Sans', sans-serif;
        font-size: 0.95rem;
        font-weight: 700;
        color: #1a1a1a;
        margin-bottom: 8px;
        padding-right: 32px;
      }

      #pwa-ios-hint .pih-steps {
        list-style: none;
        padding: 0; margin: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      #pwa-ios-hint .pih-steps li {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: 'DM Sans', sans-serif;
        font-size: 0.82rem;
        color: #555;
        line-height: 1.4;
      }

      #pwa-ios-hint .pih-steps .pih-step-icon {
        width: 30px; height: 30px;
        flex-shrink: 0;
        background: #f0f0f0;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
      }

      /* ── Offline-Ready Toast ────────────────────────── */
      #pwa-offline-toast {
        display: none;
        position: fixed;
        bottom: 24px; left: 50%;
        transform: translateX(-50%) translateY(60px);
        z-index: 810;
        background: #1a1a1a;
        color: #fff;
        padding: 10px 22px;
        border-radius: 50px;
        font-family: 'DM Sans', sans-serif;
        font-size: 0.84rem;
        font-weight: 500;
        box-shadow: 0 4px 18px rgba(0,0,0,0.3);
        white-space: nowrap;
        transition: transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1),
                    opacity 0.3s ease;
        opacity: 0;
        pointer-events: none;
      }
      #pwa-offline-toast.visible {
        display: block;
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }

      /* ── .is-pwa class tweaks ───────────────────────── */
      /* Applied to <html> when running as installed PWA   */
      .is-pwa #pwa-install-btn { display: none !important; }
    `;
    document.head.appendChild(style);
  }


  /* ── Install Button ──────────────────────────────────────── */
  function createInstallButton() {
    if (document.getElementById('pwa-install-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.setAttribute('aria-label', 'Install Fresh Market app');
    btn.innerHTML = `
      <span class="pwa-btn-icon">📲</span>
      <span>Install App</span>
      <span class="pwa-btn-dismiss" role="button" aria-label="Dismiss">✕</span>
    `;

    // Main button click → trigger install prompt
    btn.addEventListener('click', (e) => {
      // If the user clicked the dismiss (✕) chip, just hide
      if (e.target.classList.contains('pwa-btn-dismiss')) {
        hideInstallButton();
        // Store dismissal so we don't show it again this session
        sessionStorage.setItem('pwa-install-dismissed', '1');
        return;
      }
      handleInstallClick();
    });

    document.body.appendChild(btn);
  }

  function showInstallButton() {
    // Respect user's session dismissal
    if (sessionStorage.getItem('pwa-install-dismissed')) return;

    createInstallButton();
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.classList.add('visible');
  }

  function hideInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.classList.remove('visible');
  }


  /* ── Update Banner ───────────────────────────────────────── */
  function showUpdateBanner(waitingWorker) {
    if (document.getElementById('pwa-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <span class="pwa-update-text">🔄 A new version of Fresh Market is available.</span>
      <button class="pwa-update-reload">Update Now</button>
      <button class="pwa-update-close" aria-label="Dismiss update notice">✕</button>
    `;

    banner.querySelector('.pwa-update-reload').addEventListener('click', () => {
      // Tell the waiting SW to skip waiting and become active
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      banner.remove();
    });

    banner.querySelector('.pwa-update-close').addEventListener('click', () => {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    });

    document.body.appendChild(banner);
    // Force reflow then add visible class to trigger CSS animation
    requestAnimationFrame(() => banner.classList.add('visible'));
  }


  /* ── iOS Install Hint ────────────────────────────────────── */
  function showIosInstallHint() {
    if (document.getElementById('pwa-ios-hint')) return;

    const hint = document.createElement('div');
    hint.id = 'pwa-ios-hint';
    hint.setAttribute('role', 'dialog');
    hint.setAttribute('aria-label', 'Install app on iOS');
    hint.innerHTML = `
      <button class="pih-close" aria-label="Close">✕</button>
      <div class="pih-title">📲 Add Fresh Market to your Home Screen</div>
      <ul class="pih-steps">
        <li>
          <span class="pih-step-icon">1️⃣</span>
          Tap the <strong>Share</strong> button in the Safari toolbar (the box with an arrow)
        </li>
        <li>
          <span class="pih-step-icon">2️⃣</span>
          Scroll down and tap <strong>"Add to Home Screen"</strong>
        </li>
        <li>
          <span class="pih-step-icon">3️⃣</span>
          Tap <strong>"Add"</strong> in the top-right corner
        </li>
      </ul>
    `;

    hint.querySelector('.pih-close').addEventListener('click', () => {
      hint.classList.remove('visible');
      setTimeout(() => hint.remove(), 300);
    });

    document.body.appendChild(hint);
    requestAnimationFrame(() => hint.classList.add('visible'));
  }


  /* ── Offline-Ready Toast ─────────────────────────────────── */
  function showOfflineReadyToast() {
    let toast = document.getElementById('pwa-offline-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pwa-offline-toast';
      toast.setAttribute('role', 'status');
      toast.textContent = '✅ Fresh Market is ready to use offline!';
      document.body.appendChild(toast);
    }

    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }


  /* ── General Toast (reuses existing app toast if present) ── */
  function showToast(message, duration = 3000) {
    // Try to use the app's own toast function if available
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    // Otherwise fall back to our own
    let toast = document.getElementById('pwa-generic-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pwa-generic-toast';
      Object.assign(toast.style, {
        position: 'fixed', bottom: '24px', left: '50%',
        transform: 'translateX(-50%)',
        background: '#1a1a1a', color: '#fff',
        padding: '10px 22px', borderRadius: '50px',
        fontFamily: 'sans-serif', fontSize: '0.84rem',
        zIndex: '999', whiteSpace: 'nowrap',
      });
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, duration);
  }


  /* ───────────────────────────────────────────────────────────
     INIT — wire everything together
  ─────────────────────────────────────────────────────────── */
  function init() {
    injectStyles();
    detectStandaloneMode();
    registerServiceWorker();
    checkIosInstallHint();

    // Expose a global API for advanced use from the main page script
    window.PWA = {
      showInstallButton,
      hideInstallButton,
      triggerInstall: handleInstallClick,
      clearCaches: () => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const channel = new MessageChannel();
          channel.port1.onmessage = (e) => {
            if (e.data.cleared) console.log('[PWA] All caches cleared via global API.');
          };
          navigator.serviceWorker.controller.postMessage(
            { type: 'CLEAR_CACHES' },
            [channel.port2]
          );
        }
      },
    };
  }

  // Run as soon as the script is parsed (script is deferred in HTML)
  init();

})(); // end IIFE
