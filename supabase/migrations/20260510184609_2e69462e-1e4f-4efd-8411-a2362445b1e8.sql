create table if not exists public.room_audio (
  slug text primary key,
  music_url text,
  ambient_url text,
  status text not null default 'pending',
  generated_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.room_audio enable row level security;
create policy "room_audio readable" on public.room_audio for select to authenticated using (true);

insert into storage.buckets (id, name, public)
values ('room-audio', 'room-audio', true)
on conflict (id) do nothing;

create policy "room-audio public read"
on storage.objects for select
using (bucket_id = 'room-audio');