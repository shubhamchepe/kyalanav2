// mobile-back-handler.js
// Prevents the back button from closing the webapp on mobile.
// Works by pushing a history state every time the user navigates to a new panel
// or opens a modal. The popstate listener intercepts the back gesture and either:
//   1. Closes the topmost open modal, or
//   2. Navigates back to the previous panel, or
//   3. If already on the dashboard (first panel), pushes a fresh entry so the
//      next back press triggers a "Do you want to exit?" confirm instead of
//      immediately closing the app.

(function () {
  'use strict';

  // ── State tracking ────────────────────────────────────────────────────────
  let _currentPanel = 'dashboard';
  let _panelHistory = ['dashboard']; // stack of visited panels
  let _suppressNextPush = false;     // prevents double-push during popstate restore

  // ── Helpers ───────────────────────────────────────────────────────────────

  function isModalOpen() {
    return !!document.querySelector('.modal-bg.open');
  }

  function closeTopModal() {
    // Find the most recently opened modal and close it
    const modals = Array.from(document.querySelectorAll('.modal-bg.open'));
    if (!modals.length) return false;
    const top = modals[modals.length - 1];
    top.classList.remove('open');
    return true;
  }

  function isSidebarOpen() {
    return document.querySelector('.sidebar')?.classList.contains('open');
  }

  function closeSidebarIfOpen() {
    if (isSidebarOpen()) {
      if (typeof window.closeSidebar === 'function') window.closeSidebar();
      return true;
    }
    return false;
  }

  // Push a named state onto the browser history stack
  function pushPanelState(panelName) {
    if (_suppressNextPush) { _suppressNextPush = false; return; }
    history.pushState({ panel: panelName, ts: Date.now() }, '', '#' + panelName);
  }

  // Push a modal-open state so back closes it before going to the panel
  function pushModalState(modalId) {
    history.pushState({ modal: modalId, ts: Date.now() }, '', location.href.split('#')[0] + '#modal');
  }

  // ── Intercept showPanel ───────────────────────────────────────────────────
  // Wrap the existing showPanel so every navigation pushes a history entry.

  const _originalShowPanel = window.showPanel;

  window.showPanel = function (name) {
    // Only push history if actually changing panels
    if (name !== _currentPanel) {
      _panelHistory.push(name);
      pushPanelState(name);
    }
    _currentPanel = name;
    if (typeof _originalShowPanel === 'function') {
      _originalShowPanel(name);
    }
  };

  // ── Intercept openModal ───────────────────────────────────────────────────
  // Wrap openModal so opening a modal also pushes a history state.

  const _originalOpenModal = window.openModal;

  window.openModal = function (id) {
    if (typeof _originalOpenModal === 'function') {
      _originalOpenModal(id);
    }
    // Only push if modal actually opened
    const el = document.getElementById(id);
    if (el && el.classList.contains('open')) {
      pushModalState(id);
    }
  };

  // ── popstate — the core back-button handler ───────────────────────────────

  window.addEventListener('popstate', function (e) {
    // Priority 1: close sidebar if it's open
    if (closeSidebarIfOpen()) {
      // Re-push so the next back still has somewhere to go
      pushPanelState(_currentPanel);
      return;
    }

    // Priority 2: close topmost modal if any are open
    if (isModalOpen()) {
      closeTopModal();
      // If more modals are still open, push another entry so back closes them too
      if (isModalOpen()) {
        pushModalState('remaining');
      }
      return;
    }

    // Priority 3: go back to previous panel in our stack
    if (_panelHistory.length > 1) {
      _panelHistory.pop(); // remove current
      const prev = _panelHistory[_panelHistory.length - 1];
      _currentPanel = prev;
      _suppressNextPush = true; // don't push again while restoring
      if (typeof _originalShowPanel === 'function') {
        _originalShowPanel(prev);
      }
      // Sync sidebar active state without re-pushing history
      document.querySelectorAll('.sb-item').forEach(s => {
        s.classList.toggle('active', (s.getAttribute('onclick') || '').includes("'" + prev + "'"));
      });
      return;
    }

    // Priority 4: already at dashboard / first panel — show exit confirm
    // Push a fresh entry so the user can cancel and stay in the app
    history.pushState({ panel: _currentPanel, exit: true }, '', '#' + _currentPanel);

    // Use a short timeout so the state is committed before the dialog shows
    setTimeout(function () {
      const leave = window.confirm('Exit Fresh Market Back Office?');
      if (leave) {
        // Actually leave — go back past our pushed entry
        history.go(-2);
      }
      // If cancelled, the pushed state keeps them in the app; do nothing
    }, 50);
  });

  // ── Initial history seed ──────────────────────────────────────────────────
  // On first load, replace the current history entry with a named dashboard
  // state. This means there's always at least one named entry in the stack,
  // so the very first back press is caught by popstate rather than immediately
  // closing the browser tab/WebView.

  function seed() {
    const hash = location.hash.replace('#', '') || 'dashboard';
    // Replace (not push) so we don't add an extra entry on load
    history.replaceState({ panel: hash, seed: true }, '', '#' + hash);
    _currentPanel = hash;
    _panelHistory = [hash];

    // If the URL already has a panel hash, navigate to it
    if (hash !== 'dashboard' && typeof _originalShowPanel === 'function') {
      _suppressNextPush = true;
      _originalShowPanel(hash);
    }
  }

  // Run seed after page is fully ready so showPanel exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', seed);
  } else {
    seed();
  }

  // ── Android physical back button (WebView / TWA) ──────────────────────────
  // Some Android WebViews fire keydown with key 'BrowserBack' or code 'BrowserBack'
  // before triggering popstate. Normalise by firing a history.back() which then
  // triggers the popstate handler above — but only if a modal/sidebar is open,
  // because otherwise the normal popstate flow handles it fine.

  document.addEventListener('keydown', function (e) {
    if (e.key === 'BrowserBack' || e.key === 'GoBack') {
      e.preventDefault();
      if (closeSidebarIfOpen() || isModalOpen()) {
        closeTopModal();
        pushPanelState(_currentPanel);
      } else {
        history.back();
      }
    }
  });

  // ── Swipe-back gesture awareness (iOS Safari / Chrome) ───────────────────
  // iOS fires popstate for swipe-back just like a button press, so the
  // popstate handler above covers it. No extra work needed.

})();
