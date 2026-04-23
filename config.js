// =============================================================
//  Pioneer Fire Certificates — configuration
// -------------------------------------------------------------
//  EDIT THE EMAILJS VALUES BELOW AFTER CREATING YOUR FREE
//  ACCOUNT AT https://www.emailjs.com  (see README for setup).
//  Until these are filled in the app runs in DEMO MODE — the
//  verification code is shown on screen instead of emailed.
// =============================================================

window.PFD_CONFIG = {
  // Allowed email domain.  Only addresses ending in this string
  // can request a verification code.
  ALLOWED_DOMAIN: '@pioneerfire.org',

  // EmailJS settings — fill these in to enable real email delivery.
  // Get them from https://dashboard.emailjs.com
  EMAILJS_PUBLIC_KEY:  'sHGygdpmV1QCp1F4B',
  EMAILJS_SERVICE_ID:  'service_0gr548t',
  EMAILJS_TEMPLATE_ID: 'template_sdyko3b',

  // Code lifetime in minutes.
  CODE_TTL_MINUTES: 10,

  // Session duration after a successful login (hours).
  SESSION_HOURS: 12,

  // ---- Hidden demo-mode toggle (admin only) ----
  // When you (the admin) tap the badge in the app header 7 times in a
  // row within 3 seconds, the app prompts for this passcode.  If it
  // matches, a "Demo mode" panel appears on the login screen that lets
  // you sign in WITHOUT the 6-digit email code.  The unlock state is
  // stored on THIS device only — other users never see the panel.
  //
  // Leave DEMO_PASSCODE as '' (empty string) to disable the feature.
  // Change DEMO_SIGN_IN_EMAIL to the address you want demo mode to log
  // you in as.
  DEMO_PASSCODE: '7777',
  DEMO_SIGN_IN_EMAIL: 'admin@pioneerfire.org',

  // Optional: bottom-center course logo presets.  Add as many as
  // you like — each entry shows up in a dropdown when issuing
  // a certificate.  Use 'none' for no logo.
  COURSE_LOGOS: [
    { id: 'none',   label: 'No course logo',         src: null },
    { id: 'wfstar', label: 'WFSTAR (RT-130)',        src: 'assets/wfstar.png' }
  ]
};
