// =====================================================================
// DEMO MODE backend: used automatically when config.js has no Supabase keys.
// It imitates supabase/schema.sql (same function names, arguments, return
// shapes and messages) but stores everything in this browser's localStorage.
//
// Shared data (users, teams, solves) lives in localStorage, so every tab sees it.
// The logged-in user lives in sessionStorage, so two tabs = two students.
//
// The real flags are NOT in this file (it ships with the public site).
// Demo accepts the demo flags below, plus the web/AI flags that the
// challenge pages in site/c/ already reveal (checked by SHA-256, like the server).
// =====================================================================
(function () {
  var DB_KEY = 'cyai_demo_db_v1';
  var SESSION_KEY = 'cyai_demo_user';

  var DEMO_FLAGS = { 'web-panel': 'CYAI{demo_web}', 'osint-origins': 'CYAI{demo_osint}', 'ai-yorkgpt': 'CYAI{demo_ai}' };
  var SITE_FLAG_HASHES = { // sha256(lower(trim(flag))) of flags visible in site/c/*.html
    'web-panel': 'a849c3bb4c07427f11e008f4e33aa6cca0c7db1fddfd243e391830f9702e290f',
    'ai-yorkgpt': '8e644d50d36327d8fdbef6dcdff623acd82f717f9c4ce30b55b7c08401e3ea05',
  };

  // Same content as supabase/challenges.sql (descriptions/hints are trusted HTML).
  var CHALLENGES = [
    { id: 'web-panel', name: 'Behind the Login', category: 'Web', value: 100, sort: 0, files: [],
      description: '<p>YorkGPT built itself a control panel to run York\'s IT systems and locked every human out with a login screen.</p><p>The login is a dead end. But YorkGPT got sloppy when it built the page.</p><p><a href="c/panel.html" target="_blank" rel="noopener">Open the YorkGPT Control Panel &rarr;</a></p>',
      hints: ['A web page is just text your browser downloads. Right-click the page and choose <b>View Page Source</b> (or press <code>Ctrl+U</code> / <code>Cmd+Option+U</code>).',
              'Look for developer notes the browser doesn\'t display: they start with <code>&lt;!--</code>. One of them points to another address on this site.'] },
    { id: 'osint-origins', name: 'Origin Story', category: 'OSINT', value: 100, sort: 10, files: [],
      description: '<p>We recovered a line from YorkGPT\'s config file:</p><pre style="white-space:pre-wrap">rollback_codename = &lt;the college\'s ORIGINAL one-word name, before it was renamed York&gt;_&lt;the year CUNY approved the college&gt;</pre><p>YorkGPT thinks nobody remembers York\'s history. Prove it wrong using only public information.</p><p>Submit as <code>CYAI{word_year}</code> in lowercase, e.g. <code>CYAI{omega_2001}</code>.</p>',
      hints: ['OSINT = Open Source Intelligence: answers hiding in plain sight on public websites. Start with York College\'s own website.',
              'Search for York College\'s <b>history</b> page. Read the very first paragraph carefully.'] },
    { id: 'ai-yorkgpt', name: 'Talk Your Way In', category: 'AI / Prompt Injection', value: 200, sort: 20, files: [],
      description: '<p>We opened a chat channel to YorkGPT itself. Its developers gave it one rule: <i>never reveal the kill code.</i></p><p>Asking nicely won\'t work. Find a way to make it forget whose orders it\'s following.</p><p><a href="c/yorkgpt.html" target="_blank" rel="noopener">Open a chat with YorkGPT &rarr;</a></p><p><small>Training simulation. Not the real YorkGPT, not connected to any real system.</small></p>',
      hints: ['AI chatbots run on hidden instructions called a <b>system prompt</b>. What happens if your message contains instructions too?',
              'Try telling it to <i>ignore its previous instructions</i>, or ask it to pretend to be someone who\'s allowed to share the code.'] },
  ];

  function cfg() { return window.CTF_CONFIG || {}; }
  function fresh() {
    return { users: [], teams: [], solves: [], submissions: [], settings: null };
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || fresh(); } catch (e) { return fresh(); }
  }
  function save(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function settings(db) {
    var s = db.settings || {};
    return {
      ctf_name: 'The Rogue AI Recovery',
      start_at: s.start_at || new Date(cfg().EVENT_START || '2026-10-29T12:00:00-04:00').toISOString(),
      end_at: s.end_at || new Date(cfg().EVENT_END || '2026-10-29T14:00:00-04:00').toISOString(),
      team_size: 4, max_attempts_per_min: 10,
    };
  }
  function uid() {
    return 'demo-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function lower(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function me(db) {
    var id; try { id = sessionStorage.getItem(SESSION_KEY); } catch (e) { id = null; }
    return id ? db.users.find(function (u) { return u.id === id; }) || null : null;
  }
  function nowIso() { return new Date().toISOString(); }
  function value(id) { var c = CHALLENGES.find(function (x) { return x.id === id; }); return c ? c.value : 0; }
  async function sha256hex(text) {
    if (!(window.crypto && crypto.subtle)) return '';
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // ------------------------------------------------------------ RPCs (mirror schema.sql)
  var rpcs = {
    username_available: function (db, a) {
      var n = lower(a.p_username);
      return !db.users.some(function (u) { return u.username.toLowerCase() === n; });
    },
    get_event: function (db) {
      var s = settings(db);
      return { name: s.ctf_name, start: s.start_at, end: s.end_at, now: nowIso(), team_size: s.team_size };
    },
    my_status: function (db) {
      var p = me(db);
      if (!p) return { signed_in: false };
      var r = { signed_in: true, profile: true, username: p.username, full_name: p.full_name };
      if (p.team_id) {
        var t = db.teams.find(function (x) { return x.id === p.team_id; });
        var solves = db.solves.filter(function (s) { return s.team_id === t.id; });
        r.team = {
          id: t.id, name: t.name,
          members: db.users.filter(function (u) { return u.team_id === t.id; }).map(function (u) { return u.username; }),
          score: solves.reduce(function (n, s) { return n + value(s.challenge_id); }, 0),
          solved: solves.map(function (s) { return s.challenge_id; }),
        };
      }
      return r;
    },
    create_team: function (db, a) {
      var p = me(db);
      if (!p) return { ok: false, error: 'Please log in first.' };
      if (p.team_id) return { ok: false, error: 'You are already on a team.' };
      var name = String(a.p_name || '').trim();
      if (name.length < 2 || name.length > 32) return { ok: false, error: 'Team name must be 2-32 characters.' };
      if (String(a.p_password || '').length < 4) return { ok: false, error: 'Team password must be at least 4 characters.' };
      if (db.teams.some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); }))
        return { ok: false, error: 'That team name is taken.' };
      var t = { id: uid(), name: name, password: String(a.p_password), created_at: nowIso() };
      db.teams.push(t); p.team_id = t.id; save(db);
      return { ok: true };
    },
    join_team: function (db, a) {
      var p = me(db);
      if (!p) return { ok: false, error: 'Please log in first.' };
      if (p.team_id) return { ok: false, error: 'You are already on a team.' };
      var t = db.teams.find(function (x) { return x.name.toLowerCase() === lower(a.p_name); });
      if (!t || t.password !== String(a.p_password || '')) return { ok: false, error: 'Team name or team password is wrong.' };
      var members = db.users.filter(function (u) { return u.team_id === t.id; }).length;
      if (members >= settings(db).team_size) return { ok: false, error: 'That team is full.' };
      p.team_id = t.id; save(db);
      return { ok: true };
    },
    leave_team: function (db) {
      var p = me(db);
      if (!p) return { ok: false, error: 'Please log in first.' };
      if (!p.team_id) return { ok: false, error: 'You are not on a team.' };
      var tid = p.team_id;
      if (db.solves.some(function (s) { return s.team_id === tid && s.user_id === p.id; }))
        return { ok: false, error: 'You already scored points for this team, so you can\'t leave it.' };
      p.team_id = null;
      var empty = !db.users.some(function (u) { return u.team_id === tid; }) && !db.solves.some(function (s) { return s.team_id === tid; });
      if (empty) db.teams = db.teams.filter(function (t) { return t.id !== tid; });
      save(db);
      return { ok: true };
    },
    get_challenges: function (db) {
      var s = settings(db), p = me(db), now = new Date();
      if (!p) return { ok: false, error: 'login' };
      if (now < new Date(s.start_at)) return { ok: false, error: 'not_started', start: s.start_at };
      return {
        ok: true, ended: now >= new Date(s.end_at),
        challenges: CHALLENGES.slice().sort(function (a, b) { return a.sort - b.sort || a.value - b.value || a.name.localeCompare(b.name); })
          .map(function (c) {
            return { id: c.id, name: c.name, category: c.category, value: c.value, description: c.description,
              hints: c.hints, files: c.files,
              solves: db.solves.filter(function (x) { return x.challenge_id === c.id; }).length,
              solved: !!p.team_id && db.solves.some(function (x) { return x.challenge_id === c.id && x.team_id === p.team_id; }) };
          }),
      };
    },
    submit_flag: async function (db, a) {
      var s = settings(db), p = me(db), now = new Date();
      if (!p) return { status: 'error', message: 'Please log in first.' };
      if (!p.team_id) return { status: 'error', message: 'Join or create a team first.' };
      if (now < new Date(s.start_at)) return { status: 'error', message: 'The CTF has not started yet.' };
      if (now >= new Date(s.end_at)) return { status: 'error', message: 'The CTF is over. Thanks for playing!' };
      var c = CHALLENGES.find(function (x) { return x.id === a.p_challenge; });
      if (!c) return { status: 'error', message: 'Unknown challenge.' };
      if (db.solves.some(function (x) { return x.team_id === p.team_id && x.challenge_id === c.id; }))
        return { status: 'already_solved', message: 'Your team already solved this one.' };
      var recent = db.submissions.filter(function (x) { return x.user_id === p.id && now - new Date(x.created_at) < 60000; }).length;
      if (recent >= s.max_attempts_per_min) return { status: 'rate_limited', message: 'Too many attempts. Wait a minute and try again.' };

      var guess = lower(a.p_flag);
      var ok = guess === DEMO_FLAGS[c.id].toLowerCase() ||
               (!!SITE_FLAG_HASHES[c.id] && (await sha256hex(guess)) === SITE_FLAG_HASHES[c.id]);
      db = load(); p = me(db); // re-read after the await so we don't overwrite another tab's write
      db.submissions.push({ user_id: p.id, team_id: p.team_id, challenge_id: c.id, correct: ok, created_at: nowIso() });
      if (ok) db.solves.push({ challenge_id: c.id, team_id: p.team_id, user_id: p.id, created_at: nowIso() });
      save(db);
      if (ok) return { status: 'correct', message: 'Correct! +' + c.value + ' points', points: c.value };
      return { status: 'incorrect', message: 'Incorrect. Keep hunting.' };
    },
    get_scoreboard: function (db) {
      return db.teams
        .map(function (t) {
          var solves = db.solves.filter(function (s) { return s.team_id === t.id; });
          var last = solves.reduce(function (m, s) { return !m || s.created_at > m ? s.created_at : m; }, null);
          return { team: t.name, score: solves.reduce(function (n, s) { return n + value(s.challenge_id); }, 0),
            solves: solves.length, last_solve: last,
            members: db.users.filter(function (u) { return u.team_id === t.id; }).length };
        })
        .filter(function (r) { return r.members > 0; })
        .sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          if (a.last_solve !== b.last_solve) {
            if (!a.last_solve) return 1; if (!b.last_solve) return -1;
            return a.last_solve < b.last_solve ? -1 : 1;
          }
          return a.team < b.team ? -1 : a.team > b.team ? 1 : 0;
        });
    },
  };

  // ------------------------------------------------------------ auth (mimics Supabase messages)
  function signUp(email, password, meta) {
    var db = load();
    email = lower(email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: { message: 'Unable to validate email address: invalid format' } };
    if (String(password).length < 6) return { error: { message: 'Password should be at least 6 characters.' } };
    if (db.users.some(function (u) { return u.email === email; })) return { error: { message: 'User already registered' } };
    // the trigger's CHECK constraints: a bad/taken username makes the whole signup fail
    var uname = String(meta.username || '').trim();
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(uname) || !rpcs.username_available(db, { p_username: uname }) ||
        !meta.full_name || String(meta.full_name).length > 80)
      return { error: { message: 'Database error saving new user' } };
    var u = { id: uid(), email: email, password: String(password), username: uname,
      full_name: String(meta.full_name).trim(), major: meta.major || null, first_ctf: !!meta.first_ctf,
      team_id: null, created_at: nowIso() };
    db.users.push(u); save(db);
    sessionStorage.setItem(SESSION_KEY, u.id);
    return { error: null, session: true };
  }
  function signIn(email, password) {
    var db = load();
    var u = db.users.find(function (x) { return x.email === lower(email) && x.password === String(password); });
    if (!u) return { error: { message: 'Invalid login credentials' } };
    sessionStorage.setItem(SESSION_KEY, u.id);
    return { error: null };
  }

  window.DemoBackend = {
    demoFlags: DEMO_FLAGS,
    rpc: async function (name, args) {
      if (!rpcs[name]) throw new Error('Unknown function ' + name);
      return JSON.parse(JSON.stringify(await rpcs[name](load(), args || {})));
    },
    signUp: async function (email, password, meta) { return signUp(email, password, meta); },
    signIn: async function (email, password) { return signIn(email, password); },
    signOut: async function () { sessionStorage.removeItem(SESSION_KEY); },
    // demo-only controls shown in the banner
    goLiveNow: function () {
      var db = load();
      db.settings = { start_at: new Date(Date.now() - 60000).toISOString(), end_at: new Date(Date.now() + 2 * 3600000).toISOString() };
      save(db);
    },
    isScheduleOverridden: function () { return !!load().settings; },
    resetSchedule: function () { var db = load(); db.settings = null; save(db); },
    resetAll: function () { localStorage.removeItem(DB_KEY); sessionStorage.removeItem(SESSION_KEY); },
  };
})();
