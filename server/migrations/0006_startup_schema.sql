-- The schema statements that used to run on every server start. All are
-- safe to repeat, so a database that already has them is unchanged, and from
-- now on each runs once. New schema changes go in new migrations.

CREATE TABLE IF NOT EXISTS contests (
    id SERIAL PRIMARY KEY,
    shop_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
CREATE TABLE IF NOT EXISTS gift_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_number VARCHAR(50) NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    initial_amount NUMERIC(10,2) NOT NULL,
    remaining_balance NUMERIC(10,2) NOT NULL,
    purchase_payment_method VARCHAR(50),
    shop_id UUID NOT NULL REFERENCES shops(id),
    issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
DO $$
  BEGIN
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gift_card_id UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ALL (c.conkey)
      WHERE c.contype = 'f' AND c.conrelid = 'transactions'::regclass AND a.attname = 'gift_card_id'
    ) THEN
      ALTER TABLE transactions ADD CONSTRAINT transactions_gift_card_id_fkey
        FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id) ON DELETE SET NULL;
    END IF;
  END $$;
-- Which staff member sold the card. NULL means "Frontdesk" (no specific
-- staff member attributed) — the app always sends an explicit value (a
-- staff id or null-for-frontdesk), this is just nullable at the DB level.
DO $$
  BEGIN
    ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS sold_by_staff_id UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ALL (c.conkey)
      WHERE c.contype = 'f' AND c.conrelid = 'gift_cards'::regclass AND a.attname = 'sold_by_staff_id'
    ) THEN
      ALTER TABLE gift_cards ADD CONSTRAINT gift_cards_sold_by_staff_id_fkey
        FOREIGN KEY (sold_by_staff_id) REFERENCES staff(id) ON DELETE SET NULL;
    END IF;
  END $$;
-- Shared across the two rows created by a single "split" payment (e.g. part
-- gift-card + part cash in one visit), so reports can flag them as linked.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_group_id UUID;
-- Lets a service be retired (menu no longer offers it) without breaking
-- past appointments that still reference it — same pattern as staff.is_active.
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
-- Opt-in switch for the client self-booking portal: a service must be
-- explicitly marked bookable online before it appears there, independent
-- of is_active (an active service can still be staff/admin-booking-only).
ALTER TABLE services ADD COLUMN IF NOT EXISTS bookable_online BOOLEAN NOT NULL DEFAULT false;
-- Shop-wide switch for the client self-booking portal. Off by default so
-- existing shops see no change until the owner turns it on.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS self_booking_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL,
    description TEXT NOT NULL,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
    created_by_user_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_expenses_shop_date ON expenses(shop_id, expense_date);
-- Debt added by hand (e.g. an old balance from a previous system), not
-- tied to an appointment. Payments/write-offs against it point here.
CREATE TABLE IF NOT EXISTS client_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    debt_date DATE NOT NULL,
    note TEXT NOT NULL,
    created_by_user_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_client_debts_client ON client_debts(client_id);
DO $$
  BEGIN
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_debt_id UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ALL (c.conkey)
      WHERE c.contype = 'f' AND c.conrelid = 'transactions'::regclass AND a.attname = 'client_debt_id'
    ) THEN
      ALTER TABLE transactions ADD CONSTRAINT transactions_client_debt_id_fkey
        FOREIGN KEY (client_debt_id) REFERENCES client_debts(id) ON DELETE SET NULL;
    END IF;
  END $$;
-- Lets a staff member keep their login/appointments without cluttering the
-- scheduler with a resource column (e.g. frontdesk-only accounts).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS visible_in_calendar BOOLEAN NOT NULL DEFAULT true;
-- Staff leave (full day(s) off) and breaks (a time window on one day).
-- start_time/end_time are NULL for a leave entry (the whole day is off).
CREATE TABLE IF NOT EXISTS staff_time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id),
    type VARCHAR(10) NOT NULL CHECK (type IN ('leave', 'break')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
-- Recurring weekly working-hours pattern. false (default) means "never
-- configured" — fully unrestricted, exactly today's behavior for every
-- pre-existing staff member. Once true, staff_working_hours rows become
-- authoritative: a day with no rows is a day off; a day with rows is only
-- bookable within them (multiple rows per day = a split shift).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS working_hours_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS staff_working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id),
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
  );
