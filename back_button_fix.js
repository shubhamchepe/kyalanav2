/* ══════════════════════════════════════════════════════════════
   BACK-BUTTON / HISTORY MANAGEMENT
   
   Problem: Android back button exits the app instead of closing
   open panels/drawers/modals.
   
   Solution: Use the History API.
   - When a panel opens  → history.pushState({ panel: 'name' })
   - On window 'popstate' → close the topmost panel, do NOT navigate away
   - When a panel closes programmatically → history.back() so the history
     entry we pushed is consumed (prevents double-back to close one panel)
   
   We use a simple flag `_hbClosing` to break the
   popstate ↔ close ↔ history.back() cycle.
══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let _stack = [];       // names of open panels in order
  let _hbClosing = false; // guard: are we already handling a back?

  // ── Helpers ────────────────────────────────────────────────
  function push(name) {
    _stack.push(name);
    history.pushState({ freshPanel: name }, '');
  }

  // Called when a panel is closed by user action (button, overlay click)
  // so we consume its history entry.
  function consumeEntry(name) {
    const idx = _stack.lastIndexOf(name);
    if (idx === -1) return; // already removed by popstate
    _stack.splice(idx, 1);
    if (!_hbClosing) {
      // go back to consume the pushState we made for this panel
      _hbClosing = true;
      history.back();
      // history.back() is async; reset flag after a tick
      setTimeout(() => { _hbClosing = false; }, 100);
    }
  }

  // ── popstate handler ───────────────────────────────────────
  window.addEventListener('popstate', function (e) {
    if (_hbClosing) return; // we triggered this ourselves, ignore

    if (_stack.length === 0) {
      // No panels open. The user is trying to leave the page.
      // Push a new neutral state so the NEXT back presses are absorbed
      // until they press back again with an empty stack.
      // This gives a "confirm exit" feel without a dialog.
      history.pushState({ freshPanel: null }, '');
      return;
    }

    // Close the topmost panel
    const name = _stack[_stack.length - 1];
    _stack.pop();

    _hbClosing = true;
    closeByName(name);
    setTimeout(() => { _hbClosing = false; }, 100);
  });

  // ── Dispatcher ─────────────────────────────────────────────
  function closeByName(name) {
    switch (name) {
      case 'gate':     _rawSkipGate();        break;
      case 'modal':    _rawCloseModal();       break;
      case 'cart':     _rawCloseCart();        break;
      case 'auth':     _rawCloseAuth();        break;
      case 'checkout': _rawCloseCheckout();    break;
      case 'payment':  _rawClosePayment();     break;
      case 'user':     _rawCloseUser();        break;
    }
  }

  // ── Wait for page scripts to define functions, then wrap ───
  // (This script runs after all inline <script> tags via defer-like placement)

  // Raw closers — call the original close logic WITHOUT the history.back()
  function _rawSkipGate() {
    const gate = document.getElementById('pincode-gate');
    gate.style.animation = 'gateOut 0.25s ease forwards';
    setTimeout(() => { gate.style.display = 'none'; document.body.style.overflow = ''; }, 260);
  }
  function _rawCloseModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
  }
  function _rawCloseCart() {
    document.getElementById('cart-drawer').classList.remove('active');
    document.body.style.overflow = '';
  }
  function _rawCloseAuth() {
    document.getElementById('auth-overlay').classList.remove('active');
    document.body.style.overflow = '';
  }
  function _rawCloseCheckout() {
    document.getElementById('checkout-page').classList.remove('active');
    document.body.style.overflow = '';
  }
  function _rawClosePayment() {
    document.getElementById('payment-page').classList.remove('active');
  }
  function _rawCloseUser() {
    document.getElementById('user-drawer').classList.remove('active');
    document.body.style.overflow = '';
  }

  // ── Monkey-patch open/close functions ──────────────────────
  // We wait for DOMContentLoaded to ensure the inline scripts have run

  document.addEventListener('DOMContentLoaded', function () {

    // ── Gate ──
    // Gate is open on page load; push its state immediately
    if (document.getElementById('pincode-gate').style.display !== 'none') {
      push('gate');
    }

    // Patch skipGate (also called by confirmPincode, close button)
    const _og_skipGate = window.skipGate;
    window.skipGate = function () {
      _og_skipGate();
      consumeEntry('gate');
    };

    // changePincode re-opens the gate without pushing state —
    // patch it to push state again
    const _og_changePincode = window.changePincode;
    window.changePincode = function () {
      _og_changePincode();
      push('gate');
    };

    // ── Modal ──
    const _og_openModal = window.openModal;
    window.openModal = function (gi) {
      _og_openModal(gi);
      push('modal');
    };
    const _og_closeModal = window.closeModal;
    window.closeModal = function () {
      _og_closeModal();
      consumeEntry('modal');
    };

    // ── Cart ──
    const _og_openCart = window.openCart;
    window.openCart = function () {
      _og_openCart();
      push('cart');
    };
    const _og_closeCart = window.closeCart;
    window.closeCart = function () {
      _og_closeCart();
      consumeEntry('cart');
    };

    // ── Auth ──
    const _og_openAuth = window.openAuth;
    window.openAuth = function (tab, cb) {
      _og_openAuth(tab, cb);
      push('auth');
    };
    const _og_closeAuth = window.closeAuth;
    window.closeAuth = function () {
      _og_closeAuth();
      consumeEntry('auth');
    };

    // ── Checkout ──
    const _og_openCheckout = window.openCheckoutPage;
    window.openCheckoutPage = function () {
      _og_openCheckout();
      push('checkout');
    };
    const _og_closeCheckout = window.closeCheckout;
    window.closeCheckout = function () {
      _og_closeCheckout();
      consumeEntry('checkout');
    };

    // ── Payment ──
    const _og_goToPayment = window.goToPayment;
    window.goToPayment = function () {
      _og_goToPayment();
      push('payment');
    };
    const _og_closePayment = window.closePaymentPage;
    window.closePaymentPage = function () {
      _og_closePayment();
      consumeEntry('payment');
    };

    // ── User panel ──
    const _og_openUser = window.openUser;
    window.openUser = function () {
      _og_openUser();
      push('user');
    };
    const _og_closeUser = window.closeUser;
    window.closeUser = function () {
      _og_closeUser();
      consumeEntry('user');
    };

    // ── returnHome (success screen close) ──
    // returnHome closes checkout+payment implicitly; clear stack of those
    const _og_returnHome = window.returnHome;
    window.returnHome = function () {
      // remove checkout & payment from stack if present
      ['payment', 'checkout'].forEach(n => {
        const i = _stack.lastIndexOf(n);
        if (i !== -1) _stack.splice(i, 1);
      });
      _og_returnHome();
    };

  }); // end DOMContentLoaded

})();
