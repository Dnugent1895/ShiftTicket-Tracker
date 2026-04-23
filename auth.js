// Login + verification-code flow.
//
// Strategy: the app generates a 6-digit code, stores a HASH of it
// (plus the email and an expiry timestamp) in localStorage, and
// dispatches the plaintext code to the user's email via EmailJS.
// When the user enters the code, we hash + compare.
//
// If EmailJS keys aren't filled in (config.js) the app falls back
// to DEMO MODE which displays the code on screen — useful while
// you finish the EmailJS setup.

window.PFD_AUTH = (function () {
  const cfg = () => window.PFD_CONFIG;
  const KEY_PENDING = 'pfd_pending_code';
  const KEY_SESSION = 'pfd_session';
  // Admin-only demo-mode flags (per-device, localStorage).
  const KEY_DEMO_UNLOCKED = 'pfd_demo_unlocked';
  const KEY_DEMO_ENABLED  = 'pfd_demo_enabled';

  // ---- helpers ----
  function isAllowed(email) {
    if (!email) return false;
    return email.toLowerCase().endsWith(cfg().ALLOWED_DOMAIN.toLowerCase());
  }

  function rand6() {
    // crypto-grade random 6-digit code (000000–999999, zero-padded).
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return String(buf[0] % 1_000_000).padStart(6, '0');
  }

  async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function emailJSReady() {
    const c = cfg();
    return !!(c.EMAILJS_PUBLIC_KEY && c.EMAILJS_SERVICE_ID && c.EMAILJS_TEMPLATE_ID && window.emailjs);
  }

  function initEmailJS() {
    if (emailJSReady() && !initEmailJS._done) {
      window.emailjs.init({ publicKey: cfg().EMAILJS_PUBLIC_KEY });
      initEmailJS._done = true;
    }
  }

  // ---- public API ----

  // Send a code to the email.  Returns:
  //   { ok: true, demo: false }                    real send succeeded
  //   { ok: true, demo: true,  code: '123456' }    demo mode (no EmailJS)
  //   { ok: false, error: '...' }                  failure
  async function sendCode(email) {
    email = (email || '').trim().toLowerCase();
    if (!isAllowed(email)) {
      return { ok: false, error: 'Email must end in ' + cfg().ALLOWED_DOMAIN };
    }
    const code = rand6();
    const hash = await sha256Hex(code + ':' + email);
    const ttlMs = cfg().CODE_TTL_MINUTES * 60 * 1000;
    const pending = { email, hash, expires: Date.now() + ttlMs, attempts: 0 };
    localStorage.setItem(KEY_PENDING, JSON.stringify(pending));

    if (!emailJSReady()) {
      // Demo mode — surface the code so the developer can sign in.
      return { ok: true, demo: true, code };
    }
    try {
      initEmailJS();
      await window.emailjs.send(
        cfg().EMAILJS_SERVICE_ID,
        cfg().EMAILJS_TEMPLATE_ID,
        {
          to_email: email,
          passcode: code,
          ttl_minutes: cfg().CODE_TTL_MINUTES,
          app_name: 'Pioneer Fire Certificates'
        }
      );
      return { ok: true, demo: false };
    } catch (err) {
      console.error('EmailJS send failed:', err);
      // Fall back to demo so the user is never locked out by a
      // misconfiguration — but flag it.
      return { ok: true, demo: true, code, warning: 'Email failed to send. Showing code in demo mode.' };
    }
  }

  function pendingEmail() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY_PENDING) || 'null');
      return p && p.email;
    } catch { return null; }
  }

  // Verify the entered code.  Returns true if accepted; otherwise
  // false and increments the attempt counter (max 5 tries).
  async function verifyCode(input) {
    let pending;
    try { pending = JSON.parse(localStorage.getItem(KEY_PENDING) || 'null'); }
    catch { pending = null; }
    if (!pending) return { ok: false, error: 'No code requested. Please request a new code.' };
    if (Date.now() > pending.expires) {
      localStorage.removeItem(KEY_PENDING);
      return { ok: false, error: 'That code expired. Request a new one.' };
    }
    if (pending.attempts >= 5) {
      localStorage.removeItem(KEY_PENDING);
      return { ok: false, error: 'Too many attempts. Request a new code.' };
    }
    // Strip anything that isn't a digit so pastes like "123 456",
    // "123-456", or "Your code: 123456" still work.
    const trial = (input || '').replace(/\D+/g, '');
    if (trial.length !== 6) {
      return { ok: false, error: 'Code must be 6 digits.' };
    }
    const hash = await sha256Hex(trial + ':' + pending.email);
    if (hash === pending.hash) {
      // success — clear pending, mint a session
      localStorage.removeItem(KEY_PENDING);
      const session = {
        email: pending.email,
        expires: Date.now() + cfg().SESSION_HOURS * 3600 * 1000
      };
      localStorage.setItem(KEY_SESSION, JSON.stringify(session));
      return { ok: true, email: pending.email };
    }
    pending.attempts += 1;
    localStorage.setItem(KEY_PENDING, JSON.stringify(pending));
    return { ok: false, error: 'Incorrect code. ' + (5 - pending.attempts) + ' attempt(s) left.' };
  }

  function currentUser() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY_SESSION) || 'null');
      if (!s) return null;
      if (Date.now() > s.expires) { localStorage.removeItem(KEY_SESSION); return null; }
      return s.email;
    } catch { return null; }
  }

  function signOut() {
    localStorage.removeItem(KEY_SESSION);
    localStorage.removeItem(KEY_PENDING);
  }

  function clearPending() { localStorage.removeItem(KEY_PENDING); }

  // ---- Admin-only demo-mode controls ----
  // These are per-device (localStorage). The panel only appears for
  // someone who has already entered the admin passcode on this device.
  function isDemoUnlocked() {
    return localStorage.getItem(KEY_DEMO_UNLOCKED) === '1';
  }
  function isDemoEnabled() {
    return isDemoUnlocked() && localStorage.getItem(KEY_DEMO_ENABLED) === '1';
  }
  function setDemoEnabled(on) {
    if (on) localStorage.setItem(KEY_DEMO_ENABLED, '1');
    else    localStorage.removeItem(KEY_DEMO_ENABLED);
  }
  // Returns true if the passcode matches and the feature gets unlocked.
  function unlockDemo(passcode) {
    const expected = String(cfg().DEMO_PASSCODE || '').trim();
    if (!expected) return false;
    if (String(passcode || '').trim() !== expected) return false;
    localStorage.setItem(KEY_DEMO_UNLOCKED, '1');
    return true;
  }
  // Hide the panel on this device (also turns demo off).
  function lockDemo() {
    localStorage.removeItem(KEY_DEMO_UNLOCKED);
    localStorage.removeItem(KEY_DEMO_ENABLED);
  }
  // Mint a session as DEMO_SIGN_IN_EMAIL, bypassing the code flow.
  // Only works if demo has been unlocked AND enabled.
  function demoSignIn() {
    if (!isDemoEnabled()) return { ok: false, error: 'Demo mode is off.' };
    const email = String(cfg().DEMO_SIGN_IN_EMAIL || '').trim().toLowerCase()
                  || 'admin@pioneerfire.org';
    const session = {
      email,
      expires: Date.now() + cfg().SESSION_HOURS * 3600 * 1000,
      demo: true
    };
    localStorage.setItem(KEY_SESSION, JSON.stringify(session));
    localStorage.removeItem(KEY_PENDING);
    return { ok: true, email };
  }

  return {
    sendCode, verifyCode, currentUser, signOut, isAllowed, pendingEmail,
    clearPending, emailJSReady,
    isDemoUnlocked, isDemoEnabled, setDemoEnabled, unlockDemo, lockDemo, demoSignIn
  };

})();