-- Effective-dated schedule versions: rows sharing (staff_id, effective_from)
-- collectively form one version. "Current" and "upcoming" aren't stored
-- states — they're just whichever version has the latest effective_from
-- <=/> CURRENT_DATE at query time, so a staged version becomes current
-- automatically the day it arrives, with no rollover job needed. Existing
-- rows default to today, which resolves identically to the old
-- single-pattern behavior for every past date (no version found -> unrestricted).
ALTER TABLE staff_working_hours ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE;
-- Per-day-of-week shop operating hours — unlike staff_working_hours,
-- deliberately NOT effective-dated (the shop's own hours aren't expected
-- to need a historical record the way staff schedules do). A day with no
-- row means the shop is closed that day. Separate from shops.slot_min_time/
-- slot_max_time, which remain the calendar's fixed rendering bounds.
CREATE TABLE IF NOT EXISTS shop_hours (
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    PRIMARY KEY (shop_id, day_of_week),
    CHECK (end_time > start_time)
  );
-- ==================== PRODUCT USAGE TRACKING ====================
-- A service can list one or more products it consumes (e.g. "Massage ->
-- 5ml of oil"), so the business can compare theoretical/expected usage
-- (recipe amount x appointment count) against what's actually being
-- consumed, and catch waste/misuse. amount_type is validated in app code
-- (server/productUsage.js), not via a DB CHECK, so adding a new type
-- later needs no migration.
CREATE TABLE IF NOT EXISTS service_product_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    product_inventory_id UUID NOT NULL REFERENCES product_inventory(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id),
    amount_type VARCHAR(10) NOT NULL, -- 'exact' | 'range' | 'bottle'
    amount_value NUMERIC(10,2),        -- 'exact': ml amount. 'bottle': bottle count.
    amount_min NUMERIC(10,2),          -- 'range': lower bound, ml
    amount_max NUMERIC(10,2),          -- 'range': upper bound, ml
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (service_id, product_inventory_id)
  );
