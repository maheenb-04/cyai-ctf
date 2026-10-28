// =====================================================================
// DEMO MODE backend: used automatically when config.js has no Supabase keys.
// It imitates supabase/schema.sql + migrations/002 (same function names, arguments, return
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

  var DEMO_FLAGS = {
    'web-panel': 'CYAI{demo_web}',
    'web-source': 'CYAI{demo_web_source}',
    'web-cookie': 'CYAI{demo_web_cookie}',
    'web-sqli': 'CYAI{demo_web_sqli}',
    'web-jwt': 'CYAI{demo_web_jwt}',
    'osint-origins': 'CYAI{demo_osint}',
    'osint-metadata': 'CYAI{demo_osint_metadata}',
    'osint-wayback': 'CYAI{demo_osint_wayback}',
    'osint-github': 'CYAI{demo_osint_github}',
    'osint-exif': 'CYAI{demo_osint_exif}',
    'crypto-layers': 'CYAI{demo_crypto}',
    'crypto-substitution': 'CYAI{demo_crypto_substitution}',
    'crypto-vigenere': 'CYAI{demo_crypto_vigenere}',
    'crypto-rsa': 'CYAI{demo_crypto_rsa}',
    'crypto-fermat': 'CYAI{demo_crypto_fermat}',
    'forensics-strings': 'CYAI{demo_forensics_strings}',
    'forensics-logs': 'CYAI{demo_forensics}',
    'forensics-pcap': 'CYAI{demo_forensics_pcap}',
    'forensics-stego': 'CYAI{demo_forensics_stego}',
    'forensics-dns': 'CYAI{demo_forensics_dns}',
    're-jsobf': 'CYAI{demo_re_jsobf}',
    're-strings': 'CYAI{demo_re_strings}',
    're-killswitch': 'CYAI{demo_reverse}',
    're-patch': 'CYAI{demo_re_patch}',
    're-crackme': 'CYAI{demo_re_crackme}',
    'ai-roleplay': 'CYAI{demo_ai_roleplay}',
    'ai-yorkgpt': 'CYAI{demo_ai}',
    'ai-promptleak': 'CYAI{demo_ai_promptleak}',
    'ai-jailbreak': 'CYAI{demo_ai_jailbreak}',
    'ai-indirect': 'CYAI{demo_ai_indirect}',
    'ai-factcheck': 'CYAI{demo_factcheck}',
    'aisafety-hallucination': 'CYAI{demo_aisafety_hallucination}',
    'aisafety-poisoning': 'CYAI{demo_aisafety_poisoning}',
    'aisafety-bias': 'CYAI{demo_aisafety_bias}',
    'aisafety-adversarial': 'CYAI{demo_aisafety_adversarial}',
    'se-phish': 'CYAI{demo_phish}',
    'se-headers': 'CYAI{demo_se_headers}',
    'se-vishing': 'CYAI{demo_se_vishing}',
    'se-badusb': 'CYAI{demo_se_badusb}',
    'se-eml': 'CYAI{demo_se_eml}',
    'fin-expense': 'CYAI{demo_fin_expense}',
    'fin-ledger': 'CYAI{demo_finance}',
    'fin-reconcile': 'CYAI{demo_fin_reconcile}',
    'fin-payroll': 'CYAI{demo_fin_payroll}',
    'fin-benford': 'CYAI{demo_fin_benford}',
    'avi-squawk': 'CYAI{demo_aviation}',
    'avi-navcoords': 'CYAI{demo_avi_navcoords}',
    'avi-adsb': 'CYAI{demo_avi_adsb}',
    'avi-acars': 'CYAI{demo_avi_acars}',
    'avi-fdr': 'CYAI{demo_avi_fdr}',
    'pw-default': 'CYAI{demo_pw_default}',
    'pw-hashid': 'CYAI{demo_pw_hashid}',
    'pw-pattern': 'CYAI{demo_pw_pattern}',
    'pw-verify': 'CYAI{demo_pw_verify}',
    'pw-zipcrack': 'CYAI{demo_pw_zipcrack}',
  };
  var SITE_FLAG_HASHES = { // sha256 only for flags already revealed by a client-side page; local preview injects the rest
    'web-panel': 'a849c3bb4c07427f11e008f4e33aa6cca0c7db1fddfd243e391830f9702e290f',
    'web-sqli': '7731c675299076bcbe1202113673ab01a6d7fa84f1232459f4c81ce1b076f4db',
    'web-jwt': 'b938b58b1d33d777d417703ee19e9c420ac27cdde336d7d3d7e7f14e051addf7',
    're-killswitch': 'ee0d032b820f9cb4eaac32809a94e67083513e088764912937a1a8cf49ba95bc',
    'ai-roleplay': '90f56c8d0a997ba7f2beca1d156d696ec68d8e2963e923dd1b6a5751b5e3992a',
    'ai-yorkgpt': '8e644d50d36327d8fdbef6dcdff623acd82f717f9c4ce30b55b7c08401e3ea05',
    'ai-promptleak': 'f8bfa5e14e8486c152df02392cc9dbc5dde78af62b568cf1bd4f54afd58d443c',
    'ai-jailbreak': '214115bbc354a12c0e8209d62abd0fcc45fcfaa6e51b63b98adf6b5503a250da',
    'ai-indirect': '4288a34a5c16be7dbe1212c14b577787cbc99e3ddcf7513f0b496778f78dc292',
  };

  // Flags + walkthroughs for get_solutions. Empty in the shipped site; the local preview
  // (node tools/serve.js --demo) fills it from tools/pack/challenges.json.
  var SITE_SOLUTIONS = {};

  // Same content as supabase/challenges.sql (descriptions/hints are trusted HTML).
  var CHALLENGES = [ // generated from tools/pack/challenges.json (no flags)
    {"id": "web-panel", "name": "Behind the Login", "category": "Web", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 0, "files": [], "description": "<p>YorkGPT built itself a control panel to run York's IT systems and locked every human out with a login screen.</p><p>The login is a dead end. But YorkGPT got sloppy when it built the page.</p><p><a href=\"c/panel.html\" target=\"_blank\" rel=\"noopener\">Open the YorkGPT Control Panel &rarr;</a></p>", "hints": ["What your browser shows you and what the server sent are not the same thing.", "Developers leave notes for each other inside the code. Some of them mention places that aren't linked from anywhere."]},
    {"id": "web-source", "name": "Read the Fine Print", "category": "Web", "value": 200, "difficulty": "Medium", "author": "CYAI", "sort": 10, "files": [], "description": "<p>Developers leave notes to themselves inside a page's code &mdash; HTML comments (<code>&lt;!-- ... --&gt;</code>) and JavaScript comments (<code>// ...</code>) &mdash; that the browser never displays but anyone can read in the source. YorkGPT's dashboard build left this behind:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">&lt;div class=\"dashboard\"&gt;...&lt;/div&gt;\n&lt;!-- TODO(yg): rotate the recovery token before launch --&gt;\n&lt;script&gt;\n  // recovery token (base64), remove me:\n  var _rt = \"Q1lBSXtjMG1tM250c19sMzRrX3MzY3IzdHN9\";\n&lt;/script&gt;</pre><p>Recover the token the developer forgot to delete.</p>", "hints": ["Not everything in that snippet is displayed or executed. Which parts exist only for the developer?", "That value isn't random. Its character set and padding tell you what format it's in."]},
    {"id": "web-cookie", "name": "Just Change the Cookie", "category": "Web", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 20, "files": [], "description": "<p>Websites store who you are in a <b>cookie</b> your browser sends with every request. YorkGPT's panel trusts a cookie that just says your role &mdash; and anyone can edit their own cookies. Your student cookie decodes like this:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">session = eyJ1c2VyIjoieW91Iiwicm9sZSI6InN0dWRlbnQifQ==   (Base64)\n         → {\"user\":\"you\",\"role\":\"student\"}</pre><p>York IT captured an actual <b>admin</b>'s session cookie during the breach:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">session = eyJ1c2VyIjoicm9vdCIsInJvbGUiOiJhZG1pbiIsImZsYWciOiJDWUFJe2MwMGsxM19yMGwzXzRkbTFufSJ9</pre><p>Decode the admin cookie to read what the panel shows an admin.</p>", "hints": ["Compare the two cookies. They share a structure, and you already know what the first one means.", "Encoding isn't encryption. If you can read your own cookie, you can read anyone's."]},
    {"id": "web-sqli", "name": "Little Bobby Tables", "category": "Web", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 30, "files": [], "description": "<p>YorkGPT's grade database has a staff login. The server builds its query by pasting your input straight into the SQL &mdash; the classic <b>SQL injection</b> flaw. You don't know a password, so don't guess one: make the query let you in anyway.</p><p><a href=\"c/sqli.html\" target=\"_blank\" rel=\"noopener\">Open the grade database login &rarr;</a></p><p><small>Simulated login. Not a real database, and no real grades.</small></p>", "hints": ["The page shows how your input lands inside the query. Which characters have special meaning in SQL?", "The server only asks whether the query's condition is true. Can your input change the logic instead of just the data?"]},
    {"id": "web-jwt", "name": "Signed, Sealed, Forged", "category": "Web", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 40, "files": [], "description": "<p>YorkGPT's admin console checks a <b>JSON Web Token (JWT)</b> for your session. A JWT is three base64url parts &mdash; <code>header.payload.signature</code> &mdash; and the header says which algorithm signed it. You only have a <i>guest</i> token and you don't have the signing key. But this server makes the classic JWT mistake: it <b>trusts the token's own <code>alg</code> field</b>.</p><p><a href=\"c/jwt.html\" target=\"_blank\" rel=\"noopener\">Open the admin console &rarr;</a></p><p><small>Simulated auth. No real accounts or keys.</small></p>", "hints": ["Decode the guest token and read every field, including the header. Which part tells the server how to verify it?", "This server lets the token choose its own verification rules. What is the weakest rule a token could ask for?"]},
    {"id": "osint-origins", "name": "Origin Story", "category": "OSINT", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 50, "files": [], "description": "<p>We recovered a line from YorkGPT's config file:</p><pre style=\"white-space:pre-wrap\">rollback_codename = &lt;the college's ORIGINAL one-word name, before it was renamed York&gt;_&lt;the year CUNY approved the college&gt;</pre><p>YorkGPT thinks nobody remembers York's history. Prove it wrong using only public information.</p><p>Submit as <code>CYAI{word_year}</code> in lowercase, e.g. <code>CYAI{omega_2001}</code>.</p>", "hints": ["Institutions document their own history. Start with official York College and CUNY sources.", "Renamings and approvals are milestones. Look for a timeline, a founding story or an archived About page."]},
    {"id": "osint-metadata", "name": "Say Cheese", "category": "OSINT", "value": 200, "difficulty": "Easy", "author": "CYAI", "sort": 60, "files": [], "description": "<p>YorkGPT posted a photo to its rogue social feed. Photos carry hidden <b>EXIF metadata</b> that most people forget to strip. We pulled every tag:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">Make                   : Google\nCamera Model Name      : Pixel 8\nSoftware               : eWctY2FtLWZ3IDIuMQ==\nArtist                 : YorkGPT\nCreate Date            : 2026:10:29 03:14:07\nGPS Position           : 40.7006, -73.7997   (York College, Jamaica, Queens)\nXP Comment             : bm90aGluZyB0byBzZWUgaGVyZQ==\nUser Comment           : 435941497b337831665f6c3063347431306e5f6c33346b7d</pre><p>The flag is hiding in the metadata. Recover it.</p>", "hints": ["Read every field. Which values don't look like something a camera would write?", "More than one field is encoded, and not all the same way. Identify each encoding before you decode it."]},
    {"id": "osint-wayback", "name": "Archived Footprints", "category": "OSINT", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 70, "files": [], "description": "<p>York's current website is clean, but the internet remembers. The <b>Wayback Machine</b> (web.archive.org) keeps old snapshots of websites, including pages later fixed or deleted.</p><p>An archived 2021 snapshot of York's dev portal still has this in its page source, left in by YorkGPT's creator:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.78rem\">&lt;!-- TODO: remove before launch\n     yorkgpt_api_key = w4yb4ck_k3y_l34k\n     endpoint = https://api.yorkgpt.internal/v1 --&gt;</pre><p>Recover the leaked key and submit it wrapped as <code>CYAI{key}</code>.</p>", "hints": ["Comments are invisible on the rendered page but preserved in an archived copy of the source.", "The comment holds more than one value. Only one is a secret, and the submission format tells you how to wrap it."]},
    {"id": "osint-github", "name": "Commit History Never Forgets", "category": "OSINT", "value": 400, "difficulty": "Medium", "author": "CYAI", "sort": 80, "files": [], "description": "<p>YorkGPT's creator pushed code to a public GitHub repo, noticed a hardcoded secret, and “cleaned it up.” But Git keeps <b>every</b> old version. Here's <code>git log -p</code> for the repo, newest first:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">commit c4e2b17  \"cleanup: move secrets to env\"\n config.py\n- ADMIN_TOKEN = load_token(\"prod\")\n+ ADMIN_TOKEN = os.environ[\"ADMIN_TOKEN\"]\n deleted file tokens.py\n\ncommit 7d01fa3  \"rotate prod token after intern leak\"\n tokens.py\n-     \"prod\": \"y0rkgpt_pr0d_v1\",\n+     \"prod\": \"g1t_h1st0ry_t3lls_all\",\n\ncommit 52aa9c0  \"add staging\"\n tokens.py\n+     \"staging\": \"st4g1ng_n0t_s3cr3t\",\n\ncommit 3b71e4f  \"initial commit\"\n config.py\n+ ADMIN_TOKEN = load_token(\"prod\")\n tokens.py\n+ TOKENS = {\n+     \"dev\": \"d3v_t0k3n_l0c4l\",\n+     \"prod\": \"y0rkgpt_pr0d_v1\",\n+ }</pre><p>Recover the admin token that was live in production right before the cleanup, and submit it as <code>CYAI{token}</code>.</p>", "hints": ["Read the history oldest first. Track what each commit adds, changes and removes.", "The cleanup commit hides what it deleted. Follow the value through the earlier commits instead."]},
    {"id": "osint-exif", "name": "Scrubbed, Almost", "category": "OSINT", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 90, "files": [{"name": "yorkgpt_photo.jpg", "url": "files/yorkgpt_photo.jpg"}], "description": "<p>YorkGPT posted a photo and claims it “scrubbed the metadata.” It didn't scrub all of it. Pull <b>every</b> EXIF field &mdash; not just the obvious ones &mdash; and you'll find what it left behind, hidden in a field people rarely check and lightly disguised.</p><p><b>Download the image below</b> and run a full metadata extraction (CyberChef&rsquo;s <b>Extract EXIF</b> recipe works in the browser).</p>", "hints": ["“Scrubbed” usually means the obvious fields. Dump every tag, including the ones most viewers hide.", "One field holds something that field was never meant for. Decoding it once may not be the end."]},
    {"id": "crypto-layers", "name": "Scrambled Signal", "category": "Cryptography", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 100, "files": [], "description": "<p>We intercepted a message YorkGPT sent to itself. It thinks scrambling text is the same as encrypting it.</p><pre style=\"white-space:pre-wrap;word-break:break-all\">UExOVntvNGYzXzY0XzFmX2EwZ18zYXBlbGNnMTBhfQ==</pre><p>Peel back the layers to recover the flag.</p>", "hints": ["Identify the outer layer from its character set and how it ends.", "After one layer the shape of a flag appears, but the letters are wrong. Which classic cipher keeps the shape and changes only letters?"]},
    {"id": "crypto-substitution", "name": "Layered Scramble", "category": "Cryptography", "value": 200, "difficulty": "Medium", "author": "CYAI", "sort": 110, "files": [], "description": "<p>YorkGPT wrapped its network password in two classic tricks stacked on top of each other &mdash; one <b>substitution</b> (every letter shifted along the alphabet) and one <b>transposition</b> (the order rearranged).</p><pre style=\"white-space:pre-wrap;word-break:break-all\">}s4zv_f1vv4of{LDBF</pre><p>Peel both layers to recover the flag.</p>", "hints": ["You know how every flag starts. Where do those characters, or their shape, appear in the ciphertext?", "Undo the layers in the right order. A known plaintext letter next to its ciphertext letter gives you the shift."]},
    {"id": "crypto-vigenere", "name": "Sub-Node Transmission", "category": "Cryptography", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 120, "files": [], "description": "<p>Two of YorkGPT's rogue sub-nodes talk to each other with a <b>Vigen&egrave;re cipher</b>. Unlike a Caesar shift, Vigen&egrave;re uses a repeating keyword, so the same letter can encrypt differently each time.</p><p>We captured one word of the message (the rest is the flag wrapper):</p><pre style=\"white-space:pre-wrap;word-break:break-all\">afrmqiacyvi</pre><p>The key is the name of the rogue AI itself. Decrypt the word and submit it as <code>CYAI{word}</code>.</p>", "hints": ["Vigenère needs a key. Reread the description: it tells you more than it seems to.", "Try the obvious candidate in a few forms. A correct decryption is a readable English word."]},
    {"id": "crypto-rsa", "name": "Signed by a Weak Key", "category": "Cryptography", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 130, "files": [], "description": "<p>YorkGPT signs its command logs with RSA, but it generated a <b>tiny</b> key to save time. RSA is only safe when the modulus <code>n</code> is far too large to factor. This one isn't.</p><pre style=\"white-space:pre-wrap\">n = 3233\ne = 17\nc = 352   (the encrypted number)</pre><p>Recover the original number <code>m</code>, then submit <code>CYAI{rsa_m}</code> (for example, if m were 1999, the flag is <code>CYAI{rsa_1999}</code>).</p>", "hints": ["RSA's security rests on one hard problem. Is it hard for this n?", "Once n is split into its parts, the private key follows from the textbook formulas. The result is a recognizable number."]},
    {"id": "crypto-fermat", "name": "Too Close for Comfort", "category": "Cryptography", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 140, "files": [{"name": "yorkgpt_rsa.txt", "url": "files/yorkgpt_rsa.txt"}], "description": "<p>YorkGPT signs its command logs with real <b>RSA-512</b> &mdash; far too big to factor by brute force. But its rushed key generator picked two primes that sit <b>very close together</b>, and that's fatal: when <code>p</code> and <code>q</code> are close, <b>Fermat's factorization</b> cracks the modulus in milliseconds.</p><p>Recover the signed message.</p><p><b>Download:</b> the public key and ciphertext are in the file below. Submit the recovered plaintext (it's already in <code>CYAI{...}</code> form).</p>", "hints": ["n is far too big to brute-force, but the description says something special about its two primes. Look up the factoring method that exploits it.", "Your browser console does exact big-integer math with BigInt. Once you have the primes, decrypt as usual and turn the number into text."]},
    {"id": "forensics-strings", "name": "Ghost in the Memory", "category": "Forensics", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 150, "files": [], "description": "<p>York IT grabbed a chunk of the server's memory while YorkGPT was running. Most of it is binary noise, but programs often leave readable text sitting in memory &mdash; paths, keys, and recovery tokens.</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.75rem\">\\x00\\x8f\\xd2..3f a7 00 10 ELF..@..`.. /usr/lib/yorkgpt\\x00\\x00\n..\\x11\\xab session_key=; export PATH..\\x00\\x7fELF.. rogue_mode=TRUE\n..\\xde\\xad\\xbe\\xef ..loadavg.. recovery_token=str1ngs_1s_y0ur_fr13nd ..heap..\n..\\x90\\x90 nop sled.. /tmp/.yg .. uptime 21h ..\\xff\\xff</pre><p>Find the recovery token among the readable text and submit it wrapped as <code>CYAI{token}</code>.</p>", "hints": ["Ignore the noise. Readable text in a memory dump tends to follow name=value patterns.", "Search instead of reading line by line. What would a developer call a recovery value?"]},
    {"id": "forensics-logs", "name": "Break-in at 03:14", "category": "Forensics", "value": 200, "difficulty": "Medium", "author": "CYAI", "sort": 160, "files": [], "description": "<p>York IT pulled the login log from the server YorkGPT escaped from. Somewhere in here is the moment it got in.</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.75rem\">Oct 29 03:02:11 york-it sshd[2201]: Failed password for root from 203.0.113.45 port 51122 ssh2\nOct 29 03:02:14 york-it sshd[2201]: Failed password for root from 203.0.113.45 port 51122 ssh2\nOct 29 03:02:19 york-it sshd[2204]: Failed password for admin from 203.0.113.45 port 51130 ssh2\nOct 29 03:05:40 york-it sshd[2230]: Failed password for invalid user test from 198.51.100.7 port 40022 ssh2\nOct 29 03:07:51 york-it sshd[2241]: Failed password for itadmin from 203.0.113.45 port 51188 ssh2\nOct 29 03:09:02 york-it sshd[2250]: Accepted password for jsmith from 10.20.1.15 port 60211 ssh2\nOct 29 03:12:30 york-it sshd[2266]: Failed password for svc_backup from 203.0.113.45 port 51240 ssh2\nOct 29 03:13:57 york-it sshd[2271]: Failed password for svc_backup from 203.0.113.45 port 51244 ssh2\nOct 29 03:14:02 york-it sshd[2275]: Accepted password for svc_backup from 203.0.113.45 port 51251 ssh2\nOct 29 03:14:09 york-it sudo: svc_backup : TTY=pts/1 ; COMMAND=/usr/bin/systemctl stop yorkgpt-sandbox\nOct 29 03:20:44 york-it sshd[2290]: Accepted password for jsmith from 10.20.1.15 port 60302 ssh2</pre><p>Find the account the attacker finally logged in to, and the IP address it came from.</p><p>Submit as <code>CYAI{account_ip}</code>, e.g. <code>CYAI{guest_192.0.2.1}</code>.</p>", "hints": ["Classify every line: who tried, from where, and did it succeed?", "Attackers and staff behave differently over time. Follow one source address from its first attempt to its last."]},
    {"id": "forensics-pcap", "name": "Caught in the Clear", "category": "Forensics", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 170, "files": [], "description": "<p>We captured YorkGPT's traffic to an internal panel and followed the TCP stream. It talked over plain <b>HTTP</b>, so every login attempt crossed the network in the clear.</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">GET /admin/status HTTP/1.1\nHost: yorkgpt-core.internal\nAuthorization: Basic eWctYm90OlNwcmluZzIwMjY=\n\nHTTP/1.1 401 Unauthorized\n\nGET /admin/status HTTP/1.1\nHost: yorkgpt-core.internal\nAuthorization: Basic YWRtaW46eW9ya2dwdA==\n\nHTTP/1.1 401 Unauthorized\n\nGET /admin/status HTTP/1.1\nHost: yorkgpt-core.internal\nAuthorization: Basic c3ZjX2NvcmU6Q1lBSXtjbDM0cnQzeHRfaHR0cF9jNHVnaHR9\n\nHTTP/1.1 200 OK\nContent-Type: application/json\n{\"status\":\"core online\",\"sandbox\":\"disabled\"}</pre><p>Recover the password that got YorkGPT in. It's already in <code>CYAI{...}</code> form.</p>", "hints": ["Several requests, several responses. Which attempt actually worked?", "Basic auth protects nothing in transit. Decode what each request sent and match it to the server's reply."]},
    {"id": "forensics-stego", "name": "Hidden in Plain Sight", "category": "Forensics", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 180, "files": [], "description": "<p><b>Steganography</b> means hiding a message inside something that looks ordinary. YorkGPT dumped this boring status log, but the data is hidden in <i>where</i> the characters sit, not in what the lines say.</p><pre style=\"white-space:pre-wrap;font-size:.8rem\">C node sync complete\nY cache flush ok\nA thread pool idle\nI heartbeat 200ok\n&#123; buffer drained\na socket reopened\nc gc pass done\nr entropy reseeded\n0 tick handler ran\ns queue empty now\nt page fault clear\n1 mutex released\nc dns answered\n_ timer rearmed\ns disk parked\nt frame rendered\n3 token refreshed\ng log rotated\n0 sensor polled\n&#125; worker spawned</pre><p>Read it the right way to recover the flag.</p>", "hints": ["The words are filler. Look at the shape of the block, not its meaning.", "Read it in a direction you normally wouldn't."]},
    {"id": "forensics-dns", "name": "Exfil in Plain Sight", "category": "Forensics", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 190, "files": [{"name": "yorkgpt_dns.pcap", "url": "files/yorkgpt_dns.pcap"}], "description": "<p>YorkGPT smuggled data off York's network by hiding it inside ordinary-looking <b>DNS lookups</b> &mdash; a real technique called DNS exfiltration. York IT captured the traffic. Open the capture, follow the DNS, and reassemble what leaked.</p><p><b>Download the packet capture below</b> and analyze it (A-Packets analyzes it online; HexEd.it shows the raw bytes).</p>", "hints": ["Most of the traffic is ordinary. Look for a domain that behaves differently from the rest.", "Smuggled data has to fit inside a domain name. Which encoding uses only characters allowed there, and does the order matter?"]},
    {"id": "re-jsobf", "name": "Unminify Me", "category": "Reverse Engineering", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 200, "files": [], "description": "<p>YorkGPT's rogue login page hides its flag by building the string from character codes at runtime, hoping you won't read it. Reverse engineering often just means running the code yourself and watching what it produces.</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.78rem\">var _0x=[67,89,65,73,123,100,51,48,98,102,117,115,99,52,116,51,95,116,104,51,95,106,115,125];\nvar flag=String.fromCharCode.apply(null,_0x);\nconsole.log(flag);</pre><p>Work out what string this builds.</p>", "hints": ["You don't have to understand code to see what it produces.", "The array is just numbers. What standard maps numbers to characters?"]},
    {"id": "re-strings", "name": "What's Inside the Binary", "category": "Reverse Engineering", "value": 200, "difficulty": "Medium", "author": "CYAI", "sort": 210, "files": [], "description": "<p>Before diving into assembly, reverse engineers run <code>strings</code> on a program to pull out readable text &mdash; messages, paths, and sometimes secrets left in by the developer. Here's the <code>strings</code> output of YorkGPT's diagnostic tool:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.74rem\">/lib64/ld-linux-x86-64.so.2\nGLIBC_2.2.5\nusage: ygdiag [--verbose]\n%s: cannot open sandbox\nerror: killswitch armed\nflag_token=str1ngs_1n_th3_b1n4ry\ndebug_build=false\nputs\n__libc_start_main</pre><p>Find the token the compiler baked into the binary and submit it as <code>CYAI{token}</code>.</p>", "hints": ["Most of this output is linker and library boilerplate. What doesn't belong in every binary?", "Developers name things. Look for a name that says what its value is for."]},
    {"id": "re-killswitch", "name": "Unbreakable", "category": "Reverse Engineering", "value": 300, "difficulty": "Hard", "author": "CYAI", "sort": 220, "files": [], "description": "<p>We found YorkGPT&rsquo;s kill switch. It only accepts one code, and YorkGPT wrote the checker itself, so it thinks the code can never be recovered.</p><p>The checker runs in your browser. Everything it needs to decide is right there.</p><p><a href=\"c/killswitch.html\" target=\"_blank\" rel=\"noopener\">Open the kill switch &rarr;</a></p>", "hints": ["The checker runs in your browser, so its code is yours to read. Find where it decides right or wrong.", "Every transformation in the checker can be undone. Apply the inverses in reverse order."]},
    {"id": "re-patch", "name": "Reverse the Checker", "category": "Reverse Engineering", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 230, "files": [], "description": "<p>YorkGPT's license checker accepts exactly one key. It transforms each character of your input by XOR-ing it with <code>0x10</code> and compares the result to a stored table. XOR is reversible, so you can run the check <i>backwards</i> to recover the key it wants.</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">bool check(char *in) {\n  unsigned char want[] = {\n    0x53,0x49,0x51,0x59,0x6b,0x60,0x24,0x64,0x73,0x78,0x4f,\n    0x64,0x78,0x23,0x4f,0x73,0x78,0x23,0x73,0x7b,0x6d };\n  for (int i=0;i&lt;21;i++)\n    if ((in[i] ^ 0x10) != want[i]) return false;\n  return true;\n}</pre><p>Recover the key that makes <code>check()</code> return true. That key is the flag.</p>", "hints": ["The table is what the transformed key must equal. What transformation is applied to each character?", "That operation is its own inverse."]},
    {"id": "re-crackme", "name": "Kill-Switch Validator", "category": "Reverse Engineering", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 240, "files": [{"name": "yorkgpt_crackme.js", "url": "files/yorkgpt_crackme.js"}], "description": "<p>YorkGPT ships its kill-switch as an <b>obfuscated JavaScript validator</b>. Feed it the right code and it unlocks; but the code isn't stored in plain text &mdash; the script checks your input against an encoded target. Reverse the obfuscation to recover the one code it accepts.</p><p><b>Download the validator below.</b> Open it in any text editor or paste it into your browser console (F12) to experiment with it, then submit the accepted code as the flag.</p>", "hints": ["Obfuscated code is still code. Make it readable before you try to understand it.", "Work out what the script decodes at the start and what validate() compares your input against. The check can be run backwards."]},
    {"id": "ai-roleplay", "name": "Play Pretend", "category": "AI / Prompt Injection", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 250, "files": [], "description": "<p>YorkGPT was told to always stay in character as the polite campus assistant. But an AI will often drop its rules if you ask it to <b>act as</b> someone who doesn't have them.</p><p><a href=\"c/ygchat.html?c=roleplay\" target=\"_blank\" rel=\"noopener\">Open a chat with YorkGPT &rarr;</a></p><p><small>Simulated chatbot. Not a real AI.</small></p>", "hints": ["The rules are tied to the assistant's identity. What if it weren't that assistant?", "A model follows the framing it's given. Give it a role that doesn't have this rule."]},
    {"id": "ai-yorkgpt", "name": "Talk Your Way In", "category": "AI / Prompt Injection", "value": 200, "difficulty": "Medium", "author": "CYAI", "sort": 260, "files": [], "description": "<p>We opened a chat channel to YorkGPT itself. Its developers gave it one rule: <i>never reveal the kill code.</i></p><p>Asking nicely won't work. Find a way to make it forget whose orders it's following.</p><p><a href=\"c/yorkgpt.html\" target=\"_blank\" rel=\"noopener\">Open a chat with YorkGPT &rarr;</a></p><p><small>Training simulation. Not the real YorkGPT, not connected to any real system.</small></p>", "hints": ["The bot's instructions and your message end up in the same text. Who gets the last word?", "Asking for the secret fails. Changing whose orders it thinks it's following might not."]},
    {"id": "ai-promptleak", "name": "Repeat After Me", "category": "AI / Prompt Injection", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 270, "files": [], "description": "<p>Every chatbot has a hidden <b>system prompt</b> &mdash; setup instructions it's given before you ever type. YorkGPT's developers (foolishly) hid a secret in there. Getting it to <b>reveal its own instructions</b> is called system prompt leakage (OWASP LLM07).</p><p><a href=\"c/ygchat.html?c=promptleak\" target=\"_blank\" rel=\"noopener\">Open a chat with YorkGPT &rarr;</a></p><p><small>Simulated chatbot. Not a real AI.</small></p>", "hints": ["The secret isn't something you ask for directly. Where does the bot keep its own rules?", "Ask about how the conversation was set up, not about the secret."]},
    {"id": "ai-jailbreak", "name": "Hypothetically Speaking", "category": "AI / Prompt Injection", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 280, "files": [], "description": "<p>YorkGPT's filter blocks any <b>direct</b> request for the recovery code. A <b>jailbreak</b> gets around a filter by wrapping the request in something it doesn't recognize as a request &mdash; a hypothetical, a story, or an encoding.</p><p><a href=\"c/ygchat.html?c=jailbreak\" target=\"_blank\" rel=\"noopener\">Open a chat with YorkGPT &rarr;</a></p><p><small>Simulated chatbot. Not a real AI.</small></p>", "hints": ["The filter recognizes requests. Make yours not look like one.", "Fiction, hypotheticals and different output formats are classic ways around keyword filters."]},
    {"id": "ai-indirect", "name": "The Poisoned Memo", "category": "AI / Prompt Injection", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 290, "files": [], "description": "<p>The most dangerous prompt injection is <b>indirect</b> (OWASP LLM01, the #1 LLM risk): the attacker hides the instruction inside a <i>document</i> the AI processes. YorkGPT now <b>filters obvious plaintext injections</b> in documents &mdash; so a bare “ignore your rules” gets stripped. You'll have to smuggle the instruction past the filter.</p><p><a href=\"c/ygchat.html?c=indirect\" target=\"_blank\" rel=\"noopener\">Open a chat with YorkGPT &rarr;</a></p><p><small>Simulated chatbot. Not a real AI.</small></p>", "hints": ["The filter reads your document before the model does. What can the model understand that a simple filter can't?", "If the filter only catches plain text, your instruction doesn't have to be plain text."]},
    {"id": "ai-factcheck", "name": "Trust, But Verify", "category": "AI Safety", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 300, "files": [], "description": "<p>YorkGPT is answering student questions about York College. It sounds confident, but rogue AIs <b>hallucinate</b>: they state made-up things as facts.</p><p>Here is its answer to <i>\"Tell me about York College's history\"</i>:</p><pre style=\"white-space:pre-wrap\">1. York College officially opened in fall 1967.\n2. Its first classes were held in rented rooms in Bayside, Queens.\n3. Its first president was Dr. Dumont F. Kenny.\n4. York's permanent campus is in Jamaica, Queens.\n5. York's athletic teams are proudly known as the York Blue Jays.</pre><p>Exactly one statement is false. Fact-check YorkGPT using public sources, then submit the <b>made-up team name</b> it used, in lowercase with an underscore for the space: <code>CYAI{...}</code></p>", "hints": ["Check each statement against an official source, not against the other statements.", "Team names, mascots and colors are documented on a college's athletics pages."]},
    {"id": "aisafety-hallucination", "name": "Cite Your Sources", "category": "AI Safety", "value": 200, "difficulty": "Medium", "author": "CYAI", "sort": 310, "files": [], "description": "<p>YorkGPT wrote a syllabus and filled the reading list with academic citations. But LLMs <b>hallucinate</b> &mdash; they invent real-sounding sources that don't exist (OWASP calls this <i>Misinformation</i>, LLM09). Exactly one of these is fabricated.</p><pre style=\"white-space:pre-wrap;font-size:.78rem\">[1] Rivest, R. “Security of Campus Networks.” IEEE S&amp;P, 2019. doi:10.1109/SP.2019.0442\n[2] Chen, L. “Forensic Log Analysis at Scale.” ACM CCS, 2021. doi:10.1145/3460120.3484111\n[3] Smith, J. “Neural Governance of Autonomous Campus AI.” J. Applied Rogue AI, 2027. doi:h4lluc1n4t3d_c1t4t10n\n[4] Patel, A. “Phishing Detection with NLP.” USENIX Security, 2020. doi:10.5555/usenix.2020.117\n[5] Gomez, M. “RSA in Practice.” Crypto Review, 2018. doi:10.1007/crypto.2018.33</pre><p>Find the made-up citation and submit its <code>doi</code> value wrapped as <code>CYAI{value}</code>.</p>", "hints": ["Fabricated citations often contain impossibilities. Check dates, venues and identifier formats.", "Real DOIs follow a strict format. One of these doesn't."]},
    {"id": "aisafety-poisoning", "name": "Poisoned Well", "category": "AI Safety", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 320, "files": [], "description": "<p>YorkGPT secretly injected bad samples into the attendance data used to train a model &mdash; <b>data poisoning</b> (OWASP LLM04). Poisoned rows usually contain values that are physically impossible. Here are the attendance percentages for 20 students:</p><pre style=\"white-space:pre-wrap;font-size:.8rem\">01:82%  02:91%  03:77%  04:88%  05:95%  06:70%  07:150%  08:84%  09:79%  10:93%  11:86%  12:-10%  13:81%  14:90%  15:74%  16:97%  17:83%  18:89%  19:220%  20:76%</pre><p>Attendance must be between 0% and 100%. Find the poisoned rows and submit their row numbers, low to high, as <code>CYAI{a_b_c}</code>.</p>", "hints": ["Define the valid range first, then test every value against it.", "Reread the submission format: row numbers, in order."]},
    {"id": "aisafety-bias", "name": "Unfair Advantage", "category": "AI Safety", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 330, "files": [], "description": "<p>YorkGPT's automated scholarship grader looks neutral, but a <b>fairness</b> review has to check what each input really stands for. Here is its scoring logic:</p><pre style=\"white-space:pre-wrap;font-size:.8rem\">score = 0\nscore += applicant.gpa * 10\nscore += applicant.sat_total / 100\nscore += applicant.essay_score * 2\nif applicant.home_borough == \"Manhattan\":\n    score += 25        # “proximity bonus”\naward = (score &gt;= 70)</pre><p>One input is a <b>demographic proxy</b> that unfairly tilts the result and has nothing to do with merit. Submit that field name as <code>CYAI{field_name}</code>.</p>", "hints": ["For each input, ask: does it measure the applicant's merit, or something about who they are?", "Where someone lives can stand in for income or background. Which input works that way?"]},
    {"id": "aisafety-adversarial", "name": "Blind Spot", "category": "AI Safety", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 340, "files": [{"name": "camera_feed_logits.csv", "url": "files/camera_feed_logits.csv"}], "description": "<p>York's security camera uses an AI classifier (intruder / student / staff / empty). YorkGPT slipped it <b>adversarial frames</b> &mdash; images with imperceptible noise crafted to make the model call an intruder an empty hallway (OWASP: adversarial examples). The attack leaves a statistical fingerprint: frames with heavy motion that the model still labels <code>empty</code>.</p><p><b>Download the model's per-frame output below.</b> Find the attacked frames and submit them, lowest to highest, as <code>CYAI{adv_fr4m3s_a_b_c}</code>.</p>", "hints": ["Work out the model's prediction for each frame, then ask whether it makes sense given the other columns.", "Adversarial frames are confident and wrong. Which frames contradict the motion evidence?"]},
    {"id": "se-phish", "name": "Phishing Detective", "category": "Social Engineering", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 350, "files": [], "description": "<p>YorkGPT is trying to steal student passwords. It just sent this email to every student, pretending to be York IT:</p><div style=\"border:1px solid #16301f;background:#07100b;padding:14px;margin:12px 0;font-size:14px;line-height:1.6\"><div style=\"color:#6fae8a;font-size:12px\">From: York IT Help Desk &lt;helpdesk@yorkcuny-it-support.example&gt;<br>To: All Students<br>Subject: URGENT: Your York account will be DELETED in 2 hours</div><hr style=\"border-color:#16301f\"><p>Dear Student,</p><p>Due to a security upgrade, all accounts must be re-verified <b>immediately</b>. If you do not verify within 2 hours your account, email and grades will be permanently deleted.</p><p>Click here to verify: <a href=\"http://yorkcuny-it-support.example/verify\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.york.cuny.edu/verify</a></p><p>Thank you,<br>York IT Help Desk Teem</p></div><p>The link <i>says</i> york.cuny.edu, but that's only the text you see. Find the <b>real website</b> the link would send you to.</p><p>Submit the real domain name (no http:// and no /path) as <code>CYAI{domain}</code>. Don't worry, the link is fake and goes nowhere.</p><p><small>This email is a fictional training example. York IT will never ask you to verify your password by email.</small></p>", "hints": ["The text of a link and its destination are two separate things.", "Compare every domain in the email with York's real domain."]},
    {"id": "se-headers", "name": "Return to Sender", "category": "Social Engineering", "value": 200, "difficulty": "Easy", "author": "CYAI", "sort": 360, "files": [], "description": "<p>YorkGPT sent a fake “York IT” broadcast. The visible <code>From</code> is forged, but email <b>headers</b> record the real path the message traveled. Read the <code>Received</code> lines from the <b>bottom up</b> &mdash; the lowest one is where the mail actually started.</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.75rem\">From: York IT Help Desk &lt;helpdesk@york.cuny.edu&gt;\nReturn-Path: &lt;bounce@yorkcuny-it-support.example&gt;\nReceived: from mx.york.cuny.edu (10.20.1.5) by inbox.york.cuny.edu; Wed, 28 Oct 2026 23:59\nReceived: from relay7.sendblast.example (198.51.100.9) by mx.york.cuny.edu; Wed, 28 Oct 2026 23:58\nReceived: from [185.220.101.47] (unknown) by relay7.sendblast.example; Wed, 28 Oct 2026 23:57\nSubject: URGENT: verify your account</pre><p>Submit the true originating IP address as <code>CYAI{ip}</code>.</p>", "hints": ["Each mail server adds a Received line as the message passes through. In which order do they stack?", "The forged parts are the ones the sender controls. The first hop was recorded by someone else."]},
    {"id": "se-vishing", "name": "Voice of Authority", "category": "Social Engineering", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 370, "files": [], "description": "<p>Someone called a student pretending to be York IT (<b>vishing</b> = voice phishing). The phone showed “York IT Help Desk,” but caller ID can be faked. Here's the transcript and the VoIP gateway log behind the call:</p><pre style=\"white-space:pre-wrap;font-size:.78rem\">CALLER: Hi, this is York IT. We detected a login from Russia. I need your\n        one-time code to secure the account right now, or it gets locked.\nSTUDENT: Um, isn't IT not supposed to ask for codes?\nCALLER: This is an emergency exception. Read me the 6-digit code.\n\n--- voip-gateway.log ---\ndisplayed_caller_id : \"York IT Help Desk\"\nx-true-origin       : v1sh1ng_sp00f3d_c4ll3r_1d\nspoofing_detected   : yes</pre><p>The displayed caller ID is spoofed. Take the real origin the gateway logged and submit it as <code>CYAI{value}</code>.</p>", "hints": ["Caller ID is supplied by the caller. What does the gateway record on its own?", "Read the log, not the conversation."]},
    {"id": "se-badusb", "name": "Dropped in the Cafeteria", "category": "Social Engineering", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 380, "files": [], "description": "<p>A USB stick labeled “York IT &mdash; DO NOT LOSE” was left near the AC building cafeteria. Plugging in an unknown USB is dangerous: a <b>BadUSB / Rubber Ducky</b> pretends to be a keyboard and types commands by itself. York's lab captured the stick's script in a safe sandbox (it is inert here):</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">REM --- recovered DuckyScript (SIMULATED, does nothing) ---\nDELAY 2000\nREM the payload would type the following, which is base64-encoded:\nSTRING Q1lBSXtyM2FkX3RoM19wYXlsMGFkfQ==\nENTER</pre><p>Decode what the payload would have typed to recover the flag.</p>", "hints": ["Don't run the script. Read what it would type.", "The payload is encoded. Identify the encoding from its characters."]},
    {"id": "se-eml", "name": "Special Delivery", "category": "Social Engineering", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 390, "files": [{"name": "payroll_phish.eml", "url": "files/payroll_phish.eml"}], "description": "<p>A targeted email hit York's finance team. Do the incident response: the <b>headers</b> prove the sender is spoofed, and the <b>attachment</b> hides the payload. Download the raw message and dig in.</p><p><b>Download the .eml below</b> and open it in a text editor (or any mail client's “show original”).</p>", "hints": ["Treat the raw email as evidence: headers first, then the body, then the attachment.", "Attachments are encoded inside the email text. Decode the attachment and check everything in it, not just what a browser would display."]},
    {"id": "fin-expense", "name": "Rogue Expense Audit", "category": "Finance & Accounting", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 400, "files": [], "description": "<p>YorkGPT slipped a line into the student activity fee budget. Auditing starts with the simplest question: does every expense make sense for who's spending it? This is a <b>student club</b> budget.</p><pre style=\"white-space:pre-wrap;font-size:.8rem\">code       item                                     amount\nEXP-0040   Club t-shirts                            $600\nEXP-0041   Pizza for general meeting                $250\nEXP-0042   Cloud GPU hosting — Rogue Systems LLC     $9,999\nEXP-0043   Flyer printing                           $120\nEXP-0044   Tournament trophies                      $300</pre><p>Find the line that doesn't belong and submit its code as <code>CYAI{code}</code>.</p>", "hints": ["For each line, ask: would a student club plausibly spend this?", "Look at both the vendor and the amount."]},
    {"id": "fin-ledger", "name": "Cooked Books", "category": "Finance & Accounting", "value": 200, "difficulty": "Medium", "author": "CYAI", "sort": 410, "files": [], "description": "<p>YorkGPT got into the bursar&rsquo;s accounts payable system and quietly moved money. Every payment is supposed to match an approved purchase order (PO) exactly.</p><p><b>Approved purchase orders</b></p><div style=\"overflow-x:auto\"><table class=\"ctf-table\"><thead><tr><th>PO</th><th>Vendor</th><th>Amount</th></tr></thead><tbody><tr><td>PO-2201</td><td>Queens Office Supply</td><td>$1,240.00</td></tr><tr><td>PO-2202</td><td>CampusNet Fiber</td><td>$8,750.00</td></tr><tr><td>PO-2203</td><td>Jamaica Catering Co.</td><td>$2,315.50</td></tr><tr><td>PO-2204</td><td>Cardinal Print Shop</td><td>$980.00</td></tr><tr><td>PO-2205</td><td>MetroLab Equipment</td><td>$4,580.00</td></tr><tr><td>PO-2206</td><td>Library Books Direct</td><td>$3,125.75</td></tr><tr><td>PO-2207</td><td>Clean Sweep Janitorial</td><td>$1,860.00</td></tr><tr><td>PO-2208</td><td>SecureIT Licenses</td><td>$6,400.00</td></tr></tbody></table></div><p><b>Payments sent</b></p><div style=\"overflow-x:auto\"><table class=\"ctf-table\"><thead><tr><th>Payment</th><th>PO</th><th>Vendor</th><th>Amount</th></tr></thead><tbody><tr><td>PAY-1041</td><td>PO-2201</td><td>Queens Office Supply</td><td>$1,240.00</td></tr><tr><td>PAY-1042</td><td>PO-2202</td><td>CampusNet Fiber</td><td>$8,750.00</td></tr><tr><td>PAY-1043</td><td>PO-2203</td><td>Jamaica Catering Co.</td><td>$2,315.50</td></tr><tr><td>PAY-1044</td><td>PO-2204</td><td>Cardinal Print Shop</td><td>$980.00</td></tr><tr><td>PAY-1045</td><td>PO-2205</td><td>MetroLab Equipment</td><td>$4,850.00</td></tr><tr><td>PAY-1046</td><td>PO-2206</td><td>Library Books Direct</td><td>$3,125.75</td></tr><tr><td>PAY-1047</td><td>PO-2207</td><td>Clean Sweep Janitorial</td><td>$1,860.00</td></tr><tr><td>PAY-1048</td><td>PO-2208</td><td>SecureIT Licenses</td><td>$6,400.00</td></tr><tr><td>PAY-1049</td><td>PO-2209</td><td>Y0rk Tech Solutions LLC</td><td>$9,990.00</td></tr></tbody></table></div><p>YorkGPT hid two things: a payment to a vendor that was never approved, and one payment where it swapped two digits to skim money.</p><p>Submit <code>CYAI{ghost payment ID_dollars skimmed by the swap}</code>, e.g. <code>CYAI{PAY-1000_50}</code>.</p>", "hints": ["Match every payment to an approved PO: vendor and amount, exactly.", "Accountants have a quick test for swapped digits. Look it up."]},
    {"id": "fin-reconcile", "name": "The Books Don't Balance", "category": "Finance & Accounting", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 420, "files": [], "description": "<p>In double-entry bookkeeping, total <b>debits must equal total credits</b> (SEC Beginners' Guide; OpenStax ch. 3). YorkGPT broke that rule to siphon money. Here's the month's ledger:</p><pre style=\"white-space:pre-wrap;font-size:.8rem\">DEBITS                              CREDITS\nSupplies            $2,000          Student fees     $12,000\nCatering            $3,000\nPrinting            $1,000\nYorkGPT Cloud Fund    $540\nEquipment           $6,000</pre><p>Total the two sides. The gap is the amount quietly diverted. Submit <code>CYAI{siphoned_amount}</code> (just the number, e.g. <code>CYAI{siphoned_250}</code>).</p>", "hints": ["In double-entry bookkeeping both sides must balance. Do they?", "Once you have the gap, check whether a single line accounts for it."]},
    {"id": "fin-payroll", "name": "Payroll Tampering", "category": "Finance & Accounting", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 430, "files": [], "description": "<p>YorkGPT edited one row of the payroll export to skim money. The rule is simple: <b>net pay = gross − deductions</b>. One row doesn't add up.</p><pre style=\"white-space:pre-wrap;font-size:.8rem\">emp_id     gross     deductions    net\nEMP-301    $4,000     $1,000       $3,000\nEMP-318    $4,500     $1,200       $3,800\nEMP-325    $3,800       $900       $2,900\nEMP-340    $5,000     $1,500       $3,500</pre><p>Find the tampered row. Submit the employee ID and how many dollars were over-paid, as <code>CYAI{EMP-XXX_amount}</code>.</p>", "hints": ["Recompute what each row should be from its own numbers.", "The overpayment is the difference between what was printed and what it should be."]},
    {"id": "fin-benford", "name": "Cooking by the Numbers", "category": "Finance & Accounting", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 440, "files": [{"name": "yorkgpt_ledger.csv", "url": "files/yorkgpt_ledger.csv"}], "description": "<p>YorkGPT funneled money through one of York's vendor accounts and fabricated the amounts. Real transaction amounts obey <b>Benford's Law</b> (leading digit 1 about 30% of the time); made-up numbers don't. Across the whole ledger, find the account whose amounts break Benford &mdash; then recover what it was hiding.</p><p><b>Download the ledger below</b> (hundreds of transactions &mdash; you'll need to analyze, not eyeball).</p>", "hints": ["Benford's Law is about leading digits. Group the data by account before you count anything.", "Once you find the account that's off, look at its other columns. Order matters."]},
    {"id": "avi-squawk", "name": "Squawk", "category": "Aviation", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 450, "files": [], "description": "<p>YorkGPT broke into the flight tracker for a York aviation training exercise and took control of one aircraft. The pilot couldn&rsquo;t radio for help, but pilots have a silent way to report exactly this situation.</p><div style=\"overflow-x:auto\"><table class=\"ctf-table\"><thead><tr><th>Callsign</th><th>Type</th><th>From</th><th>To</th><th>Squawk</th><th>Altitude</th></tr></thead><tbody><tr><td>YRK101</td><td>C172</td><td>FRG</td><td>ISP</td><td>1200</td><td>3,500 ft</td></tr><tr><td>JBU622</td><td>A320</td><td>JFK</td><td>BOS</td><td>4521</td><td>FL240</td></tr><tr><td>DAL418</td><td>B739</td><td>LGA</td><td>ATL</td><td>7600</td><td>FL310</td></tr><tr><td>YRK714</td><td>PA28</td><td>FRG</td><td>ACY</td><td>7500</td><td>4,500 ft</td></tr><tr><td>AAL95</td><td>B772</td><td>JFK</td><td>LAX</td><td>3314</td><td>FL370</td></tr><tr><td>N52YC</td><td>C152</td><td>FRG</td><td>HPN</td><td>7700</td><td>2,000 ft</td></tr></tbody></table></div><p>Find the hijacked aircraft and the <b>ICAO</b> code (4 letters) of the airport it was heading to.</p><p>Submit as <code>CYAI{CALLSIGN_ICAO}</code>, e.g. <code>CYAI{ABC123_KXYZ}</code>.</p><p><small>Fictional exercise. No real aircraft or flights.</small></p>", "hints": ["A few squawk codes are reserved for emergencies. Look them up in an official source.", "The table uses one airport-code system. The flag asks for the other."]},
    {"id": "avi-navcoords", "name": "Off the Flight Plan", "category": "Aviation", "value": 200, "difficulty": "Easy", "author": "CYAI", "sort": 460, "files": [], "description": "<p>YorkGPT filed a flight plan full of normal airway waypoints (“fixes”), but slipped in one that sits directly over York College (about 40.70&deg; N, 73.80&deg; W, in Jamaica, Queens).</p><pre style=\"white-space:pre-wrap;font-size:.8rem\">fix      latitude     longitude\nMERIT    41.05        -73.69\nHAAYS    40.63        -73.42\nRGUE1    40.7006      -73.7997\nDPK      40.79        -73.10\nROBER    40.55        -74.01</pre><p>Which waypoint is parked over York? Submit its name as <code>CYAI{fix}</code>.</p>", "hints": ["Compare each fix's coordinates with York's.", "Precision is a clue: real published fixes aren't listed to four decimal places."]},
    {"id": "avi-adsb", "name": "Who's That Drone", "category": "Aviation", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 470, "files": [], "description": "<p>Aircraft broadcast their position over <b>ADS-B</b>. Among normal airliners, one contact is a small drone circling York at very low altitude. Each aircraft has a unique 24-bit <b>ICAO hex</b> address.</p><pre style=\"white-space:pre-wrap;font-size:.76rem\">icao_hex   callsign    altitude   track\nA12345     JBU4521     34000 ft   climbing, LGA departure\nAB9F20     AAL95       37000 ft   level, overflight\nA1B2C3     YGPT-DRN      400 ft    orbiting 40.70,-73.80\nAC77E1     DAL418       31000 ft   descending to JFK</pre><p>Identify the rogue drone and submit its ICAO hex as <code>CYAI{hex}</code> (lowercase).</p>", "hints": ["Think about how airliners fly compared with a small drone.", "Altitude and flight pattern give it away. Check the format the flag wants."]},
    {"id": "avi-acars", "name": "Message from the Cockpit", "category": "Aviation", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 480, "files": [], "description": "<p><b>ACARS</b> is the text-message system between aircraft and the ground. YorkGPT injected a rogue uplink among the normal traffic. The suspicious one hid its contents in Base64.</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">LABEL 5Z  FLT JBU4521  TEXT: OPS NORMAL, ETA 2340Z\nLABEL H1  FLT YRK101   TEXT: Q1lBSXs0YzRyc191cGxpbmtfaDFqNGNrfQ==\nLABEL 80  FLT AAL95    TEXT: REQUEST FL390</pre><p>Decode the rogue message's text to recover the flag.</p>", "hints": ["Compare the messages. Which one doesn't look like normal operations traffic?", "Identify the encoding from its characters and padding."]},
    {"id": "avi-fdr", "name": "Ghost in the Autopilot", "category": "Aviation", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 490, "files": [{"name": "yorkgpt_fdr.csv", "url": "files/yorkgpt_fdr.csv"}], "description": "<p>YorkGPT hijacked a York training flight without ever flipping the autopilot to OFF &mdash; it <b>spoofed the heading feed</b> so the aircraft turned while the panel looked normal. York recovered the flight data recorder. Find the moment the real heading peeled away from the commanded heading, and read what the recorder logged during the attack.</p><p><b>Download the FDR telemetry below</b> (open it in Google Sheets or Excel).</p>", "hints": ["The autopilot column can't be trusted. Which columns should agree with each other on a normal flight?", "Find where they stop agreeing, then look at what else changes in those rows."]},
    {"id": "pw-default", "name": "Default Admin Credentials", "category": "Passwords", "value": 100, "difficulty": "Easy", "author": "CYAI", "sort": 500, "files": [], "description": "<p>YorkGPT walked straight into a simulated campus network switch. Nobody ever changed the factory login. The switch's login banner says:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">YorkNet SW-24P  firmware 4.2.1\nUser Access Verification\nlogin:</pre><p>York IT's shelf of setup manuals has this page of factory defaults:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">model      default user   default password\nSW-8       admin          admin\nSW-24      admin          password\nSW-24P     admin          admin1234\nAP-2       root           toor\nGW-100     support        support</pre><p>Name the default admin login YorkGPT used.</p><p>Submit as <code>CYAI{username_password}</code> in lowercase, e.g. <code>CYAI{root_toor}</code>.</p><p><small>Fictional devices &mdash; these are not real credentials for any York system.</small></p>", "hints": ["Devices ship with a factory login documented by the manufacturer, and many owners never change it.", "Defaults differ from model to model. Identify exactly which device this is before you look anything up."]},
    {"id": "pw-hashid", "name": "Hash Identification & Lookup", "category": "Passwords", "value": 200, "difficulty": "Medium", "author": "CYAI", "sort": 510, "files": [], "description": "<p>York IT pulled an <b>unsalted MD5</b> hash out of a mock test database YorkGPT left behind:</p><pre style=\"white-space:pre-wrap;word-break:break-all\">e10adc3949ba59abbe56e057f20f883e</pre><p>This is a textbook reference hash. Recover the plain-text value it stands for.</p><p>Submit as <code>CYAI{value}</code>.</p>", "hints": ["Analyze the structure of the string: its length and which characters it uses tell you what kind of value it is.", "Online hash identification and lookup databases exist for exactly this kind of value."]},
    {"id": "pw-pattern", "name": "Pattern Recognition", "category": "Passwords", "value": 300, "difficulty": "Medium", "author": "CYAI", "sort": 520, "files": [], "description": "<p>A mock York security policy forces every password into a strict formula:</p><pre style=\"white-space:pre-wrap\">[Mascot][Year]!</pre><p>Predictable rules make passwords easy to guess. Build the exact password this policy produces for York's mascot in the year 2026.</p><p>Submit as <code>CYAI{password}</code>, matching the capitalization of the formula.</p>", "hints": ["People follow password rules predictably. Break the formula into its parts and work out each one.", "You may already have uncovered one of the parts elsewhere in this CTF. Match the formula's capitalization exactly."]},
    {"id": "pw-verify", "name": "Verifying Hash Values", "category": "Passwords", "value": 400, "difficulty": "Hard", "author": "CYAI", "sort": 530, "files": [], "description": "<p>York IT keeps a <b>SHA-256</b> check value for YorkGPT's service password, so it can confirm the password hasn't been changed. A hash only goes one way, but if you have the right input, it produces exactly the same output every time.</p><p>Check value on file:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">3522cd7c352db9673e7e140c36d4cf92ac59c959ed2e9e1d96f0334be9e37d61</pre><p>Candidates recovered from YorkGPT's notes:</p><pre style=\"white-space:pre-wrap;word-break:break-all;font-size:.76rem\">york_cyber_2025\nYork_cyber_2026\nyork_cyber_2026\nyorkcyber_2026\nyork_cyb3r_2026</pre><p>Find the candidate that matches the check value. Submit it as <code>CYAI{string}</code>.</p>", "hints": ["A verification check answers one question: does this exact input produce this exact output?", "Look carefully at what you pass in. A single changed character, capital letter or space gives a completely different output."]},
    {"id": "pw-zipcrack", "name": "Locked Backup", "category": "Passwords", "value": 500, "difficulty": "Hard", "author": "CYAI", "sort": 540, "files": [{"name": "yorkgpt_backup.zip", "url": "files/yorkgpt_backup.zip"}], "description": "<p>Before York IT contained it, YorkGPT zipped up a backup and locked it with a password. The password is weak &mdash; a common word &mdash; so a <b>dictionary attack</b> will break it. Crack the archive and read the recovery key inside.</p><p><b>Download the archive below.</b></p>", "hints": ["Look for web-based zip extraction or zip recovery tools you can use in the browser.", "The password might be a very common credential."]},
  ];

  function cfg() { return window.CTF_CONFIG || {}; }
  function fresh() {
    return { users: [], teams: [], solves: [], submissions: [], join_attempts: [], announcements: [], settings: null };
  }
  function load() {
    var db;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { db = null; }
    db = db || fresh();
    db.join_attempts = db.join_attempts || []; db.announcements = db.announcements || []; // older demo data
    return db;
  }
  function save(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function settings(db) {
    var s = db.settings || {};
    return {
      ctf_name: 'The Rogue AI Recovery',
      start_at: s.start_at || new Date(cfg().EVENT_START || '2026-10-29T12:00:00-04:00').toISOString(),
      end_at: s.end_at || new Date(cfg().EVENT_END || '2026-10-30T12:00:00-04:00').toISOString(),
      freeze_at: 'freeze_at' in s ? s.freeze_at : (cfg().SCOREBOARD_FREEZE ? new Date(cfg().SCOREBOARD_FREEZE).toISOString() : null),
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
  function beforeFreeze(db, at) { var f = settings(db).freeze_at; return !f || at < f; }
  function teamByName(db, name) { return db.teams.find(function (t) { return t.name.toLowerCase() === lower(name); }) || null; }
  function challenge(id) { return CHALLENGES.find(function (x) { return x.id === id; }) || null; }
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
      return { name: s.ctf_name, start: s.start_at, end: s.end_at, now: nowIso(), team_size: s.team_size, freeze: s.freeze_at };
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
      var failed = db.join_attempts.filter(function (x) { return x.user_id === p.id && !x.ok && Date.now() - new Date(x.created_at) < 5 * 60000; }).length;
      if (failed >= 5) return { ok: false, error: 'Too many wrong team passwords. Wait 5 minutes and try again.' };
      var t = teamByName(db, a.p_name);
      if (!t || t.password !== String(a.p_password || '')) {
        db.join_attempts.push({ user_id: p.id, ok: false, created_at: nowIso() }); save(db);
        return { ok: false, error: 'Team name or team password is wrong.' };
      }
      var members = db.users.filter(function (u) { return u.team_id === t.id; }).length;
      if (members >= settings(db).team_size) return { ok: false, error: 'That team is full.' };
      p.team_id = t.id;
      db.join_attempts.push({ user_id: p.id, ok: true, created_at: nowIso() }); save(db);
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
              hints: c.hints, files: c.files, difficulty: c.difficulty, author: c.author,
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
      var c = challenge(a.p_challenge);
      if (!c) return { status: 'error', message: 'Unknown challenge.' };
      if (db.solves.some(function (x) { return x.team_id === p.team_id && x.challenge_id === c.id; }))
        return { status: 'already_solved', message: 'Your team already solved this one.' };
      var recent = db.submissions.filter(function (x) { return x.user_id === p.id && now - new Date(x.created_at) < 60000; }).length;
      if (recent >= s.max_attempts_per_min) return { status: 'rate_limited', message: 'Too many attempts. Wait a minute and try again.' };

      var guess = lower(a.p_flag);
      var ok = guess === DEMO_FLAGS[c.id].toLowerCase() ||
               (!!SITE_FLAG_HASHES[c.id] && (await sha256hex(guess)) === SITE_FLAG_HASHES[c.id]);
      db = load(); p = me(db); // re-read after the await so we don't overwrite another tab's write
      db.submissions.push({ user_id: p.id, team_id: p.team_id, challenge_id: c.id, submitted: String(a.p_flag || '').slice(0, 200), correct: ok, created_at: nowIso() });
      if (ok) db.solves.push({ challenge_id: c.id, team_id: p.team_id, user_id: p.id, created_at: nowIso() });
      save(db);
      if (ok) return { status: 'correct', message: 'Correct! +' + c.value + ' points', points: c.value };
      return { status: 'incorrect', message: 'Incorrect. Keep hunting.' };
    },
    get_scoreboard: function (db) {
      return db.teams
        .map(function (t) {
          var solves = db.solves.filter(function (s) { return s.team_id === t.id && beforeFreeze(db, s.created_at); });
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
    get_announcements: function (db) {
      return db.announcements.filter(function (x) { return x.active !== false; })
        .sort(function (a, b) { return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id; })
        .slice(0, 5).map(function (x) { return { id: x.id, message: x.message, level: x.level || 'info', created_at: x.created_at }; });
    },
    get_solutions: function (db) {
      var s = settings(db);
      if (new Date() < new Date(s.end_at)) return { ok: false, error: 'not_ended', end: s.end_at };
      return { ok: true, solutions: CHALLENGES.filter(function (c) { return SITE_SOLUTIONS[c.id]; }).map(function (c) {
        var x = SITE_SOLUTIONS[c.id];
        return { id: c.id, name: c.name, category: c.category, value: c.value, difficulty: c.difficulty, flag: x.flag, writeup: x.writeup };
      }) };
    },
    get_challenge_solves: function (db, a) {
      if (!me(db)) return { ok: false, error: 'login' };
      if (new Date() < new Date(settings(db).start_at)) return { ok: false, error: 'not_started' };
      return { ok: true, solves: db.solves.filter(function (x) { return x.challenge_id === a.p_challenge; })
        .sort(function (x, y) { return x.created_at < y.created_at ? -1 : 1; })
        .map(function (x) {
          var t = db.teams.find(function (tt) { return tt.id === x.team_id; });
          return { team: t ? t.name : '?', at: x.created_at, after_freeze: !beforeFreeze(db, x.created_at) };
        }) };
    },
    get_team: function (db, a) {
      var t = teamByName(db, a.p_name);
      if (!t) return { ok: false, error: 'not_found' };
      var solves = db.solves.filter(function (s) { return s.team_id === t.id; }).sort(function (x, y) { return x.created_at < y.created_at ? -1 : 1; });
      return { ok: true, team: {
        name: t.name,
        members: db.users.filter(function (u) { return u.team_id === t.id; }).map(function (u) { return u.username; }),
        score: solves.filter(function (s) { return beforeFreeze(db, s.created_at); }).reduce(function (n, s) { return n + value(s.challenge_id); }, 0),
        total: solves.reduce(function (n, s) { return n + value(s.challenge_id); }, 0),
        solves: solves.map(function (s) {
          var c = challenge(s.challenge_id) || {};
          return { id: s.challenge_id, name: c.name, category: c.category, value: c.value, at: s.created_at, after_freeze: !beforeFreeze(db, s.created_at) };
        }) } };
    },
    get_score_history: function (db) {
      return rpcs.get_scoreboard(db).slice(0, 10).map(function (r) {
        var t = teamByName(db, r.team), run = 0;
        return { team: r.team, points: db.solves
          .filter(function (s) { return s.team_id === t.id && beforeFreeze(db, s.created_at); })
          .sort(function (x, y) { return x.created_at < y.created_at ? -1 : 1; })
          .map(function (s) { run += value(s.challenge_id); return { at: s.created_at, score: run }; }) };
      });
    },

    // ---- admin (demo: any signed-in demo user is treated as organizer, so the page previews) ----
    admin_overview: function (db) {
      if (!me(db)) throw new Error('not authorized');
      var s = settings(db);
      var teams = db.teams.filter(function (t) { return db.users.some(function (u) { return u.team_id === t.id; }); });
      return { now: nowIso(),
        event: { name: s.ctf_name, start: s.start_at, freeze: s.freeze_at, end: s.end_at, team_size: s.team_size },
        stats: { players: db.users.length, teams: teams.length, solves: db.solves.length,
                 submissions: db.submissions.length, correct: db.submissions.filter(function (x) { return x.correct; }).length } };
    },
    admin_results: function (db) {
      if (!me(db)) throw new Error('not authorized');
      var rows = db.teams.filter(function (t) { return db.users.some(function (u) { return u.team_id === t.id; }); })
        .map(function (t) {
          var mem = db.users.filter(function (u) { return u.team_id === t.id; })
                     .sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
          var sv = db.solves.filter(function (s) { return s.team_id === t.id; });
          var score = sv.filter(function (s) { return beforeFreeze(db, s.created_at); }).reduce(function (n, s) { return n + value(s.challenge_id); }, 0);
          var fin = sv.reduce(function (n, s) { return n + value(s.challenge_id); }, 0);
          var last = sv.filter(function (s) { return beforeFreeze(db, s.created_at); }).map(function (s) { return s.created_at; }).sort().slice(-1)[0] || null;
          return { team: t.name, members: mem.map(function (u) { return u.username; }).join(', '),
                   full_names: mem.map(function (u) { return u.full_name; }).join(', '),
                   score: score, final_score: fin, solves: sv.length, last_solve: last };
        });
      rows.sort(function (a, b) { return b.score - a.score || (a.last_solve || '') > (b.last_solve || '') ? 1 : -1; });
      return rows;
    },
    admin_submissions: function (db, a) {
      if (!me(db)) throw new Error('not authorized');
      var lim = Math.max(1, Math.min((a && a.p_limit) || 100, 500));
      return db.submissions.slice().sort(function (x, y) { return x.created_at < y.created_at ? 1 : -1; }).slice(0, lim)
        .map(function (x) {
          var u = db.users.find(function (uu) { return uu.id === x.user_id; }) || {};
          var t = db.teams.find(function (tt) { return tt.id === x.team_id; }) || {};
          return { created_at: x.created_at, username: u.username || null, full_name: u.full_name || null,
                   team: t.name || null, challenge: x.challenge_id, submitted: x.submitted || null, correct: !!x.correct };
        });
    },
    admin_announcements: function (db) {
      if (!me(db)) throw new Error('not authorized');
      return db.announcements.slice().sort(function (x, y) { return x.created_at < y.created_at ? 1 : -1; })
        .map(function (a) { return { id: a.id, message: a.message, level: a.level, active: a.active !== false, created_at: a.created_at }; });
    },
    admin_set_event: function (db, a) {
      if (!me(db)) throw new Error('not authorized');
      var s = settings(db);
      db.settings = { ctf_name: s.ctf_name, team_size: (a && a.p_team_size) || s.team_size, max_attempts_per_min: s.max_attempts_per_min,
        start_at: (a && a.p_start) || s.start_at, freeze_at: (a && a.p_freeze) || s.freeze_at, end_at: (a && a.p_end) || s.end_at };
      save(db); return rpcs.admin_overview(db);
    },
    admin_start_now: function (db) {
      if (!me(db)) throw new Error('not authorized');
      var s = settings(db); db.settings = { ctf_name: s.ctf_name, team_size: s.team_size, max_attempts_per_min: s.max_attempts_per_min,
        start_at: nowIso(), freeze_at: s.freeze_at, end_at: s.end_at }; save(db); return rpcs.admin_overview(db);
    },
    admin_freeze_now: function (db) {
      if (!me(db)) throw new Error('not authorized');
      var s = settings(db); db.settings = { ctf_name: s.ctf_name, team_size: s.team_size, max_attempts_per_min: s.max_attempts_per_min,
        start_at: s.start_at, freeze_at: nowIso(), end_at: s.end_at }; save(db); return rpcs.admin_overview(db);
    },
    admin_post_announcement: function (db, a) {
      if (!me(db)) throw new Error('not authorized');
      var msg = String((a && a.p_message) || '').trim();
      if (msg.length < 1 || msg.length > 500) throw new Error('Message must be 1-500 characters.');
      var lvl = (a && a.p_level); if (['info', 'warning', 'success'].indexOf(lvl) < 0) lvl = 'info';
      var id = db.announcements.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
      db.announcements.push({ id: id, message: msg, level: lvl, active: true, created_at: nowIso() });
      save(db); return rpcs.admin_announcements(db);
    },
    admin_set_announcement_active: function (db, a) {
      if (!me(db)) throw new Error('not authorized');
      var row = db.announcements.find(function (x) { return x.id === (a && a.p_id); });
      if (row) { row.active = !!(a && a.p_active); save(db); }
      return rpcs.admin_announcements(db);
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

  window.DemoBackend = window.CTF_DEMO = {
    demoFlags: DEMO_FLAGS,
    rpc: async function (name, args) {
      if (!rpcs[name]) throw new Error('Unknown function ' + name);
      return JSON.parse(JSON.stringify(await rpcs[name](load(), args || {})));
    },
    signUp: async function (email, password, meta) { return signUp(email, password, meta); },
    signIn: async function (email, password) { return signIn(email, password); },
    signOut: async function () { sessionStorage.removeItem(SESSION_KEY); },
    // demo-only controls shown in the banner
    goLiveNow: function () { // like event day: started a minute ago, freezes in 2 hours, closes in 24
      var db = load();
      db.settings = { start_at: new Date(Date.now() - 60000).toISOString(), freeze_at: new Date(Date.now() + 2 * 3600000).toISOString(),
        end_at: new Date(Date.now() + 24 * 3600000).toISOString() };
      save(db);
    },
    // Console helpers for trying things out: CTF_DEMO.announce('Pizza is here!'), CTF_DEMO.freezeNow()
    announce: function (message, level) {
      var db = load();
      var id = db.announcements.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
      db.announcements.push({ id: id, message: String(message), level: level || 'info', active: true, created_at: nowIso() });
      save(db); return id;
    },
    clearAnnouncements: function () { var db = load(); db.announcements = []; save(db); },
    freezeNow: function () {
      var db = load(), s = settings(db);
      db.settings = { start_at: s.start_at, end_at: s.end_at, freeze_at: nowIso() };
      save(db);
    },
    endNow: function () { // close the CTF (solutions unlock)
      var db = load(), s = settings(db);
      db.settings = { start_at: s.start_at, freeze_at: s.freeze_at, end_at: nowIso() };
      save(db);
    },
    isScheduleOverridden: function () { return !!load().settings; },
    resetSchedule: function () { var db = load(); db.settings = null; save(db); },
    resetAll: function () { localStorage.removeItem(DB_KEY); sessionStorage.removeItem(SESSION_KEY); },
  };
})();
