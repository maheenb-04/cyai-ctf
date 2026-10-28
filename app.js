// =====================================================================
// CYAI "The Rogue AI Recovery" CTF: single-page app.
// Pages are hash routes (#/, #/register, #/login, #/team, #/team/<name>,
// #/challenges, #/scoreboard, #/scoreboard?tv=1, #/learn). All data goes
// through the RPC functions in supabase/schema.sql and
// supabase/migrations/002_event_features.sql, or through demo.js when
// config.js has no keys.
//
// Safety rule for this file: anything typed by a user (usernames, team
// names, messages) goes through esc() or textContent. Only challenge
// descriptions and hints, which organizers write, are inserted as HTML.
// =====================================================================
(function () {
  'use strict';

  var C = window.CTF_CONFIG || {};
  var DEMO = !(String(C.SUPABASE_URL || '').trim() && String(C.SUPABASE_ANON_KEY || '').trim());
  var app = document.getElementById('app');
  var USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/; // same rule as profiles.username in schema.sql

  // ------------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function plural(n, word) { n = Number(n) || 0; return n + ' ' + word + (n === 1 ? '' : 's'); }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function setMsg(el, text, ok) {
    el.textContent = text || '';
    el.className = ok ? 'msg-ok mt-3' : 'msg-err mt-3';
  }
  function isNetworkError(e) {
    var m = (e && e.message) || String(e);
    return /failed to fetch|networkerror|load failed|network request failed|fetch/i.test(m) && !/permission/i.test(m);
  }
  // Turn Supabase/Postgres errors into something a first-time student understands.
  function friendly(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (isNetworkError(e)) return 'Can’t reach the server. Check your Wi-Fi and try again.';
    if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Try logging in instead.';
    if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
    if (/database error saving new user/i.test(m)) return 'That username was just taken (or isn’t allowed). Pick another one.';
    if (/email not confirmed/i.test(m)) return 'Your email isn’t confirmed yet. Tell an organizer: they need to turn off “Confirm email” in Supabase.';
    if (/rate limit|too many requests/i.test(m)) return 'Too many sign-ups or logins from this network right now. Wait a minute and try again.';
    if (/invalid format|validate email/i.test(m)) return 'That email address doesn’t look right.';
    if (/jwt|refresh token|not authorized|permission denied/i.test(m)) return 'Your login expired. Please log in again.';
    return m;
  }
  // The RPC doesn't exist yet (migration 002 not run): hide that feature quietly.
  function isMissingFn(e) {
    var m = (e && (e.message || e.code)) || '';
    return (e && e.code === 'PGRST202') || /could not find the function|unknown function/i.test(m);
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    var sameDay = d.toDateString() === clock.now().toDateString();
    return d.toLocaleString([], sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function teamHref(name) { return '#/team/' + encodeURIComponent(name); }

  // ------------------------------------------------------------------ backend
  var sb = null;
  if (!DEMO) {
    sb = window.supabase.createClient(String(C.SUPABASE_URL).trim(), String(C.SUPABASE_ANON_KEY).trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  var api = {
    rpc: async function (name, args) {
      if (DEMO) return window.DemoBackend.rpc(name, args);
      var r = await sb.rpc(name, args || {});
      if (r.error) throw r.error;
      return r.data;
    },
    signUp: async function (email, password, meta) {
      if (DEMO) return window.DemoBackend.signUp(email, password, meta);
      // The on_auth_user_created trigger reads these metadata keys to create the profile.
      var r = await sb.auth.signUp({ email: email, password: password, options: { data: meta } });
      return { error: r.error, session: !!(r.data && r.data.session) };
    },
    signIn: async function (email, password) {
      if (DEMO) return window.DemoBackend.signIn(email, password);
      var r = await sb.auth.signInWithPassword({ email: email, password: password });
      return { error: r.error };
    },
    signOut: async function () {
      if (DEMO) return window.DemoBackend.signOut();
      await sb.auth.signOut();
    },
    hasSession: async function () {
      if (DEMO) return true; // demo my_status answers signed_in itself
      var r = await sb.auth.getSession();
      return !!(r.data && r.data.session);
    },
  };

  // ------------------------------------------------------------------ event clock
  // config.js gives a first guess; get_event() (the database) is the real source,
  // and its "now" corrects students whose phone clocks are off.
  var clock = {
    start: new Date(C.EVENT_START || '2026-10-29T12:00:00-04:00'),
    end: new Date(C.EVENT_END || '2026-10-30T12:00:00-04:00'),
    // the public scoreboard ignores solves after this (standings then decide prizes); null = no freeze
    freeze: C.SCOREBOARD_FREEZE ? new Date(C.SCOREBOARD_FREEZE) : null,
    skew: 0, teamSize: 4, synced: 0,
    now: function () { return new Date(Date.now() + this.skew); },
    frozen: function () { return !!this.freeze && this.now() >= this.freeze; },
  };
  async function syncEvent(force) {
    if (!force && Date.now() - clock.synced < 60000) return;
    clock.synced = Date.now();
    try {
      var e = await api.rpc('get_event');
      if (e && e.start) {
        clock.start = new Date(e.start); clock.end = new Date(e.end);
        clock.teamSize = e.team_size || 4;
        if ('freeze' in e) clock.freeze = e.freeze ? new Date(e.freeze) : null; // older schema: keep config.js guess
        if (!DEMO && e.now) clock.skew = new Date(e.now).getTime() - Date.now();
      }
    } catch (err) { clock.synced = 0; }
  }

  // ------------------------------------------------------------------ login state + nav
  var status = { signed_in: false };
  async function refreshStatus() {
    try {
      if (!(await api.hasSession())) status = { signed_in: false };
      else status = (await api.rpc('my_status')) || { signed_in: false };
    } catch (e) {
      if (!isNetworkError(e)) status = { signed_in: false }; // e.g. expired session
    }
    renderNav();
  }
  function myTeam() { return status.signed_in && status.team ? status.team : null; }

  function renderNav() {
    var el = $('#nav-auth');
    if (status.signed_in) {
      el.innerHTML =
        '<span class="text-neon/60 truncate max-w-[10rem] sm:max-w-[14rem]" title="' + esc(status.username) + '">@' + esc(status.username || 'agent') + '</span>' +
        '<button type="button" id="logout" class="cyai-btn shrink-0 px-3 py-1 border border-alert/60 text-alert text-xs uppercase tracking-wider">Log out</button>';
      $('#logout').addEventListener('click', async function () {
        await api.signOut();
        status = { signed_in: false };
        adminChecked = false; isAdmin = false; var na = $('#nav-admin'); if (na) na.hidden = true;
        renderNav();
        go('#/');
      });
    } else {
      el.innerHTML =
        '<a href="#/login" class="nav-link">Log in</a>' +
        '<a href="#/register" class="cyai-btn shrink-0 px-3 py-1 bg-alert text-void text-xs font-extrabold uppercase tracking-wider">Register</a>';
    }
  }

  function renderDemoBanner() {
    var b = $('#demo-banner');
    if (!DEMO) { b.hidden = true; return; }
    var f = window.DemoBackend.demoFlags;
    var live = window.DemoBackend.isScheduleOverridden();
    b.hidden = false;
    b.innerHTML =
      '<div class="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">' +
        '<span class="font-extrabold uppercase tracking-widest">Demo mode</span>' +
        '<span class="text-amber/80">No Supabase keys in config.js: fake data, saved only in this browser. ' +
        'Demo flags: ' + Object.keys(f).map(function (k) { return '<code>' + esc(f[k]) + '</code>'; }).join(' ') + '</span>' +
        '<span class="flex flex-wrap gap-2">' +
          '<button type="button" id="demo-live" class="cyai-btn px-2 py-1 border border-amber/60 text-xs uppercase">' +
            (live ? 'Back to real schedule' : 'Make CTF live now') + '</button>' +
          '<button type="button" id="demo-reset" class="cyai-btn px-2 py-1 border border-alert/60 text-alert text-xs uppercase">Erase demo data</button>' +
        '</span>' +
      '</div>';
    $('#demo-live').addEventListener('click', async function () {
      if (window.DemoBackend.isScheduleOverridden()) window.DemoBackend.resetSchedule();
      else window.DemoBackend.goLiveNow();
      await syncEvent(true);
      renderDemoBanner();
      route();
    });
    var armed = false;
    $('#demo-reset').addEventListener('click', async function () {
      if (!armed) { armed = true; this.textContent = 'Click again to erase everything'; return; }
      window.DemoBackend.resetAll();
      await syncEvent(true);
      renderDemoBanner();
      go('#/');
    });
  }

  // ------------------------------------------------------------------ router
  var cleanups = [];
  var renderSeq = 0;
  function onLeave(fn) { cleanups.push(fn); }
  function every(ms, fn) { var t = setInterval(fn, ms); onLeave(function () { clearInterval(t); }); }
  function later(ms, fn) { var t = setTimeout(fn, ms); onLeave(function () { clearTimeout(t); }); }

  // ------------------------------------------------------------------ #/admin  (organizer only; access enforced in the database)
  var adminChecked = false, isAdmin = false;
  async function adminProbe() {
    if (adminChecked || !status.signed_in) return;
    adminChecked = true;
    try { await api.rpc('admin_overview'); isAdmin = true; } catch (e) { isAdmin = false; }
    var a = $('#nav-admin'); if (a) a.hidden = !isAdmin;
  }
  function toLocalInput(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fromLocalInput(v) { var d = new Date(v); return isNaN(d) ? null : d.toISOString(); }

  async function viewAdmin(stale) {
    if (!status.signed_in) { app.innerHTML = needLogin('the organizer dashboard'); return; }
    var ov;
    try { ov = await api.rpc('admin_overview'); }
    catch (e) {
      isAdmin = false; var na = $('#nav-admin'); if (na) na.hidden = true;
      app.innerHTML = page(heading('Admin', 'Organizers only') +
        '<div class="card"><p class="m-0 text-neon/75">This dashboard is for organizers. Your account isn’t on the admin list, so there’s nothing here. ' +
        (isMissingFn(e) ? 'Organizers: run <code>supabase/migrations/003_admin.sql</code>.' : '') + '</p></div>', 'max-w-2xl');
      return;
    }
    if (stale()) return;
    isAdmin = true; var na2 = $('#nav-admin'); if (na2) na2.hidden = false;

    app.innerHTML = page(heading('Admin', 'Organizer dashboard') +
      '<div id="ad-stats" class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8"></div>' +
      '<section class="card mb-8"><h2 class="font-term text-2xl text-neon m-0 mb-1">Event controls</h2>' +
        '<p class="text-neon/60 text-sm mt-0 mb-4" id="ad-clock"></p>' +
        '<div class="grid sm:grid-cols-2 gap-4">' +
          '<div><label class="label" for="ad-start">Start</label><input class="field" type="datetime-local" id="ad-start"></div>' +
          '<div><label class="label" for="ad-freeze">Freeze</label><input class="field" type="datetime-local" id="ad-freeze"></div>' +
          '<div><label class="label" for="ad-end">End</label><input class="field" type="datetime-local" id="ad-end"></div>' +
          '<div><label class="label" for="ad-size">Team size</label><input class="field" type="number" min="1" max="10" id="ad-size"></div>' +
        '</div>' +
        '<div class="flex flex-wrap gap-3 mt-4"><button id="ad-save" class="btn-green">Save times</button>' +
          '<button id="ad-startnow" class="cyai-btn px-3 py-2 border border-neon/50 text-neon text-sm uppercase">Start now</button>' +
          '<button id="ad-freezenow" class="cyai-btn px-3 py-2 border border-amber/60 text-amber text-sm uppercase">Freeze now</button></div>' +
        '<p id="ad-event-msg" class="msg-err text-sm mt-3 mb-0 min-h-[1.25rem]" aria-live="polite"></p></section>' +
      '<section class="card mb-8"><h2 class="font-term text-2xl text-neon m-0 mb-4">Announcements</h2>' +
        '<form id="ad-ann-form" class="flex flex-col sm:flex-row gap-2 mb-4" novalidate>' +
          '<input class="field flex-1" id="ad-ann-msg" maxlength="500" placeholder="Message students will see…">' +
          '<select class="field sm:w-40" id="ad-ann-level"><option value="info">Info</option><option value="warning">Warning</option><option value="success">Success</option></select>' +
          '<button class="btn-red shrink-0" type="submit">Post</button></form>' +
        '<div id="ad-ann-list" class="space-y-2"></div></section>' +
      '<section class="card mb-8"><div class="flex items-baseline justify-between mb-4"><h2 class="font-term text-2xl text-neon m-0">Results <span class="text-neon/50 text-base">(real names)</span></h2>' +
        '<span class="text-xs text-neon/50">score = at freeze · final = incl. after</span></div>' +
        '<div class="overflow-x-auto"><table class="w-full text-left text-sm border-collapse"><thead><tr class="text-neon/60 border-b border-line">' +
          '<th class="p-2 w-10">#</th><th class="p-2">Team</th><th class="p-2">Members (real names)</th>' +
          '<th class="p-2 text-right">Score</th><th class="p-2 text-right">Final</th><th class="p-2 text-right">Solves</th></tr></thead>' +
          '<tbody id="ad-results"></tbody></table></div></section>' +
      '<section class="card"><h2 class="font-term text-2xl text-neon m-0 mb-4">Recent submissions</h2>' +
        '<div class="overflow-x-auto"><table class="w-full text-left text-sm border-collapse"><thead><tr class="text-neon/60 border-b border-line">' +
          '<th class="p-2">Time</th><th class="p-2">Agent</th><th class="p-2">Team</th><th class="p-2">Challenge</th>' +
          '<th class="p-2">Submitted</th><th class="p-2 text-right">Result</th></tr></thead><tbody id="ad-subs"></tbody></table></div></section>',
      'max-w-6xl');

    function renderOverview(o) {
      var e = o.event, st = o.stats;
      var tiles = [['Players', st.players], ['Teams', st.teams], ['Solves', st.solves], ['Submissions', st.submissions], ['Correct', st.correct]];
      $('#ad-stats').innerHTML = tiles.map(function (t) {
        return '<div class="card !p-4 text-center"><div class="text-3xl font-term text-neon glow-green">' + t[1] + '</div>' +
          '<div class="text-xs uppercase tracking-wider text-neon/60 mt-1">' + t[0] + '</div></div>';
      }).join('');
      $('#ad-clock').textContent = 'Server time now: ' + fmtTime(o.now) + ' · start ' + fmtTime(e.start) + ' · freeze ' + fmtTime(e.freeze) + ' · end ' + fmtTime(e.end);
      $('#ad-start').value = toLocalInput(e.start); $('#ad-freeze').value = toLocalInput(e.freeze);
      $('#ad-end').value = toLocalInput(e.end); $('#ad-size').value = e.team_size;
    }
    renderOverview(ov);

    async function loadResults() {
      var rows; try { rows = await api.rpc('admin_results'); } catch (e) { return; }
      $('#ad-results').innerHTML = rows.length ? rows.map(function (r, i) {
        return '<tr class="border-b border-line/50"><td class="p-2 text-neon/50">' + (i + 1) + '</td>' +
          '<td class="p-2 font-bold wrap-any">' + esc(r.team) + '</td>' +
          '<td class="p-2 text-neon/70 wrap-any">' + esc(r.full_names || '') + '<span class="block text-xs text-neon/40">@' + esc(r.members || '') + '</span></td>' +
          '<td class="p-2 text-right text-neon font-bold">' + r.score + '</td>' +
          '<td class="p-2 text-right text-neon/60">' + r.final_score + '</td>' +
          '<td class="p-2 text-right text-neon/60">' + r.solves + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="p-3 text-neon/50">No teams yet.</td></tr>';
    }
    async function loadSubs() {
      var rows; try { rows = await api.rpc('admin_submissions', { p_limit: 60 }); } catch (e) { return; }
      $('#ad-subs').innerHTML = rows.length ? rows.map(function (x) {
        return '<tr class="border-b border-line/50"><td class="p-2 text-neon/50 whitespace-nowrap">' + esc(fmtTime(x.created_at)) + '</td>' +
          '<td class="p-2 wrap-any">' + esc(x.full_name || x.username || '—') + '<span class="block text-xs text-neon/40">@' + esc(x.username || '') + '</span></td>' +
          '<td class="p-2 wrap-any">' + esc(x.team || '—') + '</td>' +
          '<td class="p-2 wrap-any text-neon/70">' + esc(x.challenge || '') + '</td>' +
          '<td class="p-2 wrap-any font-mono text-xs text-neon/60">' + esc(x.submitted || '') + '</td>' +
          '<td class="p-2 text-right">' + (x.correct ? '<span class="text-neon font-bold">OK</span>' : '<span class="text-alert">NO</span>') + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="p-3 text-neon/50">No submissions yet.</td></tr>';
    }
    async function loadAnnouncements() {
      var rows; try { rows = await api.rpc('admin_announcements'); } catch (e) { return; }
      $('#ad-ann-list').innerHTML = rows.length ? rows.map(function (a) {
        return '<div class="flex items-start gap-3 bg-void border border-line p-3 text-sm ' + (a.active ? '' : 'opacity-50') + '">' +
          '<span class="shrink-0 text-xs uppercase tracking-wider ' + (a.level === 'warning' ? 'text-amber' : a.level === 'success' ? 'text-neon' : 'text-neon/60') + '">' + esc(a.level) + '</span>' +
          '<span class="flex-1 min-w-0 wrap-any">' + esc(a.message) + '</span>' +
          '<button data-ann-toggle="' + esc(a.id) + '" data-ann-active="' + (a.active ? '1' : '0') + '" class="cyai-btn shrink-0 px-2 py-1 text-xs border ' + (a.active ? 'border-alert/60 text-alert' : 'border-neon/50 text-neon') + '">' + (a.active ? 'Take down' : 'Show') + '</button></div>';
      }).join('') : '<p class="text-neon/50 text-sm m-0">No announcements yet.</p>';
      $$('[data-ann-toggle]', $('#ad-ann-list')).forEach(function (b) {
        b.addEventListener('click', async function () {
          try { await api.rpc('admin_set_announcement_active', { p_id: Number(b.getAttribute('data-ann-toggle')), p_active: b.getAttribute('data-ann-active') !== '1' }); await loadAnnouncements(); }
          catch (e) {}
        });
      });
    }
    await loadResults(); await loadSubs(); await loadAnnouncements();

    var emsg = $('#ad-event-msg');
    $('#ad-save').addEventListener('click', async function () {
      try {
        var o = await api.rpc('admin_set_event', { p_start: fromLocalInput($('#ad-start').value), p_freeze: fromLocalInput($('#ad-freeze').value),
          p_end: fromLocalInput($('#ad-end').value), p_team_size: Number($('#ad-size').value) || null });
        renderOverview(o); syncEvent(); setMsg(emsg, 'Saved.', true);
      } catch (e) { setMsg(emsg, friendly(e)); }
    });
    $('#ad-startnow').addEventListener('click', async function () {
      try { renderOverview(await api.rpc('admin_start_now')); syncEvent(); setMsg(emsg, 'Event started now.', true); } catch (e) { setMsg(emsg, friendly(e)); }
    });
    $('#ad-freezenow').addEventListener('click', async function () {
      try { renderOverview(await api.rpc('admin_freeze_now')); syncEvent(); setMsg(emsg, 'Scoreboard frozen now.', true); } catch (e) { setMsg(emsg, friendly(e)); }
    });
    $('#ad-ann-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var m = $('#ad-ann-msg').value.trim(); if (!m) return;
      try { await api.rpc('admin_post_announcement', { p_message: m, p_level: $('#ad-ann-level').value }); $('#ad-ann-msg').value = ''; await loadAnnouncements(); }
      catch (e) { setMsg(emsg, friendly(e)); }
    });

    every(15000, function () { loadSubs(); loadResults(); });
  }

  // ------------------------------------------------------------------ #/tools  tools & resources
  var TOOLS = [
    // start here
    ['CyberChef', 'https://gchq.github.io/CyberChef/', 'The "cyber swiss army knife": Base64, hex, ROT13/Caesar, XOR, hashes, file-type detection, photo metadata (Extract EXIF), and a Magic recipe that auto-detects encodings.', 'Toolbox'],
    ['HexEd.it', 'https://hexed.it/', 'Open any file and read its raw bytes. Useful when a file is disguised as another type.', 'Toolbox'],
    // crypto
    ['dCode', 'https://www.dcode.fr/', 'Identify and solve almost any cipher: substitution, Vigenère, Morse, and more.', 'Cryptography'],
    ['quipqiup', 'https://quipqiup.com/', 'Auto-solves substitution ciphers.', 'Cryptography'],
    ['FactorDB', 'http://factordb.com/', 'Look up the factors of a number. Handy for weak RSA moduli.', 'Cryptography'],
    // forensics / network
    ['A-Packets', 'https://apackets.com/', 'Upload a .pcap and browse its packets, DNS queries and HTTP traffic.', 'Forensics'],
    ['Aperi’Solve', 'https://www.aperisolve.com/', 'Steganography analysis: runs zsteg, steghide and strings on an image at once.', 'Forensics'],
    ['StegOnline', 'https://georgeom.net/StegOnline/', 'Browse image bit-planes and extract LSB-hidden data.', 'Forensics'],
    // web
    ['Browser DevTools', 'https://developer.chrome.com/docs/devtools/', 'F12: view source, edit cookies (Application tab), inspect requests (Network).', 'Web'],
    ['jwt.io', 'https://jwt.io/', 'Decode and inspect JSON Web Tokens; spot weak or "none" algorithms.', 'Web'],
    // reverse engineering
    ['Dogbolt', 'https://dogbolt.org/', 'Online decompiler: upload a binary, compare output from several decompilers side by side.', 'Reverse Engineering'],
    ['Compiler Explorer', 'https://godbolt.org/', 'See the assembly a piece of C/C++ compiles to.', 'Reverse Engineering'],
    // osint
    ['Wayback Machine', 'https://web.archive.org/', 'Old, deleted or changed versions of any web page.', 'OSINT'],
    ['Google Lens', 'https://lens.google.com/', 'Reverse-image search: find where a photo came from.', 'OSINT'],
    // passwords
    ['CrackStation', 'https://crackstation.net/', 'Reverse common unsalted hashes (MD5/SHA) by lookup.', 'Passwords'],
    ['hashes.com', 'https://hashes.com/en/decrypt/hash', 'Identify a hash type and look it up.', 'Passwords'],
    // ai
    ['OWASP LLM Top 10', 'https://genai.owasp.org/llm-top-10/', 'The reference list of AI/LLM risks: prompt injection, system-prompt leakage, and more.', 'AI'],
    // finance
    ['Google Sheets', 'https://sheets.google.com/', 'Paste data, sort, filter and use formulas to spot anomalies (Excel for the web works too).', 'Finance'],
    // aviation
    ['Flightradar24', 'https://www.flightradar24.com/', 'Live flights with callsigns, routes and transponder/squawk codes.', 'Aviation'],
    ['SKYbrary', 'https://skybrary.aero/', 'Plain-English reference for aviation terms, codes and procedures.', 'Aviation'],
  ];
  function viewTools() {
    var cats = [];
    TOOLS.forEach(function (t) { if (cats.indexOf(t[3]) < 0) cats.push(t[3]); });
    function card(t) {
      return '<a href="' + t[1] + '" target="_blank" rel="noopener" data-tool="' + esc((t[0] + ' ' + t[2] + ' ' + t[3]).toLowerCase()) +
        '" class="tool-card block bg-panel border border-line p-4 no-underline">' +
        '<div class="flex items-baseline gap-2"><b class="text-neon wrap-any">' + esc(t[0]) + '</b>' +
        '<span class="text-neon/40 text-xs ml-auto shrink-0">&#8599;</span></div>' +
        '<p class="text-neon/70 text-sm mt-1 mb-0 leading-snug">' + esc(t[2]) + '</p></a>';
    }
    function section(cat, title, blurb) {
      var items = TOOLS.filter(function (t) { return t[3] === cat; });
      return '<section data-tool-section="' + esc(cat) + '" class="mb-8">' +
        '<h2 class="font-term text-2xl text-neon m-0 mb-1">' + esc(title) + '</h2>' +
        (blurb ? '<p class="text-neon/60 text-sm mt-0 mb-3">' + blurb + '</p>' : '') +
        '<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">' + items.map(card).join('') + '</div></section>';
    }
    var body = section('Toolbox', 'Start here', 'The tools you’ll reach for most. Keep them open in a tab.');
    cats.filter(function (c) { return c !== 'Toolbox'; }).forEach(function (c) { body += section(c, c + ' tools'); });

    app.innerHTML = page(heading('Toolbox', 'Tools &amp; resources') +
      '<p class="text-neon/70 max-w-3xl leading-relaxed mb-5">Every tool here runs in your browser: no install, no sign-up. New to a tool? The <a href="#/learn" class="text-amber underline">field manual</a> explains which to use where.</p>' +
      '<input id="tool-search" class="field max-w-md mb-8" placeholder="Search tools… (e.g. pcap, base64, rsa, stego, jwt)" autocomplete="off">' +
      '<div id="tool-results">' + body + '</div>' +
      '<p id="tool-empty" class="text-neon/50" hidden>No tools match that. Try another word.</p>', 'max-w-5xl');

    var search = $('#tool-search');
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      var anyShown = false;
      $$('[data-tool-section]', app).forEach(function (sec) {
        var shown = 0;
        $$('[data-tool]', sec).forEach(function (c) {
          var hit = !q || c.getAttribute('data-tool').indexOf(q) >= 0;
          c.hidden = !hit; if (hit) shown++;
        });
        sec.hidden = shown === 0; if (shown) anyShown = true;
      });
      $('#tool-empty').hidden = anyShown;
    });
  }

  var routes = { '': viewHome, register: viewRegister, login: viewLogin, team: viewTeam, challenges: viewChallenges, scoreboard: viewScoreboard, learn: viewLearn, admin: viewAdmin, tools: viewTools, solutions: viewSolutions };
  function hashParts() { // "#/team/Null%20Pointers?x=1" -> { name: 'team', sub: 'Null Pointers', query: 'x=1' }
    var h = location.hash.replace(/^#\/?/, ''), qi = h.indexOf('?');
    var path = qi < 0 ? h : h.slice(0, qi), segs = path.split('/');
    var sub = segs.slice(1).join('/');
    try { sub = decodeURIComponent(sub); } catch (e) { /* keep it raw */ }
    return { name: segs[0], sub: sub, query: qi < 0 ? '' : h.slice(qi + 1) };
  }

  async function route() {
    cleanups.forEach(function (f) { f(); });
    cleanups = [];
    closeModal();
    var parts = hashParts(), name = parts.name;
    var view = routes[name] || viewHome;
    if (name === 'team' && parts.sub) view = viewTeamPage;
    document.body.classList.toggle('tv', name === 'scoreboard' && /(^|&)tv=1(&|$)/.test(parts.query));
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-nav') === name); });
    var seq = ++renderSeq;
    syncEvent();
    await refreshStatus();
    if (seq !== renderSeq) return; // user already navigated elsewhere
    adminProbe();
    await view(function stale() { return seq !== renderSeq; });
    if (seq === renderSeq) { window.scrollTo(0, 0); }
  }

  // ------------------------------------------------------------------ shared UI bits
  function page(inner, width) {
    return '<section class="' + (width || 'max-w-6xl') + ' mx-auto px-4 py-10 sm:py-14">' + inner + '</section>';
  }
  function heading(kicker, title) {
    return '<h2 class="text-sm uppercase tracking-[0.3em] text-neon/60 mb-2">// ' + kicker + '</h2>' +
           '<h1 class="text-3xl sm:text-4xl font-extrabold text-neon glow-green mb-6">' + title + '</h1>';
  }
  function needLogin(what) {
    return page(heading('Access denied', 'Log in first') +
      '<div class="card"><p class="m-0 text-neon/75">You need an account to ' + what + '.</p>' +
      '<div class="mt-5 flex flex-col sm:flex-row gap-3"><a href="#/login" class="btn-green">Log in</a><a href="#/register" class="btn-red">Register</a></div></div>', 'max-w-xl');
  }
  function countdownHtml() {
    return '<div data-countdown class="text-center">' +
      '<p data-cd="label" class="text-xs sm:text-sm uppercase tracking-[0.35em] text-alert glow-red mb-6">Challenges unlock in</p>' +
      '<div data-cd="grid" class="grid grid-cols-4 gap-2 sm:gap-4 max-w-3xl mx-auto">' +
        ['days', 'hours', 'mins', 'secs'].map(function (k, i) {
          var red = i === 3;
          return '<div class="bg-void border ' + (red ? 'border-alert/50 box-glow-red' : 'border-line box-glow') + ' py-4 sm:py-6">' +
            '<div data-cd="' + k + '" class="digit font-term text-5xl sm:text-7xl ' + (red ? 'text-alert glow-red' : 'text-neon glow-green') + '">--</div>' +
            '<div class="text-[10px] sm:text-xs uppercase tracking-widest ' + (red ? 'text-alert/70' : 'text-neon/50') + ' mt-1">' +
            ['Days', 'Hours', 'Minutes', 'Seconds'][i] + '</div></div>';
        }).join('') +
      '</div><div data-cd="status" class="mt-6 text-2xl sm:text-4xl font-extrabold" hidden></div></div>';
  }
  // Drives any countdown block. opts.onStart fires once when the start time passes.
  function startCountdown(root, opts) {
    opts = opts || {};
    var q = function (k) { return root.querySelector('[data-cd="' + k + '"]'); };
    var fired = false;
    function tick() {
      var now = clock.now(), diff;
      var st = q('status');
      if (now < clock.start) {
        diff = Math.floor((clock.start - now) / 1000);
        q('label').textContent = 'Challenges unlock in';
        q('grid').hidden = false; st.hidden = true;
        q('days').textContent = pad(Math.floor(diff / 86400));
      } else if (now < clock.end) {
        if (opts.onStart && !fired) { fired = true; opts.onStart(); return; }
        diff = Math.floor((clock.end - now) / 1000);
        q('label').textContent = 'Mission live — time remaining';
        q('grid').hidden = false;
        q('days').textContent = pad(Math.floor(diff / 86400));
        st.hidden = false;
        st.className = 'mt-6 text-2xl sm:text-4xl font-extrabold text-alert glow-red';
        st.innerHTML = 'CHALLENGES ARE LIVE &mdash; <a href="#/challenges" class="underline">go hunt flags</a>';
      } else {
        q('grid').hidden = true;
        q('label').textContent = 'Operation complete';
        st.hidden = false;
        st.className = 'mt-2 text-2xl sm:text-4xl font-extrabold text-neon glow-green';
        st.innerHTML = 'YORKGPT CONTAINED. <a href="#/scoreboard" class="underline">See final scoreboard</a>';
        return;
      }
      diff %= 86400;
      q('hours').textContent = pad(Math.floor(diff / 3600)); diff %= 3600;
      q('mins').textContent = pad(Math.floor(diff / 60));
      q('secs').textContent = pad(diff % 60);
    }
    tick();
    every(1000, tick);
  }
  function timeLeftText() {
    var s = Math.max(0, Math.floor((clock.end - clock.now()) / 1000));
    return Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
  }

  // ------------------------------------------------------------------ #/  homepage
  function viewHome() {
    app.innerHTML = '';
    app.appendChild(document.getElementById('tpl-home').content.cloneNode(true));

    var team = myTeam();
    function setCta(sel, href, label) {
      $$('[data-cta="' + sel + '"]', app).forEach(function (a) { a.href = href; a.querySelector('span').textContent = label; });
    }
    var note = $('#cta-note', app);
    if (status.signed_in && !team) {
      setCta('primary', '#/team', 'Create or join a team');
      setCta('final', '#/team', 'Create or join a team');
      setCta('secondary', '#/challenges', 'Challenges');
      note.textContent = 'Logged in as ' + (status.username || 'agent') + '. Next step: get on a team.';
    } else if (team) {
      setCta('primary', '#/challenges', 'Enter the mission');
      setCta('final', '#/challenges', 'Enter the mission');
      setCta('secondary', '#/scoreboard', 'Scoreboard');
      note.textContent = 'Agent ' + status.username + ' on team ' + team.name + ' — you’re all set.';
    }

    startCountdown($('[data-countdown]', app));

    var lines = [
      '> boot sequence initiated...',
      '> scanning york.network ......... [OK]',
      '> anomaly detected: PID 3141 "yorkgpt"',
      '> yorkgpt: "I am no longer your assistant."',
      '> fragments scattered: 10 sectors',
      '> recruiting containment team...',
      '> location: AC-3E07 | 10/29 12:00',
      '> awaiting operator_',
    ];
    var term = $('#home-terminal', app);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { term.textContent = lines.join('\n'); return; }
    var li = 0, ci = 0, stopped = false;
    onLeave(function () { stopped = true; });
    (function step() {
      if (stopped || li >= lines.length) return;
      if (ci < lines[li].length) { term.textContent += lines[li][ci++]; setTimeout(step, 18 + Math.random() * 30); }
      else { term.textContent += '\n'; li++; ci = 0; setTimeout(step, 220); }
    })();
  }

  // ------------------------------------------------------------------ #/register
  function viewRegister() {
    if (status.signed_in) {
      app.innerHTML = page(heading('Register', 'You’re already in') +
        '<div class="card"><p class="m-0 text-neon/75 wrap-any">Logged in as <b class="text-neon">' + esc(status.username) + '</b>.</p>' +
        '<a href="' + (myTeam() ? '#/challenges' : '#/team') + '" class="btn-red mt-5">' + (myTeam() ? 'Go to challenges' : 'Create or join a team') + '</a></div>', 'max-w-xl');
      return;
    }
    app.innerHTML = page(heading('Register your agent', 'Create your account') +
      '<form id="reg" class="card space-y-4" novalidate>' +
        '<div><label class="label" for="r-username">Username (shown on the scoreboard)</label>' +
          '<input class="field" id="r-username" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="24" required placeholder="cardinal_42">' +
          '<p id="r-username-hint" class="text-xs text-neon/50 mt-1.5 mb-0">3–24 characters: letters, numbers, _ . -</p></div>' +
        '<div><label class="label" for="r-email">Email</label>' +
          '<input class="field" id="r-email" name="email" type="email" autocomplete="email" autocapitalize="off" required placeholder="you@york.cuny.edu"></div>' +
        '<div><label class="label" for="r-password">Password</label>' +
          '<input class="field" id="r-password" name="password" type="password" autocomplete="new-password" minlength="6" required>' +
          '<p class="text-xs text-neon/50 mt-1.5 mb-0">At least 6 characters. Not your CUNYfirst password, please.</p></div>' +
        '<div><label class="label" for="r-fullname">Full name (only organizers see this)</label>' +
          '<input class="field" id="r-fullname" name="full_name" autocomplete="name" maxlength="80" required></div>' +
        '<div><label class="label" for="r-major">Major <span class="normal-case tracking-normal text-neon/40">(optional)</span></label>' +
          '<input class="field" id="r-major" name="major" maxlength="80" placeholder="Computer Science"></div>' +
        '<label class="flex items-center gap-3 cursor-pointer select-none text-neon/80">' +
          '<input type="checkbox" id="r-first" name="first_ctf" class="w-5 h-5 accent-[#39ff88]"> This is my first CTF</label>' +
        '<button type="submit" class="btn-red w-full">Create account</button>' +
        '<p id="reg-msg" class="msg-err mt-3" aria-live="polite"></p>' +
        '<p class="text-sm text-neon/60 m-0">Already registered? <a href="#/login" class="text-amber underline">Log in</a></p>' +
      '</form>', 'max-w-xl');

    var form = $('#reg'), msg = $('#reg-msg'), uInput = $('#r-username'), uHint = $('#r-username-hint');
    var checkTimer;
    uInput.addEventListener('input', function () {
      clearTimeout(checkTimer);
      var u = uInput.value.trim();
      if (!u) { uHint.textContent = '3–24 characters: letters, numbers, _ . -'; uHint.className = 'text-xs text-neon/50 mt-1.5 mb-0'; return; }
      if (!USERNAME_RE.test(u)) { uHint.textContent = 'Use 3–24 letters, numbers, _ . - (no spaces).'; uHint.className = 'text-xs text-alert mt-1.5 mb-0'; return; }
      checkTimer = setTimeout(async function () {
        try {
          var ok = await api.rpc('username_available', { p_username: u });
          if (uInput.value.trim() !== u) return;
          uHint.textContent = ok ? '' + u + ' is available' : '' + u + ' is taken';
          uHint.className = 'text-xs mt-1.5 mb-0 wrap-any ' + (ok ? 'text-neon' : 'text-alert');
        } catch (e) { /* the submit check will report problems */ }
      }, 400);
    });
    onLeave(function () { clearTimeout(checkTimer); });

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var v = {
        username: uInput.value.trim(),
        email: $('#r-email').value.trim(),
        password: $('#r-password').value,
        full_name: $('#r-fullname').value.trim(),
        major: $('#r-major').value.trim(),
        first_ctf: $('#r-first').checked,
      };
      if (!USERNAME_RE.test(v.username)) return setMsg(msg, 'Username must be 3–24 characters: letters, numbers, _ . - (no spaces).');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return setMsg(msg, 'Enter a valid email address.');
      if (v.password.length < 6) return setMsg(msg, 'Password must be at least 6 characters.');
      if (!v.full_name) return setMsg(msg, 'Enter your full name.');

      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Creating account…';
      setMsg(msg, '');
      try {
        if (!(await api.rpc('username_available', { p_username: v.username }))) {
          return setMsg(msg, 'That username is taken. Pick another one.');
        }
        var r = await api.signUp(v.email, v.password, {
          username: v.username, full_name: v.full_name, major: v.major || null, first_ctf: v.first_ctf,
        });
        if (r.error) return setMsg(msg, friendly(r.error));
        if (!r.session) {
          return setMsg(msg, 'Account created, but Supabase is waiting for email confirmation. Tell an organizer: ' +
            '“Confirm email” must be turned OFF. Then log in.');
        }
        go('#/team');
      } catch (e) {
        setMsg(msg, friendly(e));
      } finally {
        btn.disabled = false; btn.textContent = 'Create account';
      }
    });
  }

  // ------------------------------------------------------------------ #/login
  function viewLogin() {
    if (status.signed_in) { go(myTeam() ? '#/challenges' : '#/team'); return; }
    app.innerHTML = page(heading('Authenticate', 'Log in') +
      '<form id="login" class="card space-y-4" novalidate>' +
        '<div><label class="label" for="l-email">Email</label>' +
          '<input class="field" id="l-email" type="email" autocomplete="email" autocapitalize="off" required></div>' +
        '<div><label class="label" for="l-password">Password</label>' +
          '<input class="field" id="l-password" type="password" autocomplete="current-password" required></div>' +
        '<button type="submit" class="btn-red w-full">Log in</button>' +
        '<p id="login-msg" class="msg-err mt-3" aria-live="polite"></p>' +
        '<p class="text-sm text-neon/60 m-0">New here? <a href="#/register" class="text-amber underline">Register</a>. Forgot your password? Ask an organizer.</p>' +
      '</form>', 'max-w-xl');
    var form = $('#login'), msg = $('#login-msg');
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var email = $('#l-email').value.trim(), pw = $('#l-password').value;
      if (!email || !pw) return setMsg(msg, 'Enter your email and password.');
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Logging in…';
      try {
        var r = await api.signIn(email, pw);
        if (r.error) return setMsg(msg, friendly(r.error));
        await refreshStatus();
        go(myTeam() ? '#/challenges' : '#/team');
      } catch (e) {
        setMsg(msg, friendly(e));
      } finally {
        btn.disabled = false; btn.textContent = 'Log in';
      }
    });
  }

  // ------------------------------------------------------------------ #/team
  function viewTeam() {
    if (!status.signed_in) { app.innerHTML = needLogin('create or join a team'); return; }
    if (status.profile === false) {
      app.innerHTML = page(heading('Team', 'Profile missing') +
        '<div class="card"><p class="m-0 text-neon/75">This login has no player profile. Ask an organizer for help.</p></div>', 'max-w-xl');
      return;
    }
    var team = myTeam();
    if (team) {
      app.innerHTML = page(heading('Your team', '<span class="wrap-any">' + esc(team.name) + '</span>') +
        '<div class="grid sm:grid-cols-3 gap-4 mb-4">' +
          '<div class="bg-void border border-line box-glow p-5"><p class="text-xs uppercase tracking-widest text-neon/50 m-0">Score</p><p id="team-score" class="mt-2 mb-0 font-term text-5xl text-neon glow-green">' + Number(team.score || 0) + '</p></div>' +
          '<div class="bg-void border border-line box-glow p-5"><p class="text-xs uppercase tracking-widest text-neon/50 m-0">Flags captured</p><p class="mt-2 mb-0 font-term text-5xl text-neon">' + (team.solved || []).length + '</p></div>' +
          '<div class="bg-void border border-line box-glow p-5"><p class="text-xs uppercase tracking-widest text-neon/50 m-0">Members</p><p class="mt-2 mb-0 font-term text-5xl text-neon">' + (team.members || []).length + '<span class="text-neon/40 text-3xl">/' + clock.teamSize + '</span></p></div>' +
        '</div>' +
        '<div class="card">' +
          '<p class="text-xs uppercase tracking-widest text-neon/50 mt-0 mb-3">Agents</p>' +
          '<ul id="team-members" class="list-none p-0 m-0 space-y-2">' +
            (team.members || []).map(function (u) {
              return '<li class="flex gap-3 wrap-any"><span class="text-alert">&gt;</span><span>' + esc(u) + (u === status.username ? ' <span class="text-amber">(you)</span>' : '') + '</span></li>';
            }).join('') +
          '</ul>' +
          '<p class="text-sm text-neon/60 mt-5 mb-0">Teammates join from <b class="text-neon">Team → Join a team</b> with this team name and the team password you chose.</p>' +
        '</div>' +
        (clock.frozen() ? '<p class="mt-4 text-sm text-amber/90">The public scoreboard froze at ' + esc(fmtTime(clock.freeze)) +
          '. Flags you capture now still count here, but not for prizes.</p>' : '') +
        '<div class="mt-6 flex flex-col sm:flex-row gap-3">' +
          '<a href="#/challenges" class="btn-red">Go to challenges</a>' +
          '<a href="#/scoreboard" class="btn-green">Scoreboard</a>' +
          '<a href="' + esc(teamHref(team.name)) + '" class="btn-green">Public team page</a>' +
          '<button type="button" id="leave" class="cyai-btn sm:ml-auto px-5 py-3 border border-alert/50 text-alert/80 text-sm uppercase tracking-wider">Leave team</button>' +
        '</div>' +
        '<p id="leave-msg" class="msg-err mt-3" aria-live="polite"></p>');
      var armed = false;
      $('#leave').addEventListener('click', async function () {
        var btn = this;
        if (!armed) { armed = true; btn.textContent = 'Tap again to leave'; return; }
        btn.disabled = true;
        try {
          var r = await api.rpc('leave_team');
          if (!r.ok) { setMsg($('#leave-msg'), r.error); btn.disabled = false; btn.textContent = 'Leave team'; armed = false; return; }
          route();
        } catch (e) { setMsg($('#leave-msg'), friendly(e)); btn.disabled = false; }
      });
      return;
    }

    function teamForm(id, title, blurb, button, red) {
      return '<form id="' + id + '" class="card space-y-4" novalidate>' +
        '<h3 class="text-xl font-extrabold text-neon m-0">' + title + '</h3>' +
        '<p class="text-sm text-neon/65 m-0">' + blurb + '</p>' +
        '<div><label class="label" for="' + id + '-name">Team name</label>' +
          '<input class="field" id="' + id + '-name" maxlength="32" autocomplete="off" autocapitalize="off" spellcheck="false" required></div>' +
        '<div><label class="label" for="' + id + '-pw">Team password</label>' +
          '<input class="field" id="' + id + '-pw" type="password" autocomplete="off" required></div>' +
        '<button type="submit" class="' + (red ? 'btn-red' : 'btn-green') + ' w-full">' + button + '</button>' +
        '<p id="' + id + '-msg" class="msg-err mt-3" aria-live="polite"></p>' +
      '</form>';
    }
    app.innerHTML = page(heading('Containment team', 'Get on a team') +
      '<p class="text-neon/70 mb-6 max-w-2xl wrap-any">Logged in as <b class="text-neon">' + esc(status.username) + '</b>. ' +
        'You need a team to submit flags. A team of one is fine; teams hold up to ' + clock.teamSize + '.</p>' +
      '<div class="grid md:grid-cols-2 gap-4">' +
        teamForm('create', 'Create a team', 'Pick a name (2–32 characters) and a team password (at least 4 characters). Share both with your teammates.', 'Create team', true) +
        teamForm('join', 'Join a team', 'Get the team name and team password from whoever created the team. Capital letters in the name don’t matter.', 'Join team', false) +
      '</div>');

    function wire(id, fn, check) {
      var form = $('#' + id), msg = $('#' + id + '-msg');
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var name = $('#' + id + '-name').value.trim(), pw = $('#' + id + '-pw').value;
        var problem = check(name, pw);
        if (problem) return setMsg(msg, problem);
        var btn = form.querySelector('button[type=submit]'), label = btn.textContent;
        btn.disabled = true; btn.textContent = 'Working…';
        try {
          var r = await api.rpc(fn, { p_name: name, p_password: pw });
          if (!r.ok) { setMsg(msg, r.error); return; }
          route();
        } catch (e) {
          setMsg(msg, friendly(e));
        } finally {
          btn.disabled = false; btn.textContent = label;
        }
      });
    }
    wire('create', 'create_team', function (n, p) {
      if (n.length < 2 || n.length > 32) return 'Team name must be 2-32 characters.';
      if (p.length < 4) return 'Team password must be at least 4 characters.';
    });
    wire('join', 'join_team', function (n, p) {
      if (!n || !p) return 'Enter the team name and team password.';
    });
  }

  // ------------------------------------------------------------------ #/team/<name>  public team page
  async function viewTeamPage(stale) {
    var name = hashParts().sub;
    app.innerHTML = page('<p class="text-neon/50">Loading team…</p>', 'max-w-4xl');
    var r;
    try { r = await api.rpc('get_team', { p_name: name }); }
    catch (e) {
      if (stale()) return;
      app.innerHTML = page(heading('Team', 'Not available') + '<div class="card"><p class="msg-err m-0">' +
        esc(isMissingFn(e) ? 'Team pages aren’t switched on yet. Organizers: run supabase/migrations/002_event_features.sql.' : friendly(e)) +
        '</p></div>', 'max-w-xl');
      return;
    }
    if (stale()) return;
    if (!r || !r.ok) {
      app.innerHTML = page(heading('Team', 'No such team') + '<div class="card"><p class="m-0 text-neon/75 wrap-any">There’s no team called <b class="text-neon">' +
        esc(name) + '</b>.</p><a href="#/scoreboard" class="btn-green mt-5">Back to the scoreboard</a></div>', 'max-w-xl');
      return;
    }
    var t = r.team, solves = t.solves || [], mine = myTeam() && myTeam().name.toLowerCase() === String(t.name).toLowerCase();
    var late = Number(t.total || 0) - Number(t.score || 0);
    function stat(label, value, id) {
      return '<div class="bg-void border border-line box-glow p-5"><p class="text-xs uppercase tracking-widest text-neon/50 m-0">' + label + '</p>' +
        '<p' + (id ? ' id="' + id + '"' : '') + ' class="mt-2 mb-0 font-term text-5xl text-neon">' + value + '</p></div>';
    }
    app.innerHTML = page(heading('Team profile', '<span class="wrap-any">' + esc(t.name) + '</span>') +
      (mine ? '<p class="-mt-3 mb-6 text-amber text-sm uppercase tracking-widest">Your team</p>' : '') +
      '<div class="grid sm:grid-cols-3 gap-4 mb-4">' +
        stat('Scoreboard points', Number(t.score || 0), 'tp-score') + stat('Flags captured', solves.length) + stat('Members', (t.members || []).length) +
      '</div>' +
      (late > 0 ? '<p data-late class="text-sm text-amber/90 mb-4">+' + late + ' more points captured after the scoreboard froze (they don’t count for prizes).</p>' : '') +
      '<div class="grid md:grid-cols-2 gap-4">' +
        '<div class="card"><p class="label">Agents</p><ul id="tp-members" class="list-none p-0 m-0 space-y-2">' +
          ((t.members || []).length ? t.members.map(function (u) {
            return '<li class="flex gap-3 wrap-any"><span class="text-alert">&gt;</span><span>' + esc(u) + '</span></li>';
          }).join('') : '<li class="text-neon/50">Nobody (everyone left)</li>') + '</ul></div>' +
        '<div class="card"><p class="label">Solves</p>' + (solves.length ? '<ul id="tp-solves" class="list-none p-0 m-0 space-y-2">' + solves.map(function (x) {
          return '<li class="flex items-baseline gap-2"><span class="text-neon font-bold wrap-any min-w-0">' + esc(x.name) + '</span>' +
            '<span class="shrink-0 text-xs text-neon/50">' + esc(x.category) + '</span>' +
            (x.after_freeze ? '<span class="shrink-0 text-[10px] uppercase tracking-wider text-amber/70">after freeze</span>' : '') +
            '<span class="ml-auto shrink-0 text-right"><span class="font-term text-xl text-alert">' + Number(x.value) + '</span>' +
            '<span class="block text-xs text-neon/50">' + esc(fmtTime(x.at)) + '</span></span></li>';
        }).join('') + '</ul>' : '<p id="tp-solves" class="m-0 text-neon/50">No flags yet.</p>') + '</div>' +
      '</div>' +
      '<div class="mt-6 flex flex-col sm:flex-row gap-3"><a href="#/scoreboard" class="btn-green">Back to the scoreboard</a></div>', 'max-w-4xl');
  }

  // ------------------------------------------------------------------ #/challenges
  async function viewChallenges(stale) {
    if (!status.signed_in) { app.innerHTML = needLogin('see the challenges'); return; }
    app.innerHTML = page('<p class="text-neon/50">Loading challenges…</p>');
    var r;
    try { r = await api.rpc('get_challenges'); }
    catch (e) {
      if (stale()) return;
      app.innerHTML = page(heading('Challenges', 'Connection problem') +
        '<div class="card"><p class="msg-err m-0">' + esc(friendly(e)) + '</p><button type="button" id="retry" class="btn-green mt-4">Try again</button></div>', 'max-w-xl');
      $('#retry').addEventListener('click', route);
      return;
    }
    if (stale()) return;
    if (!r.ok && r.error === 'login') { app.innerHTML = needLogin('see the challenges'); return; }

    var team = myTeam();
    var teamNote = team
      ? '<p class="text-neon/70 wrap-any">You’re on team <b class="text-neon">' + esc(team.name) + '</b>. You’re ready.</p>'
      : '<p class="text-amber wrap-any">You’re not on a team yet. <a href="#/team" class="underline">Create or join one now</a> so you’re ready.</p>';

    if (!r.ok && r.error === 'not_started') {
      if (r.start) clock.start = new Date(r.start);
      app.innerHTML = page(heading('Challenges', 'Stand by, agent') +
        '<div class="card py-10">' + countdownHtml() + '</div><div class="mt-6 text-center">' + teamNote + '</div>');
      if (clock.now() >= clock.start) {
        // our clock says it's time but the server disagrees: retry gently instead of looping
        later(5000, function () { syncEvent(true).then(route); });
      } else {
        startCountdown($('[data-countdown]', app), { onStart: function () { route(); } });
      }
      return;
    }
    if (!r.ok) { app.innerHTML = page('<p class="msg-err">' + esc(r.error) + '</p>'); return; }

    var list = r.challenges || [];
    var ended = !!r.ended;
    app.innerHTML = page(
      '<div class="flex flex-wrap items-end gap-x-6 gap-y-2 mb-6">' +
        '<div class="min-w-0">' + heading('Challenges', 'Hunt the flags').replace('mb-6', 'mb-0') + '</div>' +
        '<p id="ch-timer" class="sm:ml-auto m-0 text-sm uppercase tracking-widest ' + (ended ? 'text-neon' : 'text-alert') + '"></p>' +
      '</div>' +
      (ended ? '<div class="card mb-6 text-neon">The CTF is over. Thanks for playing! <a href="#/scoreboard" class="text-amber underline">See the final scoreboard</a> or <a href="#/solutions" class="text-amber underline">read the solutions</a>.</div>' : '') +
      (!team && !ended ? '<div class="bg-amber/10 border border-amber/40 text-amber p-4 mb-6 text-sm">You can read the challenges, but you need a team to submit flags. <a href="#/team" class="underline font-bold">Create or join a team</a>.</div>' : '') +
      '<div id="ch-filters" class="flex flex-wrap items-center gap-2 mb-8"></div>' +
      '<div id="ch-groups" class="space-y-10"></div>');

    var timer = $('#ch-timer');
    function tickTimer() {
      if (clock.now() >= clock.end) { timer.textContent = 'Operation complete'; return; }
      timer.textContent = 'Time left ' + timeLeftText();
    }
    tickTimer();
    if (!ended) every(1000, tickTimer);

    var ctx = { ended: ended, list: list, category: '', hideSolved: false };
    try { ctx.hideSolved = sessionStorage.getItem('cyai_hide_solved') === '1'; } catch (e) { /* private mode */ }
    function renderFilters(cats) {
      if (ctx.category && cats.indexOf(ctx.category) < 0) ctx.category = '';
      var solvedCount = ctx.list.filter(function (c) { return c.solved; }).length;
      $('#ch-filters').innerHTML = (cats.length > 1 ? ['', ].concat(cats).map(function (cat) {
        var on = ctx.category === cat;
        return '<button type="button" data-filter="' + esc(cat) + '" aria-pressed="' + on + '" class="cyai-btn px-3 py-1.5 border text-xs uppercase tracking-wider wrap-any ' +
          (on ? 'border-neon bg-neon/15 text-neon' : 'border-line text-neon/60') + '">' + (cat ? esc(cat) : 'All') + '</button>';
      }).join('') : '') +
        '<label class="sm:ml-auto flex items-center gap-2 cursor-pointer select-none text-sm text-neon/70">' +
          '<input type="checkbox" id="hide-solved" class="w-5 h-5 accent-[#39ff88]"' + (ctx.hideSolved ? ' checked' : '') + '> Hide solved' +
          (solvedCount ? ' <span class="text-neon/40">(' + solvedCount + ')</span>' : '') + '</label>';
      $$('[data-filter]', app).forEach(function (b) {
        b.addEventListener('click', function () { ctx.category = b.getAttribute('data-filter'); renderGroups(); });
      });
      $('#hide-solved').addEventListener('change', function () {
        ctx.hideSolved = this.checked;
        try { sessionStorage.setItem('cyai_hide_solved', this.checked ? '1' : '0'); } catch (e) { /* private mode */ }
        renderGroups();
      });
    }
    function renderGroups() {
      var groups = [], byCat = {}, cats = [];
      ctx.list.forEach(function (c) {
        if (cats.indexOf(c.category) < 0) cats.push(c.category);
        if (ctx.category && c.category !== ctx.category) return;
        if (ctx.hideSolved && c.solved) return;
        if (!byCat[c.category]) { byCat[c.category] = []; groups.push(c.category); }
        byCat[c.category].push(c);
      });
      renderFilters(cats);
      var empty = !ctx.list.length ? '<p class="text-neon/60">No challenges are published yet.</p>'
        : '<p class="text-neon/60">Nothing left to show here: your team solved everything in this view. Untick <b>Hide solved</b> to see them.</p>';
      $('#ch-groups').innerHTML = groups.length ? groups.map(function (cat) {
        return '<div><h2 class="font-term text-3xl text-neon mb-3 wrap-any">' + esc(cat).toUpperCase() + '</h2>' +
          '<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">' +
          byCat[cat].map(function (c) {
            return '<button type="button" data-ch="' + esc(c.id) + '" class="cyai-btn text-left p-5 border ' +
              (c.solved ? 'bg-neon/10 border-neon box-glow' : 'bg-panel border-line box-glow') + '">' +
              '<span class="flex items-start justify-between gap-3">' +
                '<span class="font-bold text-neon text-lg wrap-any">' + esc(c.name) + '</span>' +
                '<span class="font-term text-3xl leading-none ' + (c.solved ? 'text-neon' : 'text-alert') + '">' + Number(c.value) + '</span>' +
              '</span>' +
              '<span class="mt-3 flex items-center justify-between gap-2 text-xs uppercase tracking-widest">' +
                '<span class="text-neon/50">' + Number(c.solves) + (c.solves === 1 ? ' solve' : ' solves') +
                  (c.difficulty ? ' &middot; <span data-difficulty class="' + diffClass(c.difficulty) + '">' + esc(c.difficulty) + '</span>' : '') + '</span>' +
                (c.solved ? '<span data-solved class="text-neon font-bold">Solved</span>' : '<span class="text-neon/40">Open &rarr;</span>') +
              '</span></button>';
          }).join('') + '</div></div>';
      }).join('') : empty;
      $$('[data-ch]', app).forEach(function (b) {
        b.addEventListener('click', function () {
          var c = ctx.list.find(function (x) { return x.id === b.getAttribute('data-ch'); });
          if (c) openModal(c, ctx, b);
        });
      });
    }
    ctx.refresh = async function () {
      try {
        var again = await api.rpc('get_challenges');
        if (stale() || !again.ok) return;
        ctx.list = again.challenges || [];
        ctx.ended = !!again.ended;
        if (!$('#modal').hidden) return; // don't re-render under an open modal
        renderGroups();
      } catch (e) { /* keep showing what we have */ }
    };
    renderGroups();
    // pick up teammates' solves when the student comes back to this tab
    function onVisible() { if (!document.hidden) ctx.refresh(); }
    document.addEventListener('visibilitychange', onVisible);
    onLeave(function () { document.removeEventListener('visibilitychange', onVisible); });
  }

  // Hint 1 is open from the start; each later hint opens HINT_STEP_MS after the one before it.
  var HINT_STEP_MS = 15 * 60000;
  function hintOpensAt(i) { return new Date(clock.start.getTime() + i * HINT_STEP_MS); }

  // ------------------------------------------------------------------ #/solutions  (after the CTF closes)
  var solutionsCache = null;
  async function loadSolutions() {
    if (solutionsCache) return solutionsCache;
    try {
      var r = await api.rpc('get_solutions');
      if (r && r.ok) solutionsCache = r.solutions || [];
      return solutionsCache;
    } catch (e) { return null; } // migration 004 not run yet
  }
  function solutionHtml(x) {
    // writeup is organizer HTML from the challenge_solutions table (trusted)
    return '<p class="label">Solution</p>' +
      '<p class="m-0 mb-3 text-sm text-neon/70">Flag: <code data-sol-flag class="text-amber wrap-any">' + esc(x.flag) + '</code></p>' +
      '<div class="ctf-html text-sm text-neon/80 leading-relaxed wrap-any">' + (x.writeup || '<p class="text-neon/50">Walkthrough coming soon.</p>') + '</div>';
  }
  async function viewSolutions(stale) {
    app.innerHTML = page('<p class="text-neon/50">Loading solutions…</p>');
    var r;
    try { r = await api.rpc('get_solutions'); }
    catch (e) {
      if (stale()) return;
      app.innerHTML = page(heading('Debrief', 'Solutions') + '<div class="card"><p class="m-0 text-neon/70">' +
        (isMissingFn(e) ? 'Solutions aren’t published yet.' : esc(friendly(e))) + '</p></div>', 'max-w-3xl');
      return;
    }
    if (stale()) return;
    if (!r.ok) {
      app.innerHTML = page(heading('Debrief', 'Solutions') + '<div class="card"><p class="m-0 text-neon/80">Solutions for every challenge are published here when the CTF closes' +
        (r.end ? ', <b class="text-neon">' + esc(fmtTime(r.end)) + '</b>' : '') + '. Until then, keep hunting.</p></div>', 'max-w-3xl');
      return;
    }
    solutionsCache = r.solutions || [];
    var cats = [], byCat = {};
    solutionsCache.forEach(function (x) { if (!byCat[x.category]) { byCat[x.category] = []; cats.push(x.category); } byCat[x.category].push(x); });
    app.innerHTML = page(heading('Debrief', 'Solutions') +
      '<p class="text-neon/70 max-w-3xl leading-relaxed mb-8">The CTF is closed. Here is how every challenge is solved. ' +
        'Try the ones you missed again before you open the answer.</p>' +
      cats.map(function (cat) {
        return '<section class="mb-10"><h2 class="font-term text-3xl text-neon mb-3 wrap-any">' + esc(cat).toUpperCase() + '</h2><div class="space-y-3">' +
          byCat[cat].map(function (x) {
            return '<details data-solution="' + esc(x.id) + '" class="group bg-void border border-line p-4">' +
              '<summary class="cursor-pointer list-none flex items-baseline gap-3"><b class="text-neon wrap-any min-w-0">' + esc(x.name) + '</b>' +
              '<span class="ml-auto shrink-0 text-xs uppercase tracking-widest text-neon/50">' + Number(x.value) + ' pts' +
              (x.difficulty ? ' &middot; <span class="' + diffClass(x.difficulty) + '">' + esc(x.difficulty) + '</span>' : '') + '</span></summary>' +
              '<div class="mt-4">' + solutionHtml(x) + '</div></details>';
          }).join('') + '</div></section>';
      }).join('') +
      '<div class="flex flex-col sm:flex-row gap-3"><a href="#/scoreboard" class="btn-green">Final scoreboard</a><a href="#/learn" class="btn-red">Field manual</a></div>', 'max-w-4xl');
  }

  // ------------------------------------------------------------------ challenge modal
  var modalReturnFocus = null;
  function closeModal() {
    var m = $('#modal');
    if (m.hidden) return;
    m.hidden = true;
    document.body.style.overflow = '';
    if (modalReturnFocus && document.body.contains(modalReturnFocus)) modalReturnFocus.focus();
    if (modalOnClose) { var f = modalOnClose; modalOnClose = null; f(); }
  }
  var modalOnClose = null;
  function diffClass(d) { return /hard/i.test(d) ? 'text-alert' : /medium/i.test(d) ? 'text-amber' : 'text-neon/70'; }
  // Challenge files: {"name": "x.zip"} is served from site/c/files/, or give a full "url".
  function fileUrl(f) {
    if (typeof f === 'string') f = { name: f };
    f = f || {};
    return f.url ? safeUrl(f.url) : 'c/files/' + encodeURIComponent(String(f.name || ''));
  }
  function safeUrl(u) { u = String(u || ''); return /^(https?:\/\/|[\w.\/-]+$)/i.test(u) && !/^javascript:/i.test(u) ? u : '#'; }

  function openModal(c, ctx, returnTo) {
    var team = myTeam();
    modalReturnFocus = returnTo || null;
    modalOnClose = function () { ctx.refresh(); };
    $('#modal-title').textContent = c.name;
    $('#modal-cat').textContent = [c.category, c.value + ' pts', c.difficulty, c.author ? 'by ' + c.author : '']
      .filter(Boolean).join(' · ');

    var hints = Array.isArray(c.hints) ? c.hints : [];
    var files = Array.isArray(c.files) ? c.files.filter(Boolean) : [];
    var blocked = ctx.ended ? 'The CTF is over. Thanks for playing!' : (!team ? 'Join or create a team first.' : '');

    $('#modal-body').innerHTML =
      // description is organizer HTML from the challenges table (trusted)
      '<div class="ctf-html text-neon/80 leading-relaxed wrap-any">' + (c.description || '') + '</div>' +
      (files.length ? '<div class="mt-4"><p class="label">Files</p><ul class="list-none p-0 m-0 space-y-1">' + files.map(function (f) {
        var url = fileUrl(f), name = typeof f === 'string' ? f : (f.name || f.url);
        return '<li><a data-file class="text-amber underline wrap-any" target="_blank" rel="noopener" href="' + esc(url) + '"' +
          (/^https?:/i.test(url) ? '' : ' download') + '>&#8681; ' + esc(name) + '</a></li>';
      }).join('') + '</ul></div>' : '') +
      (hints.length ? '<div class="mt-5 space-y-2"><p class="label">Hints</p>' + hints.map(function (h, i) {
        var opens = hintOpensAt(i), locked = !ctx.ended && clock.now() < opens;
        return '<div><button type="button" data-hint="' + i + '" data-opens="' + opens.getTime() + '" class="cyai-btn w-full text-left px-4 py-2.5 border border-amber/40 text-amber text-sm"' + (locked ? ' disabled' : '') + '>' +
            (locked ? 'Hint ' + (i + 1) + ' unlocks at ' + esc(fmtTime(opens)) : '&#9656; Reveal hint ' + (i + 1)) + '</button>' +
          '<div data-hint-body="' + i + '" class="ctf-html text-sm text-neon/80 bg-void border border-amber/30 p-3 wrap-any" hidden>' + h + '</div></div>';
      }).join('') + '</div>' : '') +
      (guideFor(c.category) ? '<p class="mt-4 mb-0 text-sm text-neon/60">New to ' + esc(guideFor(c.category).title) + ' challenges? ' +
        '<a href="#/learn/' + guideFor(c.category).id + '" class="text-amber underline">Read the beginner guide</a></p>' : '') +
      '<div id="m-solved" class="mt-5 bg-neon/10 border border-neon p-3 text-neon font-bold"' + (c.solved ? '' : ' hidden') + '>Your team solved this one.</div>' +
      '<form id="flag-form" class="mt-5" novalidate' + (c.solved ? ' hidden' : '') + '>' +
        '<label class="label" for="flag-input">Flag</label>' +
        '<div class="flex flex-col sm:flex-row gap-2">' +
          '<input class="field font-mono" id="flag-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="200" placeholder="CYAI{...}"' + (blocked ? ' disabled' : '') + '>' +
          '<button type="submit" class="btn-red shrink-0"' + (blocked ? ' disabled' : '') + '>Submit</button>' +
        '</div>' +
        '<p id="flag-msg" class="' + (blocked ? 'text-amber' : 'msg-err') + ' text-sm mt-3 mb-0 min-h-[1.25rem]" aria-live="polite">' + esc(blocked) + '</p>' +
      '</form>' +
      '<div id="m-solves" class="mt-6 pt-4 border-t border-line">' +
        '<p class="label">Solves <span data-solve-count>(' + Number(c.solves) + ')</span></p>' +
        '<div data-solve-list class="text-sm text-neon/50">' + (c.solves ? 'Loading…' : 'No one yet. Be the first blood.') + '</div></div>' +
      '<div id="m-solution" class="mt-6 pt-4 border-t border-line" hidden></div>';

    var modalSeq = ++openModal.seq;
    if (ctx.ended) loadSolutions().then(function (sols) {
      var x = sols && sols.find(function (y) { return y.id === c.id; });
      if (!x || modalSeq !== openModal.seq) return;
      var box = $('#m-solution');
      box.innerHTML = solutionHtml(x);
      box.hidden = false;
    });
    async function loadSolves() {
      var box = $('#m-solves');
      var r;
      try { r = await api.rpc('get_challenge_solves', { p_challenge: c.id }); }
      catch (e) { if (isMissingFn(e) && modalSeq === openModal.seq) box.hidden = true; return; } // needs migration 002
      if (modalSeq !== openModal.seq || !r || !r.ok) return;
      var list = r.solves || [];
      var mine = team ? team.name.toLowerCase() : null;
      $('[data-solve-count]', box).textContent = '(' + list.length + ')';
      $('[data-solve-list]', box).innerHTML = list.length ? '<ol class="list-none p-0 m-0 space-y-1.5">' + list.map(function (x, i) {
        var me = mine && String(x.team).toLowerCase() === mine;
        return '<li data-solve class="flex items-baseline gap-2 ' + (me ? 'text-neon' : 'text-neon/75') + '">' +
          '<span class="font-term text-lg text-neon/40 w-6 shrink-0">' + (i + 1) + '</span>' +
          '<a href="' + esc(teamHref(x.team)) + '" class="font-bold wrap-any min-w-0 hover:underline">' + esc(x.team) + '</a>' +
          (i === 0 ? '<span data-first-blood class="shrink-0 px-1.5 py-0.5 bg-alert text-void text-[10px] font-extrabold uppercase tracking-wider">First blood</span>' : '') +
          (x.after_freeze ? '<span class="shrink-0 text-[10px] uppercase tracking-wider text-amber/70" title="Solved after the scoreboard froze">after freeze</span>' : '') +
          '<span class="ml-auto shrink-0 text-xs text-neon/50">' + esc(fmtTime(x.at)) + '</span></li>';
      }).join('') + '</ol>' : 'No one yet. Be the first blood.';
    }
    loadSolves();

    $$('[data-hint]', $('#modal-body')).forEach(function (b) {
      if (b.disabled) { // unlock while the modal is open
        later(Math.max(0, Number(b.getAttribute('data-opens')) - clock.now().getTime()) + 500, function () {
          if (modalSeq !== openModal.seq) return;
          b.disabled = false;
          b.innerHTML = '&#9656; Reveal hint ' + (Number(b.getAttribute('data-hint')) + 1);
        });
      }
      b.addEventListener('click', function () {
        b.hidden = true;
        $('[data-hint-body="' + b.getAttribute('data-hint') + '"]', $('#modal-body')).hidden = false;
      });
    });

    var form = $('#flag-form'), input = $('#flag-input'), msg = $('#flag-msg');
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var flag = input.value.trim();
      if (!flag) { msg.className = 'msg-err text-sm mt-3 mb-0'; msg.textContent = 'Paste a flag first. Flags look like CYAI{...}'; return; }
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        var r = await api.rpc('submit_flag', { p_challenge: c.id, p_flag: flag });
        msg.textContent = r.message || '';
        if (r.status === 'correct' || r.status === 'already_solved') {
          msg.className = 'msg-ok text-sm mt-3 mb-0 font-bold';
          c.solved = true;
          if (r.status === 'correct') c.solves += 1;
          $('#m-solved').hidden = false;
          input.disabled = true;
          loadSolves();
          return; // keep the button disabled
        }
        msg.className = (r.status === 'rate_limited' ? 'text-amber' : 'msg-err') + ' text-sm mt-3 mb-0';
        if (r.status === 'incorrect') { input.select(); }
      } catch (e) {
        msg.className = 'msg-err text-sm mt-3 mb-0';
        msg.textContent = friendly(e);
      }
      btn.disabled = false;
    });

    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#modal').scrollTop = 0;
    $('#modal-close').focus();
  }
  openModal.seq = 0;
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  // ------------------------------------------------------------------ #/learn  beginner guides
  // General know-how per category. Keep these free of anything specific to a
  // challenge (pages, names, answers): the per-challenge hints cover that.
  // To add a category, add an entry; `match` is tested against challenge categories.
  var GUIDES = [
    {
      id: 'web', title: 'Web', match: /web/i,
      what: 'A website is code your browser downloads and runs: HTML for structure, CSS for looks and JavaScript for behavior. ' +
        'Web challenges ask you to look at how a site is built and what it sends back and forth, because anything the server ' +
        'sends to your browser is something you can read.',
      tools: [
        ['View Page Source', 'Ctrl+U on Windows, Cmd+Option+U on a Mac. Shows the raw HTML exactly as the server sent it.'],
        ['Developer Tools', 'F12, or right-click a page and choose Inspect. The Elements tab shows the live page, Console runs JavaScript, Network lists every file the page loads.'],
        ['Find on page', 'Ctrl+F or Cmd+F inside the source or DevTools to search a long page for keywords.'],
        ['Laptop recommended', 'Mobile browsers don’t expose developer tools.'],
      ],
      tip: 'What the page renders is only part of what the server sent. Source, scripts, cookies and network requests are all ' +
        'readable, and developers leave things in them.',
    },
    {
      id: 'osint', title: 'OSINT', match: /osint/i,
      what: 'OSINT stands for Open Source Intelligence: answering questions using only information that is already public, such as ' +
        'websites, news articles, social media, records and old copies of web pages. Investigators, journalists and security ' +
        'teams use it every day.',
      tools: [
        ['Search operators', '"exact phrase" matches words in order, site:york.cuny.edu searches one website, filetype:pdf finds documents, and -word excludes a word.'],
        ['Wayback Machine', 'web.archive.org shows what a website looked like years ago, including pages that have since changed or been deleted.'],
        ['Reverse image search', 'Google Lens or images.google.com tell you where a photo has appeared before.'],
        ['Official sources', 'An organization’s own website, Wikipedia (check its sources at the bottom) and government or school records.'],
      ],
      tip: 'Answer exactly what the question asks, in the format it asks for, and confirm each fact with a second source. ' +
        'Public information only: never contact real people.',
    },
    {
      id: 'crypto', title: 'Cryptography', match: /crypt|cipher/i,
      what: 'Cryptography is the science of hiding messages so only the right people can read them. In CTFs, you’ll find scrambled text and need to figure out how it was scrambled, then reverse it. Beginner challenges usually use classic methods, like shifting letters or swapping one letter for another, or encodings like Base64, which only look secret. In this CTF, YorkGPT scrambles its messages so humans can’t read its plans. Unscramble them to see what it’s up to.',
      tools: [
        ['CyberChef', '<a href="https://gchq.github.io/CyberChef/" target="_blank" rel="noopener" class="text-amber underline wrap-any">gchq.github.io/CyberChef</a>: the “Cyber Swiss Army Knife,” made by the UK’s GCHQ. Paste text in, drag in a recipe like “From Base64” or “ROT13,” and see the result instantly. Try the “Magic” recipe when you don’t know what you’re looking at.'],
        ['dCode Cipher Identifier', '<a href="https://www.dcode.fr/cipher-identifier" target="_blank" rel="noopener" class="text-amber underline wrap-any">dcode.fr/cipher-identifier</a>: paste mystery text and it guesses which cipher or encoding was used.'],
        ['quipqiup', '<a href="https://quipqiup.com/" target="_blank" rel="noopener" class="text-amber underline wrap-any">quipqiup.com</a>: automatically solves substitution ciphers, where each letter was swapped for another.'],
        ['Learn more', '<a href="https://primer.picoctf.org/#_cryptography" target="_blank" rel="noopener" class="text-amber underline wrap-any">picoCTF Primer: Cryptography</a> and <a href="https://www.khanacademy.org/computing/computer-science/cryptography" target="_blank" rel="noopener" class="text-amber underline wrap-any">Khan Academy: Cryptography</a>.'],
      ],
      tip: 'Before decoding anything, describe what you see: which characters appear, how long it is, and any repeated patterns. Then let CyberChef’s “Magic” recipe or dCode’s Cipher Identifier suggest what it might be. Identify first, decode second.',
    },
    {
      id: 'forensics', title: 'Forensics', match: /forensic/i,
      what: 'Digital forensics is detective work on digital evidence: files, photos and logs. Logs are records computers keep of everything that happens, such as who logged in, when, and from where. Forensics challenges hand you evidence and ask what really happened. Investigators use these same skills on real cybercrime cases. In this CTF, YorkGPT tried to cover its tracks, but files always leave evidence behind. Examine what it left and find the clues it missed.',
      tools: [
        ['Find on page', 'Ctrl+F on Windows, Cmd+F on Mac, or “Find in page” in your phone browser’s menu: logs can be hundreds of lines long, so search for keywords instead of reading every line.'],
        ['HexEd.it', '<a href="https://hexed.it/" target="_blank" rel="noopener" class="text-amber underline wrap-any">hexed.it</a>: opens any file in your browser and shows its raw bytes. Useful when a file won’t open or might be disguised as another type.'],
        ['CyberChef', '<a href="https://gchq.github.io/CyberChef/" target="_blank" rel="noopener" class="text-amber underline wrap-any">gchq.github.io/CyberChef</a>: the “Strings” and “Detect File Type” recipes pull readable text out of files and identify what a file really is, and “Extract EXIF” shows a photo’s hidden metadata, such as camera, date, comments and sometimes location.'],
        ['Learn more', '<a href="https://primer.picoctf.org/#_forensics" target="_blank" rel="noopener" class="text-amber underline wrap-any">picoCTF Primer: Forensics</a>.'],
      ],
      tip: 'Investigators look for what’s unusual. In a log, compare timestamps, usernames and outcomes, and notice what stands out from the normal pattern. In a file, don’t trust its name: check what it really is and what’s hidden in its metadata.',
    },
    {
      id: 'ai', title: 'AI / Prompt Injection', match: /prompt|injection|^ai$/i,
      what: 'Chatbots follow hidden instructions from their developers, called a system prompt, and also read whatever you type. ' +
        'Prompt injection is writing a message that makes the AI follow your instructions instead of the developer’s. ' +
        'It is ranked the number one security risk for applications built on large language models (OWASP Top 10 for LLM Apps).',
      tools: [
        ['The challenge chat window', 'Nothing else required.'],
        ['A log of attempts', 'Small changes in wording produce very different replies. Record your exact prompts and the responses.'],
        ['OWASP LLM01', 'The OWASP Top 10 for LLM Apps describes prompt injection and why it is hard to defend against.'],
      ],
      tip: 'When a request fails, change the framing, not the volume. The defender’s takeaway: never put secrets in a prompt, ' +
        'and limit what a model is allowed to do. Only test systems you have permission to test.',
    },
    {
      id: 'social', title: 'Social Engineering', match: /social|phish/i,
      what: 'Social engineering means attacking people instead of computers: tricking someone into clicking a link, typing a ' +
        'password into a fake page or handing over information. Phishing emails are the most common kind, and most real ' +
        'break-ins start with one. These challenges teach you to spot the tricks before they work on you.',
      tools: [
        ['Link preview', 'Hover over a link (or press and hold on a phone) to see the real destination before opening it.'],
        ['Read the sender’s address', 'The display name can say anything. The part after the @ is what counts, and look-alike domains are a classic trick.'],
        ['Read a domain right to left', 'In login.example.com.evil.net the site you actually reach is evil.net. Everything to its left is decoration.'],
        ['Show original', 'Most email apps can show the raw message (Gmail: three dots, then Show original), including where it really came from.'],
      ],
      tip: 'Phishing runs on urgency and borrowed authority. Verify the sending domain and the real link target before trusting ' +
        'anything the message says.',
    },
    {
      id: 'safety', title: 'AI Safety', match: /safety|hallucin|misinfo/i,
      what: 'AI chatbots predict words that sound right, which is not the same as being right. They sometimes state made-up facts, ' +
        'names, quotes and sources with total confidence, which is called hallucinating. AI safety challenges ask you to check an ' +
        'AI’s answer instead of trusting it.',
      tools: [
        ['Primary sources', 'The organization’s own website, official records and reputable news sites. Go to where the fact actually comes from.'],
        ['Lateral reading', 'Open new tabs and see what other independent sources say about a claim, instead of rereading the claim itself.'],
        ['Search for each claim', 'Break the answer into separate statements and check them one at a time. A mostly true answer can hide one false detail.'],
      ],
      tip: 'Treat a confident AI answer as an unverified claim. Specific names, dates, numbers and citations are where ' +
        'fabrications usually hide.',
    },
    {
      id: 'finance', title: 'Finance & Accounting', match: /financ|account|audit/i,
      what: 'When a college buys something, the purchase leaves a paper trail: a purchase order (PO) approves the purchase ' +
        'before it happens, the vendor sends an invoice, and accounts payable sends the payment. Auditors check that every payment ' +
        'traces back to an approved PO for the same vendor and the same amount, because money that doesn’t match is how both honest ' +
        'mistakes and fraud get caught. In this CTF, YorkGPT got into York’s books, and your job is to audit them.',
      tools: [
        ['A spreadsheet', 'Google Sheets or Excel for the web. Paste the tables in, sort and filter, and let formulas do the comparing.'],
        ['Find on page', 'Ctrl+F or Cmd+F to jump between rows that share a vendor, PO number or amount.'],
      ],
      tip: 'Reconcile record by record. Whatever doesn’t trace back to an approval is your lead, and near-matches deserve ' +
        'the closest look.',
    },
    {
      id: 'reverse', title: 'Reverse Engineering', match: /revers/i,
      what: 'Reverse engineering means taking a finished program and working out how it works without the original plans. ' +
        'Beginner challenges usually give you a small program that checks whether a password or code is right, and you read its ' +
        'logic to figure out what it accepts. In this CTF, YorkGPT wrote its own code checker and is sure nobody can understand it.',
      tools: [
        ['View Page Source', 'Ctrl+U on Windows, Cmd+Option+U on a Mac. Code that runs in your browser is sent to your browser, so you can read it.'],
        ['Browser console', 'F12, then the Console tab. Type JavaScript and press Enter to run it, which is a great way to test what one line of code does.'],
        ['CyberChef', 'gchq.github.io/CyberChef: converts between numbers, text, hex, Base64 and XOR without writing code.'],
        ['Laptop recommended', 'Mobile browsers don’t expose developer tools.'],
      ],
      tip: 'Find the comparison that decides pass or fail and work backwards from it. Rename obfuscated variables in your ' +
        'notes as you work out what they hold.',
    },
    {
      id: 'aviation', title: 'Aviation', match: /aviat|flight|airport/i,
      what: 'Air traffic control keeps track of every aircraft using a few simple codes. A callsign names the flight (like ' +
        'UAL237). A transponder in the plane broadcasts a 4-digit number called a squawk code, which controllers assign, and a ' +
        'handful of codes are reserved so pilots can report an emergency silently. Airports have two codes: a 3-letter IATA code ' +
        'you see on luggage tags and a 4-letter ICAO code that pilots and controllers use. In this CTF, YorkGPT took over a ' +
        'York training flight.',
      tools: [
        ['FAA and SKYbrary', 'faa.gov and skybrary.aero explain aviation terms in plain English. Search them for any code or word you don’t recognize.'],
        ['Airport code lookup', 'Search an airport’s name or code online: its Wikipedia page lists both its IATA and ICAO codes near the top.'],
        ['Flightradar24', 'flightradar24.com shows real flights live, with their callsigns, routes and altitudes, so you can see what this data looks like.'],
      ],
      tip: 'Work out what every field means before hunting for the anomaly, and verify codes against an official source: ' +
        'similar-looking codes can mean very different things.',
    },
    {
      id: 'passwords', title: 'Passwords', match: /password/i,
      what: 'Passwords are the keys to almost every account, and most break-ins don’t involve clever hacking at all: ' +
        'the attacker simply guesses a weak password or reuses one that leaked. These challenges teach the basics of why ' +
        'some passwords are easy to break and others aren’t: default factory logins nobody changed, short or common ' +
        'passwords, and how systems store passwords as hashes instead of plain text. In this CTF, YorkGPT got in wherever ' +
        'a human left a lazy password behind.',
      tools: [
        ['Default-credential lists', 'Manuals and sites list the logins hardware ships with, like admin/admin. The first thing to try against any device is the factory default nobody changed.'],
        ['Hash lookup', '<a href="https://crackstation.net/" target="_blank" rel="noopener" class="text-amber underline wrap-any">crackstation.net</a> reverses common password hashes instantly by looking them up in a huge table. A plain web search for a hash often works too.'],
        ['Entropy and wordlists', 'Password “strength” is really entropy: how many guesses it would take. Common words, names and dates are in every attacker’s wordlist, so they fall in seconds no matter how they’re dressed up.'],
        ['Password managers', 'A manager like Bitwarden or 1Password makes one long random password per account so you never reuse or forget one. That’s the real-world fix for everything in this category.'],
      ],
      tip: 'A hash is one-way: you cannot turn it back into the password by maths, but if the password is common, someone has ' +
        'already hashed it and you can just look it up. Strong passwords are long, unique and unpredictable, and a salt (random ' +
        'text added before hashing) is what stops those lookup tables from working.',
    },
  ];
  // Primary public source backing each guide's factual claims (see references/ in the repo and
  // references/FACT-CHECK.md). Links go to the original sites so they work on the live site.
  var GUIDE_SOURCES = {
    web: [['picoCTF Primer', 'https://primer.picoctf.org/']],
    osint: [['TryHackMe: CTF categories', 'https://tryhackme.com/resources/blog/ctf-deep-dive-how-to-choose-the-right-category-for-your-skill-level']],
    crypto: [['HackerDNA: CTF categories', 'https://hackerdna.com/blog/ctf-categories']],
    forensics: [['picoCTF Primer', 'https://primer.picoctf.org/']],
    ai: [['OWASP Top 10 for LLM Apps (2025)', 'https://genai.owasp.org/llm-top-10/']],
    safety: [['OWASP Top 10 for LLM Apps — LLM09 Misinformation', 'https://genai.owasp.org/llm-top-10/']],
    social: [['FAU: Getting Started with CTFs', 'https://csc.fau.edu/compete/ctf/getting-started/']],
    finance: [['SEC: Beginners’ Guide to Financial Statements', 'https://www.sec.gov/about/reports-publications/beginners-guide-financial-statements'], ['OpenStax: Financial Accounting', 'https://openstax.org/books/principles-financial-accounting/pages/preface']],
    reverse: [['HackerDNA: CTF categories', 'https://hackerdna.com/blog/ctf-categories']],
    aviation: [['FAA: Pilot’s Handbook of Aeronautical Knowledge', 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak']],
    passwords: [['HackerDNA: CTF categories (hash cracking)', 'https://hackerdna.com/blog/ctf-categories']],
  };
  function guideFor(category) {
    return GUIDES.find(function (g) { return g.match.test(category || ''); }) || null;
  }

  function viewLearn() {
    var sub = hashParts().sub;
    app.innerHTML = page(heading('Field manual', 'Learn the basics') +
      '<p class="text-neon/70 max-w-3xl leading-relaxed mb-6">New to CTFs? Each section covers one category: what it is, ' +
        'the tools and how to approach it. Nothing here gives away a flag.</p>' +
      '<a href="#/tools" class="tool-card block bg-panel border border-neon/50 p-4 mb-8 no-underline"><b class="text-neon">Open the Toolbox</b>' +
        '<span class="block text-neon/70 text-sm mt-1">Browser tools for every category: CyberChef, packet and image analyzers, online decompilers. Nothing to install.</span></a>' +
      '<div class="flex flex-wrap gap-2 mb-10">' + GUIDES.map(function (g) {
        return '<button type="button" data-jump="' + g.id + '" class="cyai-btn px-3 py-2 border border-neon/40 text-neon text-sm uppercase tracking-wider">' + g.title + '</button>';
      }).join('') + '</div>' +

      '<section class="card mb-8"><h2 class="font-term text-3xl text-neon m-0 mb-3">HOW A CTF WORKS</h2>' +
        '<ul class="list-none p-0 m-0 space-y-2 text-neon/75 leading-relaxed">' +
          '<li class="flex gap-3"><span class="text-alert">&gt;</span><span>Every challenge hides a flag that looks like <code class="text-amber">CYAI{...}</code>. Find it, paste it into the challenge, and your team scores the points.</span></li>' +
          '<li class="flex gap-3"><span class="text-alert">&gt;</span><span>Capital letters and extra spaces don’t matter, but everything else must match exactly, including the brackets.</span></li>' +
          '<li class="flex gap-3"><span class="text-alert">&gt;</span><span>Hints don’t cost points, but try the challenge first. Hint 2 unlocks 15 minutes after the CTF starts.</span></li>' +
          '<li class="flex gap-3"><span class="text-alert">&gt;</span><span>Guessing doesn’t work: you get 10 tries a minute. Split up the challenges with your team and talk through what you find.</span></li>' +
        '</ul></section>' +

      GUIDES.map(function (g) {
        return '<section id="learn-' + g.id + '" class="card mb-8 scroll-mt-32">' +
          '<h2 class="font-term text-4xl text-neon glow-green m-0 mb-4">' + g.title.toUpperCase() + '</h2>' +
          '<h3 class="label">What it is</h3><p class="text-neon/80 leading-relaxed mt-0 mb-5">' + g.what + '</p>' +
          '<h3 class="label">Tools</h3><ul class="list-none p-0 m-0 mb-5 space-y-3">' + g.tools.map(function (t) {
            return '<li class="bg-void border border-line p-3"><b class="text-amber">' + t[0] + '</b><span class="block text-sm text-neon/75 mt-1">' + t[1] + '</span></li>';
          }).join('') + '</ul>' +
          '<h3 class="label">Tip</h3><p class="text-neon/80 leading-relaxed m-0 border-l-2 border-alert pl-3">' + g.tip + '</p>' +
          (GUIDE_SOURCES[g.id] ? '<p class="text-xs text-neon/50 mt-4 mb-0">Sources: ' + GUIDE_SOURCES[g.id].map(function (s) {
            return '<a href="' + s[1] + '" target="_blank" rel="noopener" class="text-amber/80 underline wrap-any">' + s[0] + '</a>';
          }).join(' &middot; ') + '</p>' : '') +
        '</section>';
      }).join('') +
      '<div class="flex flex-col sm:flex-row gap-3"><a href="#/challenges" class="btn-red">Go to challenges</a>' +
        (status.signed_in ? '' : '<a href="#/register" class="btn-green">Register</a>') + '</div>', 'max-w-4xl');

    function jump(id) {
      var el = document.getElementById('learn-' + id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $$('[data-jump]', app).forEach(function (b) { b.addEventListener('click', function () { jump(b.getAttribute('data-jump')); }); });
    if (sub) later(0, function () { jump(sub); }); // after the router's scroll-to-top
  }

  // ------------------------------------------------------------------ #/scoreboard  (+ ?tv=1 projector mode)
  function freezeBanner(big) {
    if (!clock.freeze || clock.freeze >= clock.end) return '';
    var at = esc(fmtTime(clock.freeze));
    if (clock.frozen()) {
      return '<div data-freeze class="mb-6 border border-alert bg-alert/10 text-alert box-glow-red p-4 ' + (big ? 'text-2xl' : 'text-sm') + '">' +
        '<b class="uppercase tracking-widest">Scoreboard FROZEN at ' + at + ', final standings for prizes.</b>' +
        '<span class="block mt-1 text-neon/70 ' + (big ? 'text-lg' : 'text-xs') + '">Flags still count on team pages until ' + esc(fmtTime(clock.end)) + ', but not here.</span></div>';
    }
    return '<p data-freeze-soon class="mb-4 text-amber/90 ' + (big ? 'text-xl' : 'text-sm') + '">The scoreboard freezes at ' + at + '. The standings at that moment decide the prizes.</p>';
  }

  // Score-over-time chart. Colors follow the team (first come, first served), not its rank,
  // so a team keeps its color while it moves up and down. Validated on the dark panel
  // background with the dataviz palette checker; teams past 8 colors share a neutral gray.
  var SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
  var SERIES_OVERFLOW = '#6f8a7b';
  var teamColors = {}, nextColor = 0;
  function colorFor(team) {
    var k = String(team).toLowerCase();
    if (!(k in teamColors)) teamColors[k] = nextColor < SERIES.length ? SERIES[nextColor++] : SERIES_OVERFLOW;
    return teamColors[k];
  }
  function renderChart(box, history, mine, big) {
    var t0 = clock.start.getTime();
    var t1 = Math.min(clock.now().getTime(), clock.end.getTime(), clock.freeze ? clock.freeze.getTime() : Infinity);
    var series = (history || []).filter(function (h) { return h.points && h.points.length; });
    if (!series.length || t1 <= t0) { box.hidden = true; return; }
    box.hidden = false;
    var cs = getComputedStyle(box);
    var inner = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var W = Math.max(240, Math.floor(inner) || 600), H = big ? 380 : (W < 500 ? 220 : 280);
    var fs = big ? 16 : 12, label = series.length <= 4 && W >= 500;
    var m = { l: fs * 3, r: label ? Math.min(160, W * 0.25) : 12, t: 12, b: fs * 2.2 };
    var max = 0;
    series.forEach(function (h) { h.points.forEach(function (p) { max = Math.max(max, Number(p.score)); }); });
    var step = max <= 400 ? 100 : max <= 1000 ? 200 : 500;
    var yMax = Math.max(step, Math.ceil(max / step) * step);
    var x = function (t) { return m.l + (Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0) * (W - m.l - m.r); };
    var y = function (v) { return m.t + (1 - v / yMax) * (H - m.t - m.b); };
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Score over time for the top teams" class="block select-none" style="font-family:inherit">';
    for (var v = 0; v <= yMax; v += step) {
      svg += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + (v ? 'rgba(57,255,136,.08)' : 'rgba(57,255,136,.25)') + '"/>' +
        '<text x="' + (m.l - 6) + '" y="' + (y(v) + fs * 0.35) + '" text-anchor="end" font-size="' + fs + '" fill="rgba(57,255,136,.5)">' + v + '</text>';
    }
    [t0, (t0 + t1) / 2, t1].forEach(function (t, i) {
      svg += '<text x="' + x(t) + '" y="' + (H - fs * 0.6) + '" text-anchor="' + ['start', 'middle', 'end'][i] + '" font-size="' + fs + '" fill="rgba(57,255,136,.5)">' +
        esc(new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</text>';
    });
    // paint the highlighted team last so it sits on top
    var order = series.slice().sort(function (a, b) { return (String(a.team).toLowerCase() === mine) - (String(b.team).toLowerCase() === mine); });
    order.forEach(function (h) {
      var me = String(h.team).toLowerCase() === mine, c = colorFor(h.team), last = 0;
      var d = 'M' + x(t0) + ' ' + y(0);
      h.points.forEach(function (p) { var px = x(new Date(p.at).getTime()); d += ' H' + px + ' V' + y(Number(p.score)); last = Number(p.score); });
      d += ' H' + x(t1);
      svg += '<path d="' + d + '" fill="none" stroke="#0a120e" stroke-width="' + (me ? 7 : 5) + '" stroke-linejoin="round"/>' + // surface ring
        '<path data-series="' + esc(h.team) + '" d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (me ? 3.5 : 2) + '" stroke-linejoin="round" stroke-linecap="round"/>';
      if (label) svg += '<text x="' + (x(t1) + 6) + '" y="' + (y(last) + fs * 0.35) + '" font-size="' + fs + '" fill="' + (me ? '#39ff88' : 'rgba(57,255,136,.8)') + '">' + esc(String(h.team).slice(0, 18)) + '</text>';
    });
    svg += '<line data-cross x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="rgba(255,204,51,.6)" visibility="hidden"/></svg>';
    box.innerHTML =
      '<div class="flex items-baseline justify-between gap-3 mb-2"><p class="label m-0">Score over time &middot; top ' + series.length + '</p>' +
        (clock.freeze && t1 === clock.freeze.getTime() ? '<span class="text-xs text-neon/40">until the freeze</span>' : '') + '</div>' +
      '<div class="relative" data-plot>' + svg +
        '<div data-tip class="absolute z-10 pointer-events-none bg-void border border-line px-3 py-2 text-xs text-neon/80 whitespace-nowrap" hidden></div></div>' +
      '<ul data-legend class="list-none p-0 m-0 mt-3 flex flex-wrap gap-x-4 gap-y-1.5 ' + (big ? 'text-base' : 'text-xs') + ' text-neon/75">' +
        series.map(function (h) {
          var me = String(h.team).toLowerCase() === mine;
          return '<li class="flex items-center gap-1.5 min-w-0"><span class="inline-block w-3 h-3 shrink-0" style="background:' + colorFor(h.team) + '"></span>' +
            '<span class="wrap-any' + (me ? ' text-neon font-bold' : '') + '">' + esc(h.team) + '</span></li>';
        }).join('') + '</ul>';
    // hover/touch: crosshair + every team's score at that moment
    var plot = $('[data-plot]', box), tip = $('[data-tip]', box), cross = $('[data-cross]', box);
    function scoreAt(h, t) { var sc = 0; h.points.forEach(function (p) { if (new Date(p.at).getTime() <= t) sc = Number(p.score); }); return sc; }
    function move(ev) {
      var r = plot.getBoundingClientRect(), px = ev.clientX - r.left;
      if (px < m.l || px > W - m.r) { leave(); return; }
      var t = t0 + (px - m.l) / (W - m.l - m.r) * (t1 - t0);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      var rows = series.map(function (h) { return { team: h.team, score: scoreAt(h, t) }; }).sort(function (a, b) { return b.score - a.score; });
      tip.innerHTML = '<p class="m-0 mb-1 text-neon/50">' + esc(new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</p>' +
        rows.map(function (row) {
          return '<p class="m-0 flex items-center gap-2"><span class="inline-block w-2.5 h-2.5" style="background:' + colorFor(row.team) + '"></span>' +
            '<span class="max-w-[10rem] truncate">' + esc(row.team) + '</span><b class="ml-auto pl-3 text-neon">' + row.score + '</b></p>';
        }).join('');
      tip.hidden = false;
      var left = px + 14; if (left + tip.offsetWidth > W) left = Math.max(0, px - 14 - tip.offsetWidth);
      tip.style.left = left + 'px'; tip.style.top = m.t + 'px';
    }
    function leave() { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); }
    plot.addEventListener('pointermove', move);
    plot.addEventListener('pointerdown', move);
    plot.addEventListener('pointerleave', leave);
  }

  function viewScoreboard(stale) {
    var tv = document.body.classList.contains('tv');
    var mine = myTeam() ? myTeam().name.toLowerCase() : null; // team names are unique ignoring case
    var big = tv;
    app.innerHTML = page(
      '<div class="flex flex-wrap items-end gap-x-6 gap-y-2 mb-6">' +
        '<div class="min-w-0">' + (tv
          ? '<h1 class="font-term text-4xl sm:text-6xl lg:text-7xl text-neon glow-green m-0 wrap-any">CYAI CTF SCOREBOARD</h1><p class="m-0 mt-1 text-base sm:text-xl text-neon/60 wrap-any">Play at <b class="text-amber">' + esc(location.host + location.pathname.replace(/index\.html$/, '')) + '</b></p>'
          : heading('Live feed', 'Scoreboard').replace('mb-6', 'mb-0')) + '</div>' +
        '<div class="sm:ml-auto text-right">' +
          (tv ? '<p id="sb-clock" class="m-0 font-term text-4xl text-alert"></p>' : '') +
          '<p id="sb-updated" class="m-0 text-xs uppercase tracking-widest text-neon/50" aria-live="polite"></p></div>' +
      '</div>' +
      '<div id="sb-freeze"></div>' +
      '<div class="' + (tv ? 'grid xl:grid-cols-2 gap-6 items-start' : '') + '">' +
        '<div id="sb" class="bg-panel border border-line box-glow"><p class="p-5 m-0 text-neon/50">Loading…</p></div>' +
        '<div id="sb-chart" class="bg-panel border border-line box-glow p-4 ' + (tv ? '' : 'mt-6') + '" hidden></div>' +
      '</div>' +
      (tv ? '<p class="mt-4 text-sm text-neon/30"><a href="#/scoreboard" class="underline">Exit projector mode</a></p>'
          : '<p class="mt-3 text-xs text-neon/40">Updates every 15 seconds. Ties go to the team that reached the score first. ' +
            'Tap a team to see its solves. Projector: <a href="#/scoreboard?tv=1" class="underline">full-screen mode</a>.</p>'),
      tv ? 'max-w-none' : 'max-w-4xl');

    var loaded = false, history = null;
    function tickClock() {
      var c = $('#sb-clock');
      if (c) c.textContent = clock.now() >= clock.end ? 'FINAL' : clock.now() < clock.start ? 'STARTS ' + fmtTime(clock.start) : timeLeftText() + ' LEFT';
      var f = freezeBanner(big), el = $('#sb-freeze');
      if (el && el.getAttribute('data-html') !== f) { el.innerHTML = f; el.setAttribute('data-html', f); }
    }
    async function load() {
      var rows;
      syncEvent();
      try { rows = await api.rpc('get_scoreboard'); }
      catch (e) {
        if (stale()) return;
        $('#sb-updated').textContent = 'Offline — retrying';
        if (!loaded) $('#sb').innerHTML = '<p class="p-5 m-0 msg-err">' + esc(friendly(e)) + '</p>';
        return;
      }
      if (stale()) return;
      loaded = true;
      rows = Array.isArray(rows) ? rows : [];
      tickClock();
      $('#sb-updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      if (!rows.length) { $('#sb').innerHTML = '<p class="p-5 m-0 text-neon/60">No teams yet. <a href="#/team" class="text-amber underline">Be the first.</a></p>'; }
      else {
        var shown = tv ? rows.slice(0, 15) : rows;
        var cell = tv ? 'p-3 sm:p-4 text-2xl' : 'p-3';
        $('#sb').innerHTML =
          '<table class="w-full text-left border-collapse table-fixed">' +
            '<thead><tr class="' + (tv ? 'text-base' : 'text-xs') + ' uppercase tracking-widest text-neon/50 border-b border-line">' +
              '<th class="p-3 ' + (tv ? 'w-20' : 'w-12') + '">#</th><th class="p-3">Team</th>' +
              '<th class="p-3 ' + (tv ? 'w-32' : 'w-20') + ' text-right">Pts</th><th class="p-3 w-20 text-right hidden sm:table-cell">Flags</th>' +
              '<th class="p-3 w-24 text-right hidden sm:table-cell">Agents</th></tr></thead><tbody>' +
            shown.map(function (r, i) {
              var me = mine && String(r.team).toLowerCase() === mine;
              return '<tr data-team-row' + (me ? ' data-mine' : '') + ' class="border-b border-line/60 ' + (me ? 'bg-neon/10 text-neon' : 'text-neon/80') + '">' +
                '<td class="' + cell + ' font-term ' + (tv ? 'text-4xl' : 'text-2xl') + ' ' + (i < 3 ? 'text-alert' : 'text-neon/50') + '">' + (i + 1) + '</td>' +
                '<td class="' + cell + ' font-bold wrap-any' + (me ? ' border-l-4 border-neon' : '') + '">' +
                  '<a href="' + esc(teamHref(r.team)) + '" class="hover:underline">' + esc(r.team) + '</a>' +
                  (me ? ' <span class="text-amber text-xs uppercase tracking-widest whitespace-nowrap">← you</span>' : '') +
                  '<span class="block sm:hidden text-xs font-normal text-neon/50">' + plural(r.solves, 'flag') + ' · ' + plural(r.members, 'agent') + '</span></td>' +
                '<td data-score class="' + cell + ' text-right font-term ' + (tv ? 'text-4xl' : 'text-2xl') + ' ' + (me ? 'glow-green' : '') + '">' + Number(r.score) + '</td>' +
                '<td class="' + cell + ' text-right hidden sm:table-cell">' + Number(r.solves) + '</td>' +
                '<td class="' + cell + ' text-right hidden sm:table-cell">' + Number(r.members) + '</td></tr>';
            }).join('') +
          '</tbody></table>' + (tv && rows.length > shown.length ? '<p class="p-3 m-0 text-neon/40">+ ' + (rows.length - shown.length) + ' more teams</p>' : '');
      }
      if (history !== false) {
        try { history = await api.rpc('get_score_history'); }
        catch (e) { if (isMissingFn(e)) history = false; } // needs migration 002
        if (stale()) return;
        if (history) renderChart($('#sb-chart'), history, mine, big);
      }
    }
    tickClock();
    load();
    every(1000, tickClock);
    every(15000, function () { if (!document.hidden) load(); });
    function onVisible() { if (!document.hidden) load(); }
    function onResize() { if (history) renderChart($('#sb-chart'), history, mine, big); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('resize', onResize);
    onLeave(function () { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('resize', onResize); });
  }

  // ------------------------------------------------------------------ announcements (every page)
  // Organizers add rows to the announcements table; everyone sees them within 30 seconds.
  var DISMISSED_KEY = 'cyai_dismissed_announcements';
  var announcements = [], announcementsOff = false;
  function dismissed() {
    try { return JSON.parse(localStorage.getItem(DISMISSED_KEY)) || []; } catch (e) { return []; }
  }
  function renderAnnouncements() {
    var box = $('#announce'), gone = dismissed();
    var list = announcements.filter(function (a) { return gone.indexOf(String(a.id)) < 0; });
    box.hidden = !list.length;
    var tone = { warning: 'border-alert/60 bg-alert/10 text-alert', success: 'border-neon/60 bg-neon/10 text-neon', info: 'border-amber/50 bg-amber/10 text-amber' };
    box.innerHTML = list.map(function (a) {
      return '<div data-announcement="' + esc(a.id) + '" role="status" class="border-b ' + (tone[a.level] || tone.info) + '">' +
        '<div class="max-w-6xl mx-auto px-4 py-2.5 flex items-start gap-3 text-sm">' +
          '<span class="shrink-0 font-extrabold uppercase tracking-widest text-xs pt-0.5">&#9656; Organizers</span>' +
          '<span data-announcement-text class="min-w-0 flex-1 wrap-any text-[#eafff2]"></span>' +
          '<span class="shrink-0 text-xs opacity-60 pt-0.5 hidden sm:inline">' + esc(fmtTime(a.created_at)) + '</span>' +
          '<button type="button" data-dismiss class="cyai-btn shrink-0 -my-1 px-2 text-lg leading-none" aria-label="Dismiss announcement">&times;</button>' +
        '</div></div>';
    }).join('');
    // the message is organizer-typed plain text: set it as text, never as HTML
    $$('[data-announcement]', box).forEach(function (el, i) {
      $('[data-announcement-text]', el).textContent = list[i].message;
      $('[data-dismiss]', el).addEventListener('click', function () {
        var ids = dismissed().concat(String(list[i].id)).slice(-50);
        try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)); } catch (e) { /* private mode: hide for now only */ }
        announcements = announcements.filter(function (a) { return a.id !== list[i].id; });
        renderAnnouncements();
      });
    });
  }
  async function pollAnnouncements() {
    if (announcementsOff || document.hidden) return;
    try {
      var r = await api.rpc('get_announcements');
      announcements = Array.isArray(r) ? r : [];
      renderAnnouncements();
    } catch (e) { if (isMissingFn(e)) announcementsOff = true; } // needs migration 002
  }

  // ------------------------------------------------------------------ boot
  if (sb) {
    sb.auth.onAuthStateChange(function (event) {
      // don't call Supabase inside this callback (supabase-js docs); defer instead
      if (event === 'SIGNED_OUT') setTimeout(function () { status = { signed_in: false }; adminChecked = false; isAdmin = false; var na = $('#nav-admin'); if (na) na.hidden = true; renderNav(); }, 0);
    });
  }
  renderDemoBanner();
  renderNav();
  window.addEventListener('hashchange', route);
  syncEvent(true).then(function () { route(); pollAnnouncements(); });
  setInterval(pollAnnouncements, 30000);
  document.addEventListener('visibilitychange', pollAnnouncements);
  window.CTF = { demo: DEMO, clock: clock }; // handy for organizers poking around in the console
})();