-- Periodic physical stock counts for ml/range-type recipes ("how much is
-- actually left in the bottle right now"). restocked_amount_ml covers
-- opening a fresh bottle between counts: actual used since the previous
-- count = previous.remaining_amount_ml + this.restocked_amount_ml -
-- this.remaining_amount_ml.
CREATE TABLE IF NOT EXISTS product_usage_stocktakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_inventory_id UUID NOT NULL REFERENCES product_inventory(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id),
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    remaining_amount_ml NUMERIC(10,2) NOT NULL,
    restocked_amount_ml NUMERIC(10,2) NOT NULL DEFAULT 0,
    notes TEXT,
    recorded_by_user_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
-- Audit trail behind the existing manual +/- stock stepper (previously a
-- bare UPDATE with no history) — needed so bottle-type recipes' "actual
-- usage in period X" is computable from something other than a live,
-- unhistoried number. Only manual adjustments are logged here, not
-- sale-driven decrements (those already have their own full record via
-- product_sales, so aren't duplicated into this log).
CREATE TABLE IF NOT EXISTS product_stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_inventory_id UUID NOT NULL REFERENCES product_inventory(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id),
    delta INTEGER NOT NULL,
    recorded_by_user_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
-- ==================== PERFORMANCE INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_transactions_appointment_id ON transactions (appointment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_created ON transactions (shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_sales_appointment_id ON product_sales (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointments_shop_id ON appointments (shop_id);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments (client_id);
CREATE INDEX IF NOT EXISTS idx_clients_shop_id ON clients (shop_id);
CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files (client_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_shop_id ON gift_cards (shop_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_card_number ON gift_cards (card_number);
CREATE INDEX IF NOT EXISTS idx_gift_cards_client_id ON gift_cards (client_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_sold_by_staff_id ON gift_cards (sold_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_staff_id ON staff_time_off (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_dates ON staff_time_off (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_staff_working_hours_staff_id ON staff_working_hours (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_working_hours_staff_day ON staff_working_hours (staff_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_staff_working_hours_shop_id ON staff_working_hours (shop_id);
CREATE INDEX IF NOT EXISTS idx_staff_working_hours_staff_effective ON staff_working_hours (staff_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_service_product_recipes_service_id ON service_product_recipes (service_id);
CREATE INDEX IF NOT EXISTS idx_service_product_recipes_shop_id ON service_product_recipes (shop_id);
CREATE INDEX IF NOT EXISTS idx_product_usage_stocktakes_inventory_id ON product_usage_stocktakes (product_inventory_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_product_stock_adjustments_inventory_id ON product_stock_adjustments (product_inventory_id, created_at);
CREATE INDEX IF NOT EXISTS idx_appointment_services_service_start ON appointment_services (service_id, start_time);

-- ==================== OFFLINE-SYNC IDEMPOTENCY ====================
-- Backs the client's IndexedDB offline write queue: a queued
-- appointment/payment write carries an Idempotency-Key header, and if the
-- same key is replayed (e.g. a flaky reconnect causes a retry after the
-- first attempt already succeeded), the cached response is returned instead
-- of re-running the write.
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(100) PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES shops(id),
    response_status INT NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys (created_at);
-- Appointment versions, for offline/concurrent edit conflicts (see
-- assertBaseVersion). Raised on any meaningful change of the appointment
-- row (not the reminder-sent flags set by background jobs), and whenever
-- its services or payments change.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION bump_appointment_version() RETURNS trigger AS $$
  BEGIN
    IF (to_jsonb(NEW) - 'version' - 'updated_at' - 'email_reminder_sent' - 'push_reminder_sent')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'version' - 'updated_at' - 'email_reminder_sent' - 'push_reminder_sent') THEN
      NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
  END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_appointments_version ON appointments;
CREATE TRIGGER trg_appointments_version BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION bump_appointment_version();
CREATE OR REPLACE FUNCTION bump_parent_appointment_version() RETURNS trigger AS $$
  BEGIN
    UPDATE appointments SET version = version + 1
    WHERE id = COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.appointment_id ELSE NEW.appointment_id END, NULL);
    RETURN NULL;
  END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_appointment_services_appointment_version ON appointment_services;
CREATE TRIGGER trg_appointment_services_appointment_version
  AFTER INSERT OR UPDATE OR DELETE ON appointment_services
  FOR EACH ROW EXECUTE FUNCTION bump_parent_appointment_version();
DROP TRIGGER IF EXISTS trg_transactions_appointment_version ON transactions;
CREATE TRIGGER trg_transactions_appointment_version
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION bump_parent_appointment_version();

-- ==================== WEB PUSH (client portal notifications) ====================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_client_id ON push_subscriptions (client_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_shop_id ON push_subscriptions (shop_id);
-- Tracked separately from email_reminder_sent — a client can have push
-- enabled with emails off (or vice versa), so each channel gets its own
-- "already notified for this appointment" flag.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS push_reminder_sent BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS discount_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    percentage NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_codes_shop_name ON discount_codes (shop_id, LOWER(name));
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_scope VARCHAR(10);
DO $$
  BEGIN
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_code_id UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ALL (c.conkey)
      WHERE c.contype = 'f' AND c.conrelid = 'appointments'::regclass AND a.attname = 'discount_code_id'
    ) THEN
      ALTER TABLE appointments ADD CONSTRAINT appointments_discount_code_id_fkey
        FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE SET NULL;
    END IF;
  END $$;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_code_name VARCHAR(100);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE appointment_services ADD COLUMN IF NOT EXISTS list_price NUMERIC(10,2);
ALTER TABLE appointment_services ADD COLUMN IF NOT EXISTS variation_name VARCHAR(255);
ALTER TABLE product_sales ADD COLUMN IF NOT EXISTS list_total NUMERIC(10,2);
CREATE INDEX IF NOT EXISTS idx_appointments_discount ON appointments (shop_id) WHERE discount_amount > 0;
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    sent_by_user_id UUID,
    recipient_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_shop_id ON broadcast_messages (shop_id, created_at);
-- In-app notification history — recorded independently of whether the
-- OS-level push actually reached the client (no subscription, permission
-- denied, etc). The client portal's notification bell reads this table
-- directly rather than relying on the transient OS notification tray.
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    read_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_client_id ON notification_deliveries (client_id, created_at DESC);

-- ==================== PLATFORM / MULTI-TENANT ADMIN SCHEMA ====================
ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'trial';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS notes TEXT;
-- "Disconnect all users" admin action: any JWT issued before this timestamp
-- is rejected by authenticateToken (see forceLogoutCache below). Combined
-- with force_hide_cash, a persisted shop-wide Ctrl+1 lock applied at login.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS force_logout_at TIMESTAMP;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS force_hide_cash BOOLEAN NOT NULL DEFAULT false;
-- Which tier currently owns the cash-hide lock ('admin' | 'super_admin' |
-- NULL when unlocked) — an admin's lock can be released by any admin or a
-- super_admin, but a super_admin's lock can only be released by a
-- super_admin. See canUnlockCashFilter.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS force_hide_cash_locked_by VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
CREATE TABLE IF NOT EXISTS platform_activity_log (
    id SERIAL PRIMARY KEY,
    actor_user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    target_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
    detail TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_platform_activity_log_shop ON platform_activity_log (target_shop_id);
CREATE INDEX IF NOT EXISTS idx_platform_activity_log_created ON platform_activity_log (created_at DESC);

-- ==================== MEMBERSHIP CLUB SCHEMA ====================
CREATE TABLE IF NOT EXISTS membership_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id),
    name VARCHAR(100) NOT NULL,
    monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    yearly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    color VARCHAR(20),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    grace_period_days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
-- What a tier covers. quota_per_month = NULL means unlimited.
CREATE TABLE IF NOT EXISTS membership_tier_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_id UUID NOT NULL REFERENCES membership_tiers(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    quota_per_month INTEGER,
    UNIQUE (tier_id, service_id)
  );
-- A client's enrollment. billing_cycle is payment frequency only — quotas
-- always reset monthly regardless of monthly/yearly billing (see plan).
CREATE TABLE IF NOT EXISTS client_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id),
    tier_id UUID NOT NULL REFERENCES membership_tiers(id),
    billing_cycle VARCHAR(10) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    current_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMP NOT NULL,
    last_payment_recorded_at TIMESTAMP,
    renewal_reminder_sent_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
-- One row per redeemed visit. Remaining quota for the current month is
-- always computed as quota_per_month - COUNT(rows with used_at in the
-- current calendar month) — no separate "reset" write needed.
CREATE TABLE IF NOT EXISTS membership_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_membership_id UUID NOT NULL REFERENCES client_memberships(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id),
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    used_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
-- Every client gets a QR code, independent of membership — used for staff
-- lookup and (per the contest rework below) registering contest entries.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_qr_token ON clients (qr_token);
-- Contest participation via QR scan — replaces the old computed
-- "1 entry per completed+paid appointment" mechanic entirely. The unique
-- constraint enforces at most one scan-entry per client per contest per day.
CREATE TABLE IF NOT EXISTS contest_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (contest_id, client_id, entry_date)
  );
CREATE INDEX IF NOT EXISTS idx_membership_tier_services_tier ON membership_tier_services (tier_id);
CREATE INDEX IF NOT EXISTS idx_client_memberships_client ON client_memberships (client_id);
CREATE INDEX IF NOT EXISTS idx_client_memberships_shop_status ON client_memberships (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_membership_usage_membership ON membership_usage (client_membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_usage_used_at ON membership_usage (used_at);
CREATE INDEX IF NOT EXISTS idx_contest_entries_contest_client ON contest_entries (contest_id, client_id);

-- ==================== PREPAID PACKAGES SCHEMA ====================
-- A package type ("5 Sauna visits — 100") is sold once to a client; each
-- redeemed visit is a package_usage row, so remaining visits are always
-- derived (total_visits - COUNT(usage)) and never drift.
CREATE TABLE IF NOT EXISTS package_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    visits INTEGER NOT NULL CHECK (visits > 0),
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    validity_days INTEGER CHECK (validity_days IS NULL OR validity_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE TABLE IF NOT EXISTS client_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    package_type_id UUID REFERENCES package_types(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    total_visits INTEGER NOT NULL CHECK (total_visits >= 0),
    price_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
    purchased_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    note TEXT
  );
CREATE TABLE IF NOT EXISTS package_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_package_id UUID NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    transaction_id INTEGER,
    used_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_package_types_shop ON package_types (shop_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_client ON client_packages (client_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_shop ON client_packages (shop_id);
CREATE INDEX IF NOT EXISTS idx_package_usage_package ON package_usage (client_package_id);
CREATE INDEX IF NOT EXISTS idx_package_usage_appointment ON package_usage (appointment_id);

-- One ordinary client per shop, reused for every walk-in booking (a fast
-- "save now, attribute to a real client later" flow) — deliberately just a
-- ref to a plain clients row, not a flagged/hidden pseudo-client: it shows up
-- in the client list/search/reports like anyone else, and its balance only
-- ever holds whatever hasn't been reassigned to a real client yet.
DO $$
  BEGIN
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS walk_in_client_id UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ALL (c.conkey)
      WHERE c.contype = 'f' AND c.conrelid = 'shops'::regclass AND a.attname = 'walk_in_client_id'
    ) THEN
      ALTER TABLE shops ADD CONSTRAINT shops_walk_in_client_id_fkey
        FOREIGN KEY (walk_in_client_id) REFERENCES clients(id) ON DELETE SET NULL;
    END IF;
  END $$;

-- ==================== SERVICE COMBOS SCHEMA ====================
-- A combo service (e.g. "Sport + Sauna") keeps its own price/duration but
-- lists other real services as "components" that get carved out into their
-- own schedule block when booked (e.g. a Sauna block, auto-assigned to
-- whichever staff member is that service's default). Replaces name-keyword
-- guessing with an explicit, admin-configured combination.
DO $$
  BEGIN
    ALTER TABLE services ADD COLUMN IF NOT EXISTS default_staff_id UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ALL (c.conkey)
      WHERE c.contype = 'f' AND c.conrelid = 'services'::regclass AND a.attname = 'default_staff_id'
    ) THEN
      ALTER TABLE services ADD CONSTRAINT services_default_staff_id_fkey
        FOREIGN KEY (default_staff_id) REFERENCES staff(id) ON DELETE SET NULL;
    END IF;
  END $$;
CREATE TABLE IF NOT EXISTS service_combo_components (
    id SERIAL PRIMARY KEY,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    component_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(service_id, component_service_id)
  );
CREATE INDEX IF NOT EXISTS idx_service_combo_components_service_id ON service_combo_components(service_id);

-- ==================== SERVICE VARIATIONS SCHEMA ====================
-- A service can optionally offer several named price/duration options (e.g.
-- "30 minutes" / "60 minutes") instead of one fixed price+duration. The
-- service's own price/duration columns stay as-is and keep working
-- unchanged for services with no variations (the common case); when
-- variations exist, the booking picker offers them instead of the base
-- price, matching Fresha's "expand for options" pattern.
CREATE TABLE IF NOT EXISTS service_variations (
    id SERIAL PRIMARY KEY,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
CREATE INDEX IF NOT EXISTS idx_service_variations_service_id ON service_variations(service_id);

-- ==================== SERVICE CATEGORIES / MANUAL ORDERING SCHEMA ====================
-- `services.category` stays free text (unchanged everywhere it's already
-- read/written) — this table just gives each distinct category name within a
-- shop a place to store a drag-reorderable position, without a sweeping
-- refactor to a hard foreign key. `services.sort_order` is the equivalent for
-- ordering services within their own category.
CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(shop_id, name)
  );
ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS color_code VARCHAR(20);
-- One-time backfill per shop: seed service_categories from whatever
-- category names already exist, and give every service a deterministic
-- initial sort_order (alphabetical within its category) — but only for a
-- shop that has never had any service manually reordered yet (sort_order
-- still 0 everywhere). The moment a single service in a shop gets a real
-- position, this becomes permanently inert for that shop.
INSERT INTO service_categories (shop_id, name, sort_order)
  SELECT shop_id, category, ROW_NUMBER() OVER (PARTITION BY shop_id ORDER BY category) - 1
  FROM (SELECT DISTINCT shop_id, category FROM services WHERE category IS NOT NULL AND category != '') sub
  ON CONFLICT (shop_id, name) DO NOTHING;
UPDATE services s
  SET sort_order = sub.rn - 1
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY shop_id, category ORDER BY name) AS rn
    FROM services
  ) sub
  WHERE s.id = sub.id
  AND NOT EXISTS (SELECT 1 FROM services s2 WHERE s2.shop_id = s.shop_id AND s2.sort_order != 0);

-- ==================== REFUNDS & CHECKOUT PRICE CHANGES SCHEMA ====================
-- Refunds are ordinary negative-amount `transactions` rows (transaction_type
-- 'refund') — every revenue/debt/balance query already just SUMs `amount`,
-- so this nets out correctly everywhere for free, with no other query
-- changes needed. `reason` + `created_by_user_id` are new, generic columns
-- (useful for any transaction, not just refunds).
--
-- Checkout price changes aren't a money movement by themselves (they just
-- change what's owed), so they don't belong in `transactions` — they get
-- their own small audit table instead, purely for the admin report.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(255);
CREATE TABLE IF NOT EXISTS price_adjustments (
    id SERIAL PRIMARY KEY,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id),
    old_total NUMERIC(10,2) NOT NULL,
    new_total NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL,
    created_by_user_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
CREATE INDEX IF NOT EXISTS idx_price_adjustments_shop_created ON price_adjustments(shop_id, created_at);

-- ==================== LANDING PAGE / DEMO REQUESTS SCHEMA ====================
CREATE TABLE IF NOT EXISTS demo_requests (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    shop_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new';
