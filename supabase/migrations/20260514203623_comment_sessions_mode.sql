-- Documentation-only: surface the existing inline SQL comment on
-- public.sessions.mode through pg_catalog so it shows up in Supabase
-- Studio / introspection tools. No schema or behaviour change.
comment on column public.sessions.mode is
  'Conversation mode for this session. chat = original behaviour, full history sent every turn. summary = only the latest user message is sent; the model reads a rolling prose summary from sessions.summary.';
