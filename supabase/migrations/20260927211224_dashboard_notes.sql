-- Notes sync as their own dashboard items.
alter table public.dashboard_items drop constraint dashboard_items_item_type_check;
alter table public.dashboard_items
  add constraint dashboard_items_item_type_check
  check (item_type in ('task', 'goal', 'note', 'settings'));

-- Images pasted into notes. Each account keeps its files under a folder named by its user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  false,
  10485760,
  array['image/webp', 'image/png', 'image/jpeg', 'image/gif']
)
on conflict (id) do nothing;

create policy "Users can read their note images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload their note images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can replace their note images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their note images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
