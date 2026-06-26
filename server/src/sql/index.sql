create index if not exists idx_rings_user_id on public.rings(user_id);
create index if not exists idx_payment_devices_shopkeeper_id on public.payment_devices(shopkeeper_id);
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_ring_id on public.transactions(ring_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);
create index if not exists idx_user_logs_user_id on public.user_logs(user_id);

-- ESP Sync: tap_logs indexes
create index if not exists idx_tap_logs_user_id on public.tap_logs(user_id);
create index if not exists idx_tap_logs_reader_mac on public.tap_logs(reader_mac);
create index if not exists idx_tap_logs_tapped_at on public.tap_logs(tapped_at);

-- ESP Sync: synced_esp_events indexes
create index if not exists idx_synced_esp_events_event_id on public.synced_esp_events(event_id);
create index if not exists idx_synced_esp_events_device on public.synced_esp_events(esp_device_id);