// ================================================================
//  CYAI CTF site settings. This is the ONLY file you need to edit.
// ================================================================
//
//  1. Supabase dashboard -> Project Settings -> API (or "API Keys").
//  2. Copy the Project URL into SUPABASE_URL.
//  3. Copy the "publishable" key (starts with sb_publishable_) OR the
//     legacy "anon public" key into SUPABASE_ANON_KEY. Both work.
//     NEVER paste the "secret" / "service_role" key here: this file is public.
//
//  Leave both blank to run in DEMO MODE (fake data stored in your browser).

window.CTF_CONFIG = {
  SUPABASE_URL: 'https://xbfooaesppsyqncjgpmu.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_EQ7TTTlx8giUfTK7K1TjTQ_s4wkuipa',

  // Event window (Eastern Daylight Time is UTC-4 on Oct 29, 2026).
  // With Supabase connected, the site uses start_at / end_at from the
  // event_settings table instead (that's what actually locks challenges),
  // so these only matter for demo mode and the first split second of page load.
  EVENT_START: '2026-10-29T12:00:00-04:00',
  EVENT_END:   '2026-10-30T12:00:00-04:00',  // flags accepted for 24 hours
};
