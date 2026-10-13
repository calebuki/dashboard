-- Daily log entries sync as their own dashboard items, one per day.
alter table public.dashboard_items drop constraint dashboard_items_item_type_check;
alter table public.dashboard_items
  add constraint dashboard_items_item_type_check
  check (item_type in ('task', 'goal', 'note', 'log', 'settings'));
