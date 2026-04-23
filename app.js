// Main app controller — screen routing, form state, glue.

(function () {
  const $   = (sel, root = document) => root.querySelector(sel);
  const $$  = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const app = $('#app');

  // ---------------- screen rendering -------------------------
  function show(tplId, fill) {
    const tpl = document.getElementById(tplId);
    app.innerHTML = '';
    app.appendChild(tpl.content.cloneNode(true));
    if (fill) fill();
  }

  // ---------------- service worker ---------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {/* ignore */});
    });
  }

  // ---------------- session bootstrap ------------------------
  function refreshChrome() {
    const me = PFD_AUTH.currentUser();
    $('#logoutBtn').classList.toggle('hidden', !me);
  }
  $('#logoutBtn').addEventListener('click', () => {
    PFD_AUTH.signOut();
    refreshChrome();
    showLogin();
  });

  function start() {
    refreshChrome();
    if (PFD_AUTH.currentUser()) showHome();
    else if (PFD_AUTH.pendingEmail()) showCode();
    else showLogin();
  }

  // ============== LOGIN: email entry =========================
  function showLogin() {
    show('tpl-login-email', () => {
      const f = $('#emailForm');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#emailInput').value.trim();
        $('#emailErr').textContent = '';
        if (!PFD_AUTH.isAllowed(email)) {
          $('#emailErr').textContent = 'Only ' + PFD_CONFIG.ALLOWED_DOMAIN + ' emails can sign in.';
          return;
        }
        const btn = f.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Sending…';
        const res = await PFD_AUTH.sendCode(email);
        btn.disabled = false; btn.textContent = 'Send code';
        if (!res.ok) { $('#emailErr').textContent = res.error; return; }
        showCode(res.demo ? res.code : null, res.warning);
      });
      // Admin-only demo panel + unlock gesture
      renderDemoPanel();
      armDemoUnlockGesture();
    });
  }

  // ---- Admin-only demo mode (hidden) -------------------------
  // Unlock: tap the appbar badge 7 times within 3 seconds, then enter
  // the passcode from PFD_CONFIG.DEMO_PASSCODE.
  function armDemoUnlockGesture() {
    const badge = document.querySelector('.appbar-badge');
    if (!badge || badge.dataset.demoArmed === '1') return;
    badge.dataset.demoArmed = '1';
    let taps = 0;
    let first = 0;
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', () => {
      const now = Date.now();
      if (now - first > 3000) { taps = 0; first = now; }
      taps += 1;
      if (taps >= 7) {
        taps = 0;
        if (PFD_AUTH.isDemoUnlocked()) {
          renderDemoPanel();
          alert('Demo panel already unlocked.');
          return;
        }
        const pass = prompt('Admin passcode:');
        if (pass == null) return; // cancelled
        if (PFD_AUTH.unlockDemo(pass)) {
          renderDemoPanel();
          alert('Demo panel unlocked on this device.');
        } else {
          alert('Wrong passcode.');
        }
      }
    });
  }

  function renderDemoPanel() {
    // Only render if we're on the login screen and the panel is unlocked.
    const host = $('#emailForm') && $('#emailForm').parentElement;
    if (!host) return;
    // Remove any existing panel first
    const old = document.getElementById('demoPanel');
    if (old) old.remove();
    if (!PFD_AUTH.isDemoUnlocked()) return;

    const enabled = PFD_AUTH.isDemoEnabled();
    const panel = document.createElement('div');
    panel.id = 'demoPanel';
    panel.className = 'demo-panel';
    panel.innerHTML =
      '<hr style="border:none;border-top:1px dashed #d3cdbb;margin:18px 0 12px;">' +
      '<div class="demo-row">' +
        '<div class="demo-label">' +
          '<strong>Demo mode</strong> <span class="muted">(admin)</span><br>' +
          '<span class="muted" style="font-size:12px;">Signs you in as <code>' +
            (PFD_CONFIG.DEMO_SIGN_IN_EMAIL || 'admin@pioneerfire.org') +
          '</code> without a code.</span>' +
        '</div>' +
        '<button type="button" class="demo-toggle ' + (enabled ? 'on' : 'off') + '" id="demoToggle" aria-pressed="' + enabled + '">' +
          '<span class="demo-knob"></span>' +
          '<span class="demo-state">' + (enabled ? 'ON' : 'OFF') + '</span>' +
        '</button>' +
      '</div>' +
      (enabled
        ? '<button type="button" class="primary" id="demoSignInBtn" style="margin-top:10px;">Sign in without code</button>'
        : '') +
      '<div style="margin-top:10px;">' +
        '<button type="button" class="link" id="demoLockBtn">Hide this panel on this device</button>' +
      '</div>';
    host.appendChild(panel);

    $('#demoToggle').addEventListener('click', () => {
      PFD_AUTH.setDemoEnabled(!PFD_AUTH.isDemoEnabled());
      renderDemoPanel();
    });
    if (enabled) {
      $('#demoSignInBtn').addEventListener('click', () => {
        const res = PFD_AUTH.demoSignIn();
        if (!res.ok) { alert(res.error || 'Demo sign-in failed.'); return; }
        refreshChrome();
        showHome();
      });
    }
    $('#demoLockBtn').addEventListener('click', () => {
      if (!confirm('Hide the demo panel on this device? You can unlock it again by tapping the badge 7 times.')) return;
      PFD_AUTH.lockDemo();
      renderDemoPanel();
    });
  }

  // ============== LOGIN: code entry =========================
  function showCode(demoCode, warning) {
    show('tpl-login-code', () => {
      $('#codeEmail').textContent = PFD_AUTH.pendingEmail() || '';
      if (demoCode) {
        $('#demoCodeBanner').classList.remove('hidden');
        $('#demoCodeValue').textContent = demoCode;
        if (warning) $('#demoCodeBanner').insertAdjacentHTML('beforeend', '<br><em>' + warning + '</em>');
      }
      $('#codeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('#codeErr').textContent = '';
        const code = $('#codeInput').value.trim();
        const res = await PFD_AUTH.verifyCode(code);
        if (!res.ok) { $('#codeErr').textContent = res.error; return; }
        refreshChrome();
        showHome();
      });
      $('#resendBtn').addEventListener('click', async () => {
        const email = PFD_AUTH.pendingEmail();
        if (!email) { showLogin(); return; }
        const res = await PFD_AUTH.sendCode(email);
        if (res.ok && res.demo) {
          $('#demoCodeBanner').classList.remove('hidden');
          $('#demoCodeValue').textContent = res.code;
        } else if (res.ok) {
          $('#codeErr').textContent = '';
          alert('A new code has been sent.');
        } else {
          $('#codeErr').textContent = res.error;
        }
      });
      $('#changeEmailBtn').addEventListener('click', () => {
        PFD_AUTH.clearPending();
        showLogin();
      });
    });
  }

  // ============== HOME ======================================
  function showHome() {
    show('tpl-home', () => {
      $('#meEmail').textContent = PFD_AUTH.currentUser() || '';
      $('#issueBtn').addEventListener('click', showIssue);
    });
  }

  // ============== ISSUE CERTIFICATE =========================
  function showIssue() {
    show('tpl-issue', () => initIssue());
  }

  function initIssue() {
    // ---------- shared state ----------
    const state = {
      courseName: '',
      courseNumber: '',
      dateMode: 'single',
      dateStart: '',
      dateEnd: '',
      courseLogoSrc: null,
      primaryName: '',
      primarySigImg: null,
      coNA: false,
      coName: '',
      coSigImg: null,
      students: []   // { first, last }
    };
    const sigs = { primary: null, co: null };

    // ---------- step indicator ----------
    let _animating = false;
    let _skipNextAnim = false; // set by swipe commit so setStep doesn't double-animate
    function setStep(n, opts) {
      opts = opts || {};
      const direction = opts.direction || 'auto';
      let animate     = opts.animate   !== false; // default true
      if (_skipNextAnim) { animate = false; _skipNextAnim = false; }

      // Update the step pills at the top
      $$('.steps li').forEach(li => {
        const s = +li.dataset.step;
        li.classList.toggle('active', s === n);
        li.classList.toggle('done', s < n);
      });

      const oldStep = document.querySelector('.step:not(.hidden)');
      const newStep = document.querySelector('.step[data-step="' + n + '"]');
      if (!newStep) return;

      // First render or no animation — just toggle visibility
      if (!animate || !oldStep || oldStep === newStep) {
        $$('.step').forEach(el => {
          el.classList.toggle('hidden', +el.dataset.step !== n);
          el.style.transform = '';
          el.style.opacity   = '';
        });
        if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Decide direction (forward/back) automatically if not specified.
      const oldN = +oldStep.dataset.step;
      const fwd  = direction === 'forward' ? true
                  : direction === 'backward' ? false
                  : (n > oldN);

      _animating = true;

      // 1. Park the old step in absolute position so the new one can take its place
      oldStep.classList.add('is-leaving');

      // 2. Show the new step at the off-screen position it should slide IN from
      newStep.classList.remove('hidden');
      newStep.style.transform = 'translateX(' + (fwd ? '100%' : '-100%') + ')';
      newStep.style.opacity   = '0.4';

      // Force a reflow so the browser registers the start state
      // before applying the transition target.
      void newStep.offsetWidth;

      // 3. Slide both
      requestAnimationFrame(() => {
        newStep.style.transform = 'translateX(0)';
        newStep.style.opacity   = '1';
        oldStep.style.transform = 'translateX(' + (fwd ? '-100%' : '100%') + ')';
        oldStep.style.opacity   = '0';
      });

      // 4. Cleanup once the animation completes
      setTimeout(() => {
        oldStep.classList.add('hidden');
        oldStep.classList.remove('is-leaving');
        oldStep.style.transform = '';
        oldStep.style.opacity   = '';
        newStep.style.transform = '';
        newStep.style.opacity   = '';
        _animating = false;
        if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 340);
    }

    // ---------- back ----------
    $('#backHome').addEventListener('click', () => {
      if (confirm('Discard this certificate batch and return to the home screen?')) showHome();
    });
    $$('button[data-prev]').forEach(b => b.addEventListener('click', () => setStep(+b.dataset.prev - 1)));

    // ---------- clickable step pills (desktop + mobile tap) ----------
    // Lets the user jump between Course / Instructors / Roster / Generate
    // by clicking (or tapping) the pills at the top.
    //   - Jumping BACKWARDS: free, no validation.
    //   - Jumping FORWARDS:  runs the Next-button handlers of each
    //     intermediate step so validation still applies. If a step
    //     fails validation we stop there (and the user sees the alert).
    function jumpToStep(target) {
      if (_animating) return;
      const activeLi = document.querySelector('.steps li.active');
      if (!activeLi) return;
      const current = +activeLi.dataset.step;
      if (target === current) return;
      if (target < current) {
        setStep(target);
        return;
      }
      // Forward: chain Next clicks until we hit the target or get
      // blocked by validation.
      let now = current;
      let safety = 10;
      while (now < target && safety-- > 0) {
        const btn = document.querySelector('#step' + now + 'Next');
        if (!btn) break;
        btn.click();
        const afterLi = document.querySelector('.steps li.active');
        const after = afterLi ? +afterLi.dataset.step : now;
        if (after === now) break; // validation blocked advancement
        now = after;
      }
    }
    $$('.steps li').forEach(li => {
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.setAttribute('aria-label', 'Go to ' + li.textContent.trim() + ' step');
      li.addEventListener('click', () => jumpToStep(+li.dataset.step));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          jumpToStep(+li.dataset.step);
        }
      });
    });

    // ---------- step 1: course ----------
    // populate course-logo dropdown
    const logoSel = $('#courseLogo');
    PFD_CONFIG.COURSE_LOGOS.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      o.dataset.src = opt.src || '';
      logoSel.appendChild(o);
    });

    // default start date = today (local time, not UTC)
    const today = new Date();
    const iso = today.getFullYear() + '-' +
                String(today.getMonth() + 1).padStart(2, '0') + '-' +
                String(today.getDate()).padStart(2, '0');
    $('#dateStart').value = iso;

    $$('input[name=dateMode]').forEach(r =>
      r.addEventListener('change', () => {
        const range = $('input[name=dateMode]:checked').value === 'range';
        $('#dateEndWrap').classList.toggle('hidden', !range);
      })
    );

    $('#step1Next').addEventListener('click', () => {
      state.courseName   = $('#courseName').value.trim();
      state.courseNumber = $('#courseNumber').value.trim();
      state.dateMode     = $('input[name=dateMode]:checked').value;
      state.dateStart    = $('#dateStart').value;
      state.dateEnd      = $('#dateEnd').value;
      const opt = logoSel.options[logoSel.selectedIndex];
      state.courseLogoSrc = opt && opt.dataset.src ? opt.dataset.src : null;

      if (!state.courseName)   return alert('Please enter a course name.');
      if (!state.courseNumber) return alert('Please enter a course number.');
      if (!state.dateStart)    return alert('Please choose a course completion date.');
      if (state.dateMode === 'range' && !state.dateEnd) return alert('Please choose an end date.');

      setStep(2);
      // signature pads need to be initialized after the step is visible
      // so the canvases have layout dimensions
      setTimeout(() => {
        if (!sigs.primary) sigs.primary = PFD_SIG.attach($('#primarySigCanvas'));
        if (!sigs.co)      sigs.co      = PFD_SIG.attach($('#coSigCanvas'));
      }, 0);
    });

    // ---------- step 2: instructors ----------
    $$('button[data-clear]').forEach(b =>
      b.addEventListener('click', () => {
        const which = b.dataset.clear === 'primarySigCanvas' ? sigs.primary : sigs.co;
        if (which) which.clear();
      })
    );
    $('#coNA').addEventListener('change', (e) => {
      $('#coBlock').classList.toggle('hidden', e.target.checked);
    });

    $('#step2Next').addEventListener('click', () => {
      state.primaryName  = $('#primaryName').value.trim();
      state.primarySigImg = PFD_SIG.toPNG(sigs.primary);
      state.coNA = $('#coNA').checked;
      if (!state.coNA) {
        state.coName = $('#coName').value.trim();
        state.coSigImg = PFD_SIG.toPNG(sigs.co);
      } else {
        state.coName = '';
        state.coSigImg = null;
      }

      if (!state.primaryName) return alert('Please enter the primary instructor name and title.');
      if (!state.primarySigImg) return alert('Please draw the primary instructor signature.');
      if (!state.coNA) {
        if (!state.coName) return alert('Please enter the co-instructor name and title (or check "No co-instructor").');
        if (!state.coSigImg) return alert('Please draw the co-instructor signature (or check "No co-instructor").');
      }
      setStep(3);
      ensureRosterRows();
    });

    // ---------- step 3: roster ----------
    function rosterRow(idx, first = '', last = '') {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="row-num">' + (idx + 1) + '</td>' +
        '<td><input type="text" class="r-first" placeholder="First" value="' + escapeAttr(first) + '"></td>' +
        '<td><input type="text" class="r-last"  placeholder="Last"  value="' + escapeAttr(last) + '"></td>' +
        '<td class="row-del"><button class="del-btn" type="button" title="Remove">×</button></td>';
      tr.querySelector('.del-btn').addEventListener('click', () => {
        tr.remove();
        renumber();
      });
      return tr;
    }
    function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
    function renumber() {
      $$('#rosterBody tr').forEach((tr, i) => {
        tr.querySelector('.row-num').textContent = i + 1;
      });
      $('#numStudents').value = $$('#rosterBody tr').length || 1;
    }
    function ensureRosterRows() {
      const want = parseInt($('#numStudents').value, 10) || 1;
      const have = $$('#rosterBody tr').length;
      const tbody = $('#rosterBody');
      if (have < want) {
        for (let i = have; i < want; i++) tbody.appendChild(rosterRow(i));
      }
    }

    $('#numStudents').addEventListener('change', () => {
      const want = parseInt($('#numStudents').value, 10) || 1;
      const tbody = $('#rosterBody');
      const have = tbody.children.length;
      if (want > have) for (let i = have; i < want; i++) tbody.appendChild(rosterRow(i));
      else if (want < have) {
        while (tbody.children.length > want) tbody.removeChild(tbody.lastChild);
      }
      renumber();
    });

    $('#addRow').addEventListener('click', () => {
      const idx = $$('#rosterBody tr').length;
      $('#rosterBody').appendChild(rosterRow(idx));
      $('#numStudents').value = idx + 1;
    });
    $('#clearRoster').addEventListener('click', () => {
      if (!confirm('Clear all roster rows?')) return;
      $('#rosterBody').innerHTML = '';
      $('#numStudents').value = 1;
      ensureRosterRows();
    });

    // CSV upload
    $('#rosterFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const rows = parseCSV(text);
      if (!rows.length) { alert('Could not read any rows from the file.'); return; }
      // detect header row
      const hdr = rows[0].map(c => c.toLowerCase().trim());
      let firstIdx = 0, lastIdx = 1;
      if (hdr.some(c => c.includes('first') || c.includes('last') || c === 'name')) {
        const fi = hdr.findIndex(c => c.includes('first'));
        const li = hdr.findIndex(c => c.includes('last'));
        if (fi >= 0) firstIdx = fi;
        if (li >= 0) lastIdx  = li;
        rows.shift();
      }
      // Replace existing rows
      $('#rosterBody').innerHTML = '';
      rows.forEach((r, i) => {
        const f = (r[firstIdx] || '').trim();
        const l = (r[lastIdx]  || '').trim();
        if (!f && !l) return;
        // If the file uses a single combined "Name" column, split it
        if (!l && f.includes(' ')) {
          const parts = f.split(/\s+/);
          const fn = parts.shift();
          const ln = parts.join(' ');
          $('#rosterBody').appendChild(rosterRow($$('#rosterBody tr').length, fn, ln));
        } else {
          $('#rosterBody').appendChild(rosterRow($$('#rosterBody tr').length, f, l));
        }
      });
      $('#numStudents').value = $$('#rosterBody tr').length || 1;
      e.target.value = '';
    });

    function parseCSV(text) {
      // tiny CSV/TSV parser — handles quoted commas
      const lines = text.split(/\r?\n/).filter(l => l.trim().length);
      const isTSV = text.indexOf('\t') !== -1 && (text.indexOf(',') === -1 || text.indexOf('\t') < text.indexOf(','));
      const sep = isTSV ? '\t' : ',';
      return lines.map(line => {
        const out = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQ) {
            if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
            else if (ch === '"') inQ = false;
            else cur += ch;
          } else {
            if (ch === '"') inQ = true;
            else if (ch === sep) { out.push(cur); cur = ''; }
            else cur += ch;
          }
        }
        out.push(cur);
        return out;
      });
    }

    $('#step3Next').addEventListener('click', () => {
      const rows = $$('#rosterBody tr').map(tr => ({
        first: tr.querySelector('.r-first').value.trim(),
        last:  tr.querySelector('.r-last').value.trim()
      })).filter(r => r.first || r.last);
      if (!rows.length) return alert('Add at least one student to the roster.');
      const bad = rows.find(r => !r.first || !r.last);
      if (bad) return alert('Every row needs both a first and last name.');
      state.students = rows;
      // Fill review block
      $('#rvCourse').textContent  = state.courseName;
      $('#rvNumber').textContent  = state.courseNumber;
      $('#rvDate').textContent    = state.dateMode === 'range' && state.dateEnd
        ? formatDateNice(state.dateStart) + ' – ' + formatDateNice(state.dateEnd)
        : formatDateNice(state.dateStart);
      $('#rvPrimary').textContent = state.primaryName;
      $('#rvCo').textContent      = state.coNA ? '— (none)' : state.coName;
      $('#rvCount').textContent   = state.students.length;
      setStep(4);
    });

    function formatDateNice(iso) {
      if (!iso) return '';
      const [y,m,d] = iso.split('-').map(Number);
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return months[m-1] + ' ' + d + ', ' + y;
    }

    // ---------- step 4: generate ----------
    $('#generateBtn').addEventListener('click', async () => {
      const fmt = $('input[name=outFmt]:checked').value;
      const status = $('#generateStatus');
      const downloads = $('#downloadList');
      downloads.innerHTML = '';
      status.classList.remove('hidden', 'ok', 'err');
      status.classList.add('status');
      status.textContent = 'Rendering certificate 1 of ' + state.students.length + '…';

      try {
        const files = await PFD_CERT.generate(state, state.students, fmt, (done, total) => {
          status.textContent = 'Rendered ' + done + ' of ' + total + ' certificate(s)…';
        });
        // Build download links
        files.forEach(f => {
          const url = URL.createObjectURL(f.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = f.name;
          a.innerHTML = '<span>' + f.name + '</span><span>Download ↓</span>';
          downloads.appendChild(a);
        });
        status.textContent = 'Done. ' + files.length + ' file(s) ready below.';
        status.classList.add('ok');
        // Render preview of first
        const wrap = $('#previewWrap');
        wrap.classList.remove('hidden');
        await PFD_CERT.previewCanvas(state, state.students[0], $('#previewCanvas'));
      } catch (err) {
        console.error(err);
        status.textContent = 'Something went wrong: ' + (err && err.message ? err.message : err);
        status.classList.add('err');
      }
    });

    // ---------- swipe navigation ----------
    // Live finger/mouse tracking. The form follows the pointer and a
    // preview of the adjacent step slides in alongside it. On release,
    // the gesture either commits (next step) or snaps back, with a
    // smooth animation that picks up exactly where the drag left off.
    (function attachSwipe() {
      const stage = document.querySelector('.step-stage');
      if (!stage) return;
      const stageWidth = () => stage.getBoundingClientRect().width;
      const SLOP = 8;          // pixels before we decide horizontal vs vertical
      const COMMIT_FRAC = 0.25;
      const COMMIT_VEL_MS = 500;
      const COMMIT_VEL_DX = 50;

      // Gesture state ---------------------------------------------------
      let pending = false;     // we're watching but haven't claimed yet
      let active  = false;     // we own the gesture (no scrolling/typing)
      let sx = 0, sy = 0, st = 0, dx = 0;
      let oldStep = null, peekStep = null;
      let direction = 'forward';

      function pointer(e) {
        return e.touches && e.touches[0] ? e.touches[0]
             : e.changedTouches && e.changedTouches[0] ? e.changedTouches[0]
             : e;
      }
      function isProtected(t) {
        // Areas where horizontal drags must NEVER become a swipe
        // (drawing on the signature pad, scrolling roster table)
        return t && t.closest && (t.closest('.sigpad') || t.closest('.roster'));
      }
      function isInteractive(t) {
        // Form fields where we should let a tap focus the field but
        // still allow swipe if the user actually drags horizontally
        return t && t.matches && t.matches('input,textarea,select,button');
      }
      function currentStep() {
        const a = document.querySelector('.steps li.active');
        return a ? +a.dataset.step : 0;
      }
      function neighborStep(dir) {
        const n = currentStep();
        const target = dir === 'forward' ? n + 1 : n - 1;
        return document.querySelector('.step[data-step="' + target + '"]');
      }

      function reset() {
        pending = false; active = false;
        if (oldStep) {
          oldStep.classList.remove('is-dragging');
          oldStep.style.transition = '';
          oldStep.style.transform  = '';
          oldStep.style.opacity    = '';
        }
        if (peekStep) {
          peekStep.classList.remove('is-dragging-peek');
          peekStep.classList.add('hidden');
          peekStep.style.transition = '';
          peekStep.style.transform  = '';
          peekStep.style.opacity    = '';
        }
        oldStep = peekStep = null;
      }

      function setPeek(dir) {
        const want = neighborStep(dir);
        if (want === peekStep) return;
        if (peekStep) {
          peekStep.classList.remove('is-dragging-peek');
          peekStep.classList.add('hidden');
          peekStep.style.transform = '';
          peekStep.style.opacity   = '';
        }
        peekStep = want || null;
        if (peekStep) {
          peekStep.classList.remove('hidden');
          peekStep.classList.add('is-dragging-peek');
          peekStep.style.opacity = '0.92';
        }
      }

      function commitTo(dir) {
        // Animate everything to its final position, THEN hand over to
        // setStep with animate:false so the validation/state updates
        // happen without a second visual transition.
        const w = stageWidth();
        const targetOldX = dir === 'forward' ? -w : w;
        const ease = 'cubic-bezier(0.22, 0.84, 0.34, 1.04)';
        if (oldStep) {
          oldStep.style.transition = `transform 280ms ${ease}, opacity 220ms ease`;
          oldStep.style.transform  = `translateX(${targetOldX}px)`;
          oldStep.style.opacity    = '0';
        }
        if (peekStep) {
          peekStep.style.transition = `transform 280ms ${ease}, opacity 220ms ease`;
          peekStep.style.transform  = 'translateX(0px)';
          peekStep.style.opacity    = '1';
        }
        const fromStep = currentStep();
        const toStep   = dir === 'forward' ? fromStep + 1 : fromStep - 1;
        setTimeout(() => {
          // Run the appropriate Continue/Back handler — that performs
          // validation AND triggers any post-step setup (sig pads etc).
          // Tell setStep to skip its animation since our drag already
          // moved the elements to the final position.
          const before = currentStep();
          _skipNextAnim = true;
          if (dir === 'forward') {
            const handler = ({1:'#step1Next',2:'#step2Next',3:'#step3Next'})[fromStep];
            if (handler) document.querySelector(handler).click();
          } else {
            const back = document.querySelector('button[data-prev="' + fromStep + '"]');
            if (back) back.click();
          }
          _skipNextAnim = false;
          const after = currentStep();
          if (after === before) {
            // Validation FAILED. Bring the form back so the user can fix it.
            snapBack();
          } else {
            // Successfully advanced. setStep already toggled .hidden on
            // both elements via animate:false path. Just clear our
            // gesture flags — DON'T touch DOM (would re-hide the new step).
            pending = false; active = false;
            if (oldStep) oldStep.classList.remove('is-dragging');
            if (peekStep) peekStep.classList.remove('is-dragging-peek');
            oldStep = peekStep = null;
          }
        }, 290);
      }

      function snapBack() {
        const ease = 'cubic-bezier(0.22, 0.84, 0.34, 1.04)';
        if (oldStep) {
          oldStep.style.transition = `transform 220ms ${ease}, opacity 200ms ease`;
          oldStep.style.transform  = 'translateX(0px)';
          oldStep.style.opacity    = '1';
        }
        if (peekStep) {
          const w = stageWidth();
          peekStep.style.transition = `transform 220ms ${ease}, opacity 180ms ease`;
          peekStep.style.transform  = `translateX(${dx < 0 ? w : -w}px)`;
          peekStep.style.opacity    = '0';
        }
        setTimeout(reset, 240);
      }

      // Pointer handlers ---------------------------------------------
      function onStart(e) {
        if (_animating) return;
        if (isProtected(e.target)) return;          // sigpad / roster
        const t = pointer(e);
        sx = t.clientX; sy = t.clientY; st = Date.now(); dx = 0;
        pending = true; active = false;
        oldStep = document.querySelector('.step:not(.hidden):not(.is-leaving)');
      }

      function onMove(e) {
        if (!pending && !active) return;
        const t = pointer(e);
        dx = t.clientX - sx;
        const dy = t.clientY - sy;

        if (!active) {
          // Still deciding whether this is a swipe or a tap/scroll
          if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
          if (Math.abs(dy) > Math.abs(dx)) { pending = false; return; } // vertical scroll
          // Horizontal! Claim the gesture.
          active = true; pending = false;
          // If a form field had focus, blur it so we don't trap text input
          if (document.activeElement && document.activeElement !== document.body) {
            try { document.activeElement.blur(); } catch (_) {}
          }
          oldStep.classList.add('is-dragging');
        }

        direction = dx < 0 ? 'forward' : 'backward';
        setPeek(direction);
        oldStep.style.transform = `translateX(${dx}px)`;
        if (peekStep) {
          const w = stageWidth();
          peekStep.style.transform = `translateX(${direction === 'forward' ? w + dx : -w + dx}px)`;
        }
        if (e.cancelable) e.preventDefault();
      }

      function onEnd() {
        if (!active) { reset(); return; }
        const w = stageWidth();
        const fast = (Date.now() - st) < COMMIT_VEL_MS && Math.abs(dx) > COMMIT_VEL_DX;
        const far  = Math.abs(dx) > w * COMMIT_FRAC;
        const shouldCommit = (fast || far) && peekStep;
        if (shouldCommit) commitTo(direction);
        else              snapBack();
      }

      // Wire up — touch + mouse, listeners on document so a drag that
      // wanders outside the stage element still completes.
      document.addEventListener('touchstart',  onStart, { passive: true });
      document.addEventListener('touchmove',   onMove,  { passive: false });
      document.addEventListener('touchend',    onEnd,   { passive: true });
      document.addEventListener('touchcancel', onEnd,   { passive: true });
      document.addEventListener('mousedown',   onStart);
      document.addEventListener('mousemove',   onMove);
      document.addEventListener('mouseup',     onEnd);
    })();

    setStep(1, { animate: false });
  }

  // -------------- kick off ---------------------------------
  start();

})();
