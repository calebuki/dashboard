begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'first@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second@example.com', '', now(), now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$insert into public.dashboard_items (user_id, item_type, item_id, payload)
    values ('00000000-0000-0000-0000-000000000001', 'task', 'owned', '{"title":"Mine"}')$$,
  'a user can create an owned item'
);

select throws_ok(
  $$insert into public.dashboard_items (user_id, item_type, item_id, payload)
    values ('00000000-0000-0000-0000-000000000002', 'task', 'foreign', '{}')$$,
  '42501',
  'new row violates row-level security policy for table "dashboard_items"',
  'a user cannot create another user item'
);

select results_eq(
  $$select count(*)::bigint from public.dashboard_items$$,
  $$values (1::bigint)$$,
  'a user can read an owned item'
);

reset role;
insert into public.dashboard_items (user_id, item_type, item_id, payload)
values ('00000000-0000-0000-0000-000000000002', 'task', 'hidden', '{}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq(
  $$select count(*)::bigint from public.dashboard_items$$,
  $$values (1::bigint)$$,
  'another user item is hidden'
);

select lives_ok(
  $$update public.dashboard_items set payload = '{"title":"Updated"}' where item_id = 'owned'$$,
  'a user can update an owned item'
);

select results_eq(
  $$select payload->>'title' from public.dashboard_items where item_id = 'owned'$$,
  $$values ('Updated'::text)$$,
  'the owned update is visible'
);

select results_eq(
  $$update public.dashboard_items set payload = '{}' where item_id = 'hidden' returning item_id$$,
  $$select null::text where false$$,
  'another user item cannot be updated'
);

select lives_ok(
  $$delete from public.dashboard_items where item_id = 'owned'$$,
  'a user can delete an owned item'
);

select * from finish();
rollback;
