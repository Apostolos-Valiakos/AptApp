-- How much of each service of a booking the cash and card filters hide.
-- Payments are recorded for the whole booking, so they're matched to services:
--  1. Exact matches first: each way of paying takes the services (and products)
--     whose prices add up to what it paid.
--  2. A way of paying that matches nothing has its money taken from the
--     cheapest services left first; what's left of it reduces the next one.
--     So with Holistic 40 + Sauna 20 paid 15 card + 45 cash, the cash filter
--     hides the sauna and 25 of the holistic (15 shown), the card filter 15 of
--     the sauna (5 shown).
-- hidden_cash / hidden_card / hidden_both are the amounts hidden with the cash
-- filter, the card filter, or both. A cash-bought gift card counts as cash;
-- CASH and other ways are never hidden. paid_with names the way(s) that paid
-- the service, for display. Kept in its own table so filling it never
-- changes a booking's version.
CREATE TABLE IF NOT EXISTS appointment_service_payments (
  appointment_service_id INTEGER PRIMARY KEY REFERENCES appointment_services(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL,
  paid_with TEXT,
  hidden_cash NUMERIC(10, 2) NOT NULL DEFAULT 0,
  hidden_card NUMERIC(10, 2) NOT NULL DEFAULT 0,
  hidden_both NUMERIC(10, 2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_appointment_service_payments_appt ON appointment_service_payments (appointment_id);

CREATE OR REPLACE FUNCTION refresh_service_payments(appt UUID) RETURNS void AS $$
DECLARE
  ids INTEGER[] := '{}';
  prices NUMERIC[] := '{}';
  owner TEXT[] := '{}';
  methods TEXT[] := '{}';
  amounts NUMERIC[] := '{}';
  leftover NUMERIC[] := '{}';
  hid_cash NUMERIC[];
  hid_card NUMERIC[];
  hid_both NUMERIC[];
  visible NUMERIC[];
  cheapest INTEGER[];
  n INT;
  m INT;
  k INT;
  mask INT;
  bit INT;
  total NUMERIC;
  found INT;
  take NUMERIC;
  left_over NUMERIC;
  sets TEXT[][] := ARRAY[ARRAY['cash', ''], ARRAY['card', ''], ARRAY['cash', 'card']];
  set_no INT;
  touched TEXT;
  r RECORD;
BEGIN
  DELETE FROM appointment_service_payments WHERE appointment_id = appt;
  IF appt IS NULL OR NOT EXISTS (SELECT 1 FROM appointments WHERE id = appt) THEN RETURN; END IF;

  -- The items: each service, then each product sold with the booking (a product
  -- has no id here; it can match a payment but has nothing to store).
  FOR r IN
    SELECT aps.id, ROUND(COALESCE(aps.price_override, s.price, 0), 2) AS price
    FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id
    WHERE aps.appointment_id = appt ORDER BY aps.start_time, aps.id
  LOOP
    ids := ids || r.id; prices := prices || r.price::NUMERIC; owner := owner || NULL::TEXT;
  END LOOP;
  FOR r IN SELECT ROUND(total_price, 2) AS price FROM product_sales WHERE appointment_id = appt ORDER BY id LOOP
    ids := ids || NULL::INTEGER; prices := prices || r.price::NUMERIC; owner := owner || NULL::TEXT;
  END LOOP;
  n := COALESCE(array_length(ids, 1), 0);
  IF n = 0 THEN RETURN; END IF;

  -- What each way of paying covered, biggest first.
  FOR r IN
    SELECT CASE WHEN t.payment_method = 'gift-card' AND gc.purchase_payment_method = 'cash' THEN 'cash'
                ELSE COALESCE(t.payment_method, 'other') END AS method,
           ROUND(SUM(t.amount), 2) AS amount
    FROM transactions t LEFT JOIN gift_cards gc ON gc.id = t.gift_card_id
    WHERE t.appointment_id = appt
    GROUP BY 1 HAVING ROUND(SUM(t.amount), 2) > 0
    ORDER BY 2 DESC, 1
  LOOP
    methods := methods || r.method::TEXT; amounts := amounts || r.amount::NUMERIC;
  END LOOP;
  IF COALESCE(array_length(methods, 1), 0) = 0 THEN RETURN; END IF;

  -- 1. Exact matches: each way takes the first set of still-free items adding
  -- up to it. A booking has a handful of items, so trying every set is quick.
  FOR m IN 1..array_length(methods, 1) LOOP
    found := NULL;
    FOR mask IN 1..((1 << n) - 1) LOOP
      total := 0;
      FOR bit IN 1..n LOOP
        IF (mask & (1 << (bit - 1))) <> 0 THEN
          IF owner[bit] IS NOT NULL THEN total := NULL; EXIT; END IF;
          total := total + prices[bit];
        END IF;
      END LOOP;
      IF total IS NOT NULL AND ABS(total - amounts[m]) < 0.01 THEN found := mask; EXIT; END IF;
    END LOOP;
    IF found IS NULL THEN
      leftover := leftover || amounts[m];
    ELSE
      leftover := leftover || 0::NUMERIC;
      FOR bit IN 1..n LOOP
        IF (found & (1 << (bit - 1))) <> 0 THEN owner[bit] := methods[m]; END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 2. For each filter (cash, card, both): a matched service of a hidden way
  -- is hidden whole; a hidden way that matched nothing has its money taken
  -- from the cheapest free services first.
  SELECT array_agg(i ORDER BY prices[i], i) INTO cheapest
  FROM generate_subscripts(prices, 1) i WHERE ids[i] IS NOT NULL AND owner[i] IS NULL;
  hid_cash := array_fill(0::NUMERIC, ARRAY[n]);
  hid_card := array_fill(0::NUMERIC, ARRAY[n]);
  hid_both := array_fill(0::NUMERIC, ARRAY[n]);
  FOR set_no IN 1..3 LOOP
    visible := prices;
    FOR bit IN 1..n LOOP
      IF owner[bit] IS NOT NULL AND (owner[bit] = sets[set_no][1] OR owner[bit] = sets[set_no][2]) THEN
        visible[bit] := 0;
      END IF;
    END LOOP;
    FOR m IN 1..array_length(methods, 1) LOOP
      IF leftover[m] > 0 AND (methods[m] = sets[set_no][1] OR methods[m] = sets[set_no][2]) THEN
        left_over := leftover[m];
        FOR k IN 1..COALESCE(array_length(cheapest, 1), 0) LOOP
          EXIT WHEN left_over <= 0;
          take := LEAST(left_over, visible[cheapest[k]]);
          visible[cheapest[k]] := visible[cheapest[k]] - take;
          left_over := left_over - take;
        END LOOP;
      END IF;
    END LOOP;
    FOR bit IN 1..n LOOP
      IF set_no = 1 THEN hid_cash[bit] := prices[bit] - visible[bit];
      ELSIF set_no = 2 THEN hid_card[bit] := prices[bit] - visible[bit];
      ELSE hid_both[bit] := prices[bit] - visible[bit]; END IF;
    END LOOP;
  END LOOP;

  -- Ways that matched nothing, for display ("cash,card").
  SELECT string_agg(methods[i], ',' ORDER BY methods[i]) INTO touched
  FROM generate_subscripts(methods, 1) i WHERE leftover[i] > 0;

  FOR bit IN 1..n LOOP
    IF ids[bit] IS NOT NULL THEN
      INSERT INTO appointment_service_payments
        (appointment_service_id, appointment_id, paid_with, hidden_cash, hidden_card, hidden_both)
      VALUES (ids[bit], appt, COALESCE(owner[bit], touched), hid_cash[bit], hid_card[bit], hid_both[bit]);
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;

-- Kept up to date by the database itself, whatever changed the booking.
CREATE OR REPLACE FUNCTION refresh_service_payments_trigger() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM refresh_service_payments(OLD.appointment_id); END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id) THEN
    PERFORM refresh_service_payments(NEW.appointment_id);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_service_payments ON transactions;
CREATE TRIGGER trg_transactions_service_payments
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION refresh_service_payments_trigger();
DROP TRIGGER IF EXISTS trg_appointment_services_service_payments ON appointment_services;
CREATE TRIGGER trg_appointment_services_service_payments
  AFTER INSERT OR DELETE OR UPDATE OF price_override, service_id, appointment_id ON appointment_services
  FOR EACH ROW EXECUTE FUNCTION refresh_service_payments_trigger();
DROP TRIGGER IF EXISTS trg_product_sales_service_payments ON product_sales;
CREATE TRIGGER trg_product_sales_service_payments
  AFTER INSERT OR UPDATE OR DELETE ON product_sales
  FOR EACH ROW EXECUTE FUNCTION refresh_service_payments_trigger();

-- Bookings paid before this, matched the same way.
SELECT refresh_service_payments(id) FROM appointments
WHERE id IN (SELECT DISTINCT appointment_id FROM transactions WHERE appointment_id IS NOT NULL);
