
create table if not exists public.scene_music (
  scene_key text primary key,
  audio_base64 text not null,
  prompt text,
  created_at timestamptz not null default now()
);
alter table public.scene_music enable row level security;
create policy "scene_music readable by all" on public.scene_music for select using (true);
