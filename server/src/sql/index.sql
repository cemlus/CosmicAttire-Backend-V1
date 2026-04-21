create index if not exists idx_rings_user_id on public.rings(user_id);
create index if not exists idx_payment_devices_shopkeeper_id on public.payment_devices(shopkeeper_id);
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_ring_id on public.transactions(ring_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);
create index if not exists idx_user_logs_user_id on public.user_logs(user_id);