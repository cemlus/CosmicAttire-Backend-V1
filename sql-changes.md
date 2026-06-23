Database Schema & Trigger Enhancements

    This document ledger aggregates and tracks all SQL database changes introduced to solve Medium and High severity security issues. Execute these definitions in your Supabase SQL Editor.

---

    ## 1. Privilege Escalation Prevention (Medium Severity)

    ### Context

    Normal authenticated users could escalate their privilege level to  super_admin  by directly updating their  public_data  column.

    ### Resolution

    Enhance the existing  protect_user_profile_updates()  trigger to detect and revert any client-side changes to the  role  and  type  keys inside the  public_data  JSONB object, preserving customer/shopkeeper integrity.

    ### SQL Definition

      create or replace function public.protect_user_profile_updates()
      returns trigger
      language plpgsql
      as $$
      declare
        caller_role text;
      begin
        caller_role := coalesce(current_setting('request.jwt.claim.role', true), '');

        -- Only backend/service_role should be able to change identity/admin fields
        if caller_role <> 'service_role' then
          new.user_id := old.user_id;
          new.username := old.username;
          new.email := old.email;
          new.role := old.role;
          new.public_profile_url := old.public_profile_url;
          new.permission := old.permission;
          new.is_ticket_paid := old.is_ticket_paid;

          -- Prevent escalation by protecting public_data->'role' and public_data->'type'
          if coalesce(new.public_data->>'role', '') <> coalesce(old.public_data->>'role', '') then
            if (old.public_data ? 'role') then
              new.public_data := jsonb_set(new.public_data, '{role}', old.public_data->'role');
            else
              new.public_data := new.public_data - 'role';
            end if;
          end if;

          if coalesce(new.public_data->>'type', '') <> coalesce(old.public_data->>'type', '') then
            if (old.public_data ? 'type') then
              new.public_data := jsonb_set(new.public_data, '{type}', old.public_data->'type');
            else
              new.public_data := new.public_data - 'type';
            end if;
          end if;
        end if;

        new.updated_at = now();
        return new;
      end;
      $$;
    ──────
    ## 2. Atomic Balance Transfers & Transaction Stored Procedure (High Severity)

    ### Context

    Processing multi-step payments (reading wallet, debiting customer, crediting shopkeeper, inserting transaction ledger) inside client-side JS caused race conditions, enabling double-spending, and raised high risks of out-of-sync
    states on partial network failures.

    ### Resolution

    Migrate payment processing to an atomic PostgreSQL stored function called  process_payment() . It locks customer/merchant wallet rows for update ( FOR UPDATE ), processes double-entry ledger debit/credits, records transactions,
    and rolls back atomically on any database failure.

    ### SQL Definition

      create or replace function public.process_payment(
        p_customer_id uuid,
        p_shopkeeper_id uuid,
        p_amount numeric,
        p_ring_id text,
        p_mac_address text,
        p_location text
      )
      returns jsonb
      language plpgsql
      security definer
      as $$
      declare
        v_customer_balance numeric;
        v_shopkeeper_balance numeric;
        v_ring_uuid uuid;
        v_tx_id uuid;
      begin
        -- 1. Lock wallets for update to prevent concurrent updates (avoiding race conditions)
        select balance into v_customer_balance
        from public.wallets
        where user_id = p_customer_id
        for update;

        if not found then
          raise exception 'Customer wallet not found';
        end if;

        select balance into v_shopkeeper_balance
        from public.wallets
        where user_id = p_shopkeeper_id
        for update;

        if not found then
          raise exception 'Shopkeeper wallet not found';
        end if;

        -- 2. Verify customer has sufficient balance
        if v_customer_balance < p_amount then
          raise exception 'Insufficient balance in wallet';
        end if;

        -- 3. Get Ring UUID for transaction reference
        select id into v_ring_uuid
        from public.rings
        where ring_id = p_ring_id;

        -- 4. Perform the balance transfer
        update public.wallets
        set balance = balance - p_amount,
            updated_at = now()
        where user_id = p_customer_id;

        update public.wallets
        set balance = balance + p_amount,
            updated_at = now()
        where user_id = p_shopkeeper_id;

        -- 5. Record the transaction
        insert into public.transactions (
          user_id,
          ring_id,
          amount,
          type,
          description,
          merchant,
          category,
          location,
          status,
          organization_id
        )
        values (
          p_customer_id,
          v_ring_uuid,
          p_amount,
          'payment',
          'Ring payment',
          p_mac_address,
          'payment',
          p_location,
          'completed',
          (select organization_id from public.payment_devices where mac_address = p_mac_address limit 1)
        )
        returning id into v_tx_id;
         -- 6. Return success details
        return jsonb_build_object(
          'status', 'SUCCESS',
          'transaction_id', v_tx_id,
          'balances', jsonb_build_object(
            'customer', jsonb_build_object(
              'before', v_customer_balance,
              'after', v_customer_balance - p_amount
            ),
            'shopkeeper', jsonb_build_object(
              'before', v_shopkeeper_balance,
              'after', v_shopkeeper_balance + p_amount
            )
          )
        );
      end;
      $$;
