create table public.dashboard_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('task', 'goal', 'settings')),
  item_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, item_type, item_id)
);

alter table public.dashboard_items enable row level security;

revoke all on table public.dashboard_items from anon;
revoke all on table public.dashboard_items from authenticated;
grant select, insert, update, delete on table public.dashboard_items to authenticated;

create policy "Users can read their dashboard items"
on public.dashboard_items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their dashboard items"
on public.dashboard_items
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their dashboard items"
on public.dashboard_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their dashboard items"
on public.dashboard_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

create function public.set_dashboard_item_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_dashboard_item_updated_at() from public;

create trigger dashboard_items_set_updated_at
before update on public.dashboard_items
for each row execute function public.set_dashboard_item_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dashboard_items'
  ) then
    alter publication supabase_realtime add table public.dashboard_items;
  end if;
end
$$;
