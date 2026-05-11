alter table "public"."sessions" add column "mode" text not null default 'chat';

alter table "public"."sessions" add column "summary" text not null default '';

alter table "public"."sessions" add constraint "sessions_mode_check"
  check (mode in ('chat', 'summary')) not valid;

alter table "public"."sessions" validate constraint "sessions_mode_check";
