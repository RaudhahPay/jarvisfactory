-- ============================================================
-- JarvisFactory v2 — v15: conversations + messages (unified threads)
-- ============================================================
-- One thread model for all three modes (chat | cowork | code). Chat/Cowork persist
-- their turns here; code-mode builds still use build_jobs but can link a conversation.
-- Idempotent; RLS scoped to the owner.
-- ============================================================

create table if not exists conversations (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references profiles(id) on delete cascade not null,
  mode       text not null default 'chat' check (mode in ('chat','cowork','code')),
  title      text,
  app_id     uuid references apps(id) on delete set null,   -- code/cowork project link
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_conversations_user on conversations(user_id, updated_at desc);

create table if not exists messages (
  id              uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  user_id         uuid references profiles(id) on delete cascade not null,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null default '',
  meta            jsonb,   -- tokens, model, attachments, tool events, etc.
  created_at      timestamptz default now()
);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

alter table conversations enable row level security;
drop policy if exists "own conversations" on conversations;
create policy "own conversations" on conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table messages enable row level security;
drop policy if exists "own messages" on messages;
create policy "own messages" on messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
