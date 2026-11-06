-- Baseline schema (structure only, no data): the database as it stood on
-- 27 Oct 2026, from the dev database with duplicate constraints removed.
-- Runs only on a new, empty database (see server/migrate.js); an existing
-- one is marked as already having it.
--
-- PostgreSQL database dump
--


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: bump_appointment_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_appointment_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        IF (to_jsonb(NEW) - 'version' - 'updated_at' - 'email_reminder_sent' - 'push_reminder_sent')
           IS DISTINCT FROM
           (to_jsonb(OLD) - 'version' - 'updated_at' - 'email_reminder_sent' - 'push_reminder_sent') THEN
          NEW.version := OLD.version + 1;
        END IF;
        RETURN NEW;
      END $$;


--
-- Name: bump_parent_appointment_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_parent_appointment_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        UPDATE appointments SET version = version + 1
        WHERE id = COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.appointment_id ELSE NEW.appointment_id END, NULL);
        RETURN NULL;
      END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255),
    phone character varying(20),
    notes text,
    no_show_count integer DEFAULT 0,
    total_sales numeric(10,2) DEFAULT 0.00,
    shop_id uuid,
    custom_fields jsonb DEFAULT '[]'::jsonb,
    outstanding_balance numeric(10,2) DEFAULT 0.00,
    ergotherapia boolean DEFAULT false,
    physiotherapia boolean DEFAULT false,
    logotherapia boolean DEFAULT false,
    receive_emails boolean DEFAULT true,
    date_of_birth date,
    is_deleted boolean DEFAULT false,
    qr_token uuid DEFAULT public.gen_random_uuid()
);


--
-- Name: active_clients; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_clients AS
 SELECT clients.id,
    clients.first_name,
    clients.last_name,
    clients.email,
    clients.phone,
    clients.notes,
    clients.no_show_count,
    clients.total_sales,
    clients.shop_id,
    clients.custom_fields,
    clients.outstanding_balance,
    clients.ergotherapia,
    clients.physiotherapia,
    clients.logotherapia,
    clients.receive_emails,
    clients.date_of_birth,
    clients.is_deleted
   FROM public.clients
  WHERE (clients.is_deleted = false);


--
-- Name: appointment_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_services (
    id integer NOT NULL,
    appointment_id uuid NOT NULL,
    service_id uuid NOT NULL,
    staff_id uuid,
    start_time timestamp with time zone NOT NULL,
    duration_override integer DEFAULT 0,
    price_override numeric(10,2) DEFAULT 0,
    shop_id uuid,
    list_price numeric(10,2),
    variation_name character varying(255)
);


--
-- Name: appointment_services_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_services_id_seq OWNED BY public.appointment_services.id;


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    client_id uuid,
    status character varying(50) DEFAULT 'Booked'::character varying,
    recurrence character varying(255) DEFAULT 'once'::character varying,
    created_by_user_id character varying(255) DEFAULT 'admin'::character varying,
    internal_notes text,
    booking_notes text,
    deposit_amount numeric(10,2) DEFAULT 0.00,
    payment_status character varying(20) DEFAULT 'unpaid'::character varying,
    cancellation_fee boolean DEFAULT false,
    is_block boolean DEFAULT false,
    price_override numeric(10,2),
    duration_override integer,
    group_id uuid,
    created_at date,
    updated_at date,
    shop_id uuid,
    save_receipt boolean DEFAULT true,
    is_eoppy boolean DEFAULT false,
    email_reminder_sent boolean DEFAULT false,
    push_reminder_sent boolean DEFAULT false NOT NULL,
    discount_type character varying(10),
    discount_value numeric(10,2),
    discount_scope character varying(10),
    discount_code_id uuid,
    discount_code_name character varying(100),
    discount_amount numeric(10,2) DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: broadcast_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_messages (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    sent_by_user_id uuid,
    recipient_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: channel_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_members (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp without time zone DEFAULT now(),
    last_read_at timestamp without time zone DEFAULT now()
);


--
-- Name: chat_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_channels (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    message_type character varying(50) DEFAULT 'text'::character varying,
    content text,
    file_name text,
    file_size integer,
    file_type character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    file_blob bytea
);


--
-- Name: client_debts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_debts (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    client_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    debt_date date NOT NULL,
    note text NOT NULL,
    created_by_user_id character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_debts_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: client_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_exercises (
    client_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    achieved_at timestamp without time zone DEFAULT now()
);


--
-- Name: client_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_files (
    id integer NOT NULL,
    client_id uuid,
    file_name text NOT NULL,
    file_type text,
    file_size integer,
    file_data bytea,
    uploaded_at timestamp without time zone DEFAULT now()
);


--
-- Name: client_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_files_id_seq OWNED BY public.client_files.id;


--
-- Name: client_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_memberships (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    tier_id uuid NOT NULL,
    billing_cycle character varying(10) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    current_period_start timestamp without time zone DEFAULT now() NOT NULL,
    current_period_end timestamp without time zone NOT NULL,
    last_payment_recorded_at timestamp without time zone,
    renewal_reminder_sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_memberships_billing_cycle_check CHECK (((billing_cycle)::text = ANY (ARRAY[('monthly'::character varying)::text, ('yearly'::character varying)::text]))),
    CONSTRAINT client_memberships_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('paused'::character varying)::text, ('cancelled'::character varying)::text, ('expired'::character varying)::text])))
);


--
-- Name: client_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_packages (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    client_id uuid NOT NULL,
    package_type_id uuid,
    name character varying(100) NOT NULL,
    service_id uuid NOT NULL,
    total_visits integer NOT NULL,
    price_paid numeric(10,2) DEFAULT 0 NOT NULL,
    purchased_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    note text,
    CONSTRAINT client_packages_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT client_packages_total_visits_check CHECK ((total_visits >= 0))
);


--
-- Name: contest_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contest_entries (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    contest_id integer NOT NULL,
    client_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contests (
    id integer NOT NULL,
    shop_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    image_url text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: contests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contests_id_seq OWNED BY public.contests.id;


--
-- Name: demo_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_requests (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    shop_name character varying(255) NOT NULL,
    phone character varying(50),
    message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'new'::character varying NOT NULL
);


--
-- Name: demo_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.demo_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: demo_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.demo_requests_id_seq OWNED BY public.demo_requests.id;


--
-- Name: discount_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_codes (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    percentage numeric(5,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT discount_codes_percentage_check CHECK (((percentage > (0)::numeric) AND (percentage <= (100)::numeric)))
);


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'General'::text,
    description text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    expense_date date NOT NULL,
    description text NOT NULL,
    payment_method character varying(20) DEFAULT 'cash'::character varying NOT NULL,
    created_by_user_id character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: gift_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_cards (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    card_number character varying(50) NOT NULL,
    client_id uuid,
    customer_name character varying(255) NOT NULL,
    initial_amount numeric(10,2) NOT NULL,
    remaining_balance numeric(10,2) NOT NULL,
    purchase_payment_method character varying(50),
    shop_id uuid NOT NULL,
    issued_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    sold_by_staff_id uuid
);


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    key character varying(100) NOT NULL,
    shop_id uuid NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: membership_tier_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_tier_services (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    tier_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quota_per_month integer
);


--
-- Name: membership_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_tiers (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    monthly_price numeric(10,2) DEFAULT 0 NOT NULL,
    yearly_price numeric(10,2) DEFAULT 0 NOT NULL,
    color character varying(20),
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    grace_period_days integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: membership_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_usage (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    client_membership_id uuid NOT NULL,
    service_id uuid NOT NULL,
    appointment_id uuid,
    used_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: message_read_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_read_receipts (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp without time zone DEFAULT now()
);


--
-- Name: notification_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_deliveries (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    type character varying(20) NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    url text,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: package_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_types (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    service_id uuid NOT NULL,
    visits integer NOT NULL,
    price numeric(10,2) NOT NULL,
    validity_days integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT package_types_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT package_types_validity_days_check CHECK (((validity_days IS NULL) OR (validity_days > 0))),
    CONSTRAINT package_types_visits_check CHECK ((visits > 0))
);


--
-- Name: package_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_usage (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    client_package_id uuid NOT NULL,
    appointment_id uuid,
    service_id uuid NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    transaction_id integer,
    used_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_activity_log (
    id integer NOT NULL,
    actor_user_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    target_shop_id uuid,
    detail text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_activity_log_id_seq OWNED BY public.platform_activity_log.id;


--
-- Name: price_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_adjustments (
    id integer NOT NULL,
    appointment_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    old_total numeric(10,2) NOT NULL,
    new_total numeric(10,2) NOT NULL,
    reason text NOT NULL,
    created_by_user_id character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: price_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.price_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: price_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.price_adjustments_id_seq OWNED BY public.price_adjustments.id;


--
-- Name: product_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_inventory (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    product_id uuid,
    variation_name text,
    price numeric(10,2) DEFAULT 0.00 NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    sku text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_inventory_stock_quantity_check CHECK ((stock_quantity >= 0))
);


--
-- Name: product_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_sales (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    inventory_id uuid,
    staff_id uuid,
    client_id uuid,
    quantity integer NOT NULL,
    total_price numeric(10,2) NOT NULL,
    sale_date timestamp with time zone DEFAULT now(),
    appointment_id uuid,
    shop_id uuid,
    list_total numeric(10,2),
    CONSTRAINT product_sales_quantity_check CHECK ((quantity > 0))
);


--
-- Name: product_stock_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_stock_adjustments (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    product_inventory_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    delta integer NOT NULL,
    recorded_by_user_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_usage_stocktakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_usage_stocktakes (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    product_inventory_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    recorded_at timestamp without time zone DEFAULT now() NOT NULL,
    remaining_amount_ml numeric(10,2) NOT NULL,
    restocked_amount_ml numeric(10,2) DEFAULT 0 NOT NULL,
    notes text,
    recorded_by_user_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: service_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_categories (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    color_code character varying(20)
);


--
-- Name: service_combo_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_combo_components (
    id integer NOT NULL,
    service_id uuid NOT NULL,
    component_service_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: service_combo_components_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_combo_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_combo_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_combo_components_id_seq OWNED BY public.service_combo_components.id;


--
-- Name: service_product_recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_product_recipes (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    product_inventory_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    amount_type character varying(10) NOT NULL,
    amount_value numeric(10,2),
    amount_min numeric(10,2),
    amount_max numeric(10,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: service_variations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_variations (
    id integer NOT NULL,
    service_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    duration_minutes integer NOT NULL,
    price numeric(10,2) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: service_variations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_variations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_variations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_variations_id_seq OWNED BY public.service_variations.id;


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    duration_minutes integer NOT NULL,
    price numeric(10,2) NOT NULL,
    category character varying(100),
    color_code character varying(50) DEFAULT '#3788d8'::character varying,
    shop_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    bookable_online boolean DEFAULT false NOT NULL,
    default_staff_id uuid,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: shop_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_hours (
    shop_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    CONSTRAINT shop_hours_check CHECK ((end_time > start_time)),
    CONSTRAINT shop_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: shops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shops (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    primary_color character varying(50),
    secondary_color character varying(50),
    ergotherapia boolean DEFAULT false,
    physiotherapia boolean DEFAULT false,
    logotherapia boolean DEFAULT false,
    reply_email character varying(255),
    phone character varying(50),
    address text,
    website character varying(255),
    slot_min_time character varying(10) DEFAULT '08:00'::character varying,
    slot_max_time character varying(10) DEFAULT '20:00'::character varying,
    show_weekends boolean DEFAULT true,
    reminder_hours_before integer DEFAULT 24,
    plan character varying(50) DEFAULT 'trial'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    owner_name character varying(255),
    owner_email character varying(255),
    trial_ends_at timestamp without time zone,
    notes text,
    force_logout_at timestamp without time zone,
    force_hide_cash boolean DEFAULT false NOT NULL,
    force_hide_cash_locked_by character varying(20),
    self_booking_enabled boolean DEFAULT false NOT NULL,
    walk_in_client_id uuid,
    ai_assistant_enabled boolean DEFAULT false NOT NULL
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    color_code character varying(7),
    hourly_rate numeric(10,2) DEFAULT 0.00,
    is_active boolean DEFAULT true,
    email character varying(255),
    phone character varying(50),
    specialty character varying(100),
    shop_id uuid,
    sort_order integer DEFAULT 0,
    photo_url text,
    visible_in_calendar boolean DEFAULT true NOT NULL,
    working_hours_enabled boolean DEFAULT false NOT NULL
);


--
-- Name: staff_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_services (
    staff_id uuid NOT NULL,
    service_id uuid NOT NULL
);


--
-- Name: staff_time_off; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_time_off (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    type character varying(10) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_time_off_type_check CHECK (((type)::text = ANY (ARRAY[('leave'::character varying)::text, ('break'::character varying)::text])))
);


--
-- Name: staff_working_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_working_hours (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT staff_working_hours_check CHECK ((end_time > start_time)),
    CONSTRAINT staff_working_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    appointment_id uuid,
    client_id uuid,
    amount numeric(10,2) NOT NULL,
    payment_method character varying(50),
    transaction_type character varying(20) DEFAULT 'sale'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    shop_id uuid,
    gift_card_id uuid,
    split_group_id uuid,
    reason text,
    created_by_user_id character varying(255),
    client_debt_id uuid
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    username character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    shop_id uuid,
    role character varying(50) DEFAULT 'manager'::character varying,
    staff_id uuid,
    client_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: appointment_services id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services ALTER COLUMN id SET DEFAULT nextval('public.appointment_services_id_seq'::regclass);


--
-- Name: client_files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_files ALTER COLUMN id SET DEFAULT nextval('public.client_files_id_seq'::regclass);


--
-- Name: contests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contests ALTER COLUMN id SET DEFAULT nextval('public.contests_id_seq'::regclass);


--
-- Name: demo_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_requests ALTER COLUMN id SET DEFAULT nextval('public.demo_requests_id_seq'::regclass);


--
-- Name: platform_activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_activity_log ALTER COLUMN id SET DEFAULT nextval('public.platform_activity_log_id_seq'::regclass);


--
-- Name: price_adjustments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_adjustments ALTER COLUMN id SET DEFAULT nextval('public.price_adjustments_id_seq'::regclass);


--
-- Name: service_combo_components id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_combo_components ALTER COLUMN id SET DEFAULT nextval('public.service_combo_components_id_seq'::regclass);


--
-- Name: service_variations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_variations ALTER COLUMN id SET DEFAULT nextval('public.service_variations_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: appointment_services appointment_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: broadcast_messages broadcast_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_messages
    ADD CONSTRAINT broadcast_messages_pkey PRIMARY KEY (id);


--
-- Name: channel_members channel_members_channel_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_channel_id_user_id_key UNIQUE (channel_id, user_id);


--
-- Name: channel_members channel_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_pkey PRIMARY KEY (id);


--
-- Name: chat_channels chat_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: client_debts client_debts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_debts
    ADD CONSTRAINT client_debts_pkey PRIMARY KEY (id);


--
-- Name: client_exercises client_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_exercises
    ADD CONSTRAINT client_exercises_pkey PRIMARY KEY (client_id, exercise_id);


--
-- Name: client_files client_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_files
    ADD CONSTRAINT client_files_pkey PRIMARY KEY (id);


--
-- Name: client_memberships client_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_pkey PRIMARY KEY (id);


--
-- Name: client_packages client_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_packages
    ADD CONSTRAINT client_packages_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: contest_entries contest_entries_contest_id_client_id_entry_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_entries
    ADD CONSTRAINT contest_entries_contest_id_client_id_entry_date_key UNIQUE (contest_id, client_id, entry_date);


--
-- Name: contest_entries contest_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_entries
    ADD CONSTRAINT contest_entries_pkey PRIMARY KEY (id);


--
-- Name: contests contests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_pkey PRIMARY KEY (id);


--
-- Name: demo_requests demo_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_requests
    ADD CONSTRAINT demo_requests_pkey PRIMARY KEY (id);


--
-- Name: discount_codes discount_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_codes
    ADD CONSTRAINT discount_codes_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: gift_cards gift_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: membership_tier_services membership_tier_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_tier_services
    ADD CONSTRAINT membership_tier_services_pkey PRIMARY KEY (id);


--
-- Name: membership_tier_services membership_tier_services_tier_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_tier_services
    ADD CONSTRAINT membership_tier_services_tier_id_service_id_key UNIQUE (tier_id, service_id);


--
-- Name: membership_tiers membership_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_tiers
    ADD CONSTRAINT membership_tiers_pkey PRIMARY KEY (id);


--
-- Name: membership_usage membership_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_usage
    ADD CONSTRAINT membership_usage_pkey PRIMARY KEY (id);


--
-- Name: message_read_receipts message_read_receipts_message_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_read_receipts
    ADD CONSTRAINT message_read_receipts_message_id_user_id_key UNIQUE (message_id, user_id);


--
-- Name: message_read_receipts message_read_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_read_receipts
    ADD CONSTRAINT message_read_receipts_pkey PRIMARY KEY (id);


--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id);


--
-- Name: package_types package_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_types
    ADD CONSTRAINT package_types_pkey PRIMARY KEY (id);


--
-- Name: package_usage package_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_usage
    ADD CONSTRAINT package_usage_pkey PRIMARY KEY (id);


--
-- Name: platform_activity_log platform_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_activity_log
    ADD CONSTRAINT platform_activity_log_pkey PRIMARY KEY (id);


--
-- Name: price_adjustments price_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_adjustments
    ADD CONSTRAINT price_adjustments_pkey PRIMARY KEY (id);


--
-- Name: product_inventory product_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_inventory
    ADD CONSTRAINT product_inventory_pkey PRIMARY KEY (id);


--
-- Name: product_sales product_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sales
    ADD CONSTRAINT product_sales_pkey PRIMARY KEY (id);


--
-- Name: product_stock_adjustments product_stock_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock_adjustments
    ADD CONSTRAINT product_stock_adjustments_pkey PRIMARY KEY (id);


--
-- Name: product_usage_stocktakes product_usage_stocktakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_usage_stocktakes
    ADD CONSTRAINT product_usage_stocktakes_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: service_categories service_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_pkey PRIMARY KEY (id);


--
-- Name: service_categories service_categories_shop_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_shop_id_name_key UNIQUE (shop_id, name);


--
-- Name: service_combo_components service_combo_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_combo_components
    ADD CONSTRAINT service_combo_components_pkey PRIMARY KEY (id);


--
-- Name: service_combo_components service_combo_components_service_id_component_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_combo_components
    ADD CONSTRAINT service_combo_components_service_id_component_service_id_key UNIQUE (service_id, component_service_id);


--
-- Name: service_product_recipes service_product_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_product_recipes
    ADD CONSTRAINT service_product_recipes_pkey PRIMARY KEY (id);


--
-- Name: service_product_recipes service_product_recipes_service_id_product_inventory_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_product_recipes
    ADD CONSTRAINT service_product_recipes_service_id_product_inventory_id_key UNIQUE (service_id, product_inventory_id);


--
-- Name: service_variations service_variations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_variations
    ADD CONSTRAINT service_variations_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: shop_hours shop_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_hours
    ADD CONSTRAINT shop_hours_pkey PRIMARY KEY (shop_id, day_of_week);


--
-- Name: shops shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff_services staff_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_services
    ADD CONSTRAINT staff_services_pkey PRIMARY KEY (staff_id, service_id);


--
-- Name: staff_time_off staff_time_off_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_time_off
    ADD CONSTRAINT staff_time_off_pkey PRIMARY KEY (id);


--
-- Name: staff_working_hours staff_working_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_working_hours
    ADD CONSTRAINT staff_working_hours_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: appointment_services unique_appt_service_time_staff; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT unique_appt_service_time_staff UNIQUE (appointment_id, service_id, start_time, staff_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_appointment_services_appointment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_services_appointment_id ON public.appointment_services USING btree (appointment_id);


--
-- Name: idx_appointment_services_service_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_services_service_start ON public.appointment_services USING btree (service_id, start_time);


--
-- Name: idx_appointment_services_staff_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_services_staff_start ON public.appointment_services USING btree (staff_id, start_time);


--
-- Name: idx_appointment_services_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_services_start_time ON public.appointment_services USING btree (start_time);


--
-- Name: idx_appointments_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_client_id ON public.appointments USING btree (client_id);


--
-- Name: idx_appointments_discount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_discount ON public.appointments USING btree (shop_id) WHERE (discount_amount > (0)::numeric);


--
-- Name: idx_appointments_shop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_shop_id ON public.appointments USING btree (shop_id);


--
-- Name: idx_broadcast_messages_shop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_messages_shop_id ON public.broadcast_messages USING btree (shop_id, created_at);


--
-- Name: idx_channel_members_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_members_channel ON public.channel_members USING btree (channel_id);


--
-- Name: idx_channel_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_members_user ON public.channel_members USING btree (user_id);


--
-- Name: idx_chat_messages_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_channel ON public.chat_messages USING btree (channel_id);


--
-- Name: idx_chat_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_created ON public.chat_messages USING btree (created_at DESC);


--
-- Name: idx_client_debts_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_debts_client ON public.client_debts USING btree (client_id);


--
-- Name: idx_client_files_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_files_client_id ON public.client_files USING btree (client_id);


--
-- Name: idx_client_memberships_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_memberships_client ON public.client_memberships USING btree (client_id);


--
-- Name: idx_client_memberships_shop_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_memberships_shop_status ON public.client_memberships USING btree (shop_id, status);


--
-- Name: idx_client_packages_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_packages_client ON public.client_packages USING btree (client_id);


--
-- Name: idx_client_packages_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_packages_shop ON public.client_packages USING btree (shop_id);


--
-- Name: idx_clients_qr_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_clients_qr_token ON public.clients USING btree (qr_token);


--
-- Name: idx_clients_shop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_shop_id ON public.clients USING btree (shop_id);


--
-- Name: idx_contest_entries_contest_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contest_entries_contest_client ON public.contest_entries USING btree (contest_id, client_id);


--
-- Name: idx_discount_codes_shop_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_discount_codes_shop_name ON public.discount_codes USING btree (shop_id, lower((name)::text));


--
-- Name: idx_expenses_shop_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_shop_date ON public.expenses USING btree (shop_id, expense_date);


--
-- Name: idx_gift_cards_card_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_card_number ON public.gift_cards USING btree (card_number);


--
-- Name: idx_gift_cards_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_client_id ON public.gift_cards USING btree (client_id);


--
-- Name: idx_gift_cards_shop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_shop_id ON public.gift_cards USING btree (shop_id);


--
-- Name: idx_gift_cards_sold_by_staff_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_sold_by_staff_id ON public.gift_cards USING btree (sold_by_staff_id);


--
-- Name: idx_idempotency_keys_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_keys_created_at ON public.idempotency_keys USING btree (created_at);


--
-- Name: idx_membership_tier_services_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_tier_services_tier ON public.membership_tier_services USING btree (tier_id);


--
-- Name: idx_membership_usage_membership; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_usage_membership ON public.membership_usage USING btree (client_membership_id);


--
-- Name: idx_membership_usage_used_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_usage_used_at ON public.membership_usage USING btree (used_at);


--
-- Name: idx_message_receipts_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_receipts_message ON public.message_read_receipts USING btree (message_id);


--
-- Name: idx_notification_deliveries_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_deliveries_client_id ON public.notification_deliveries USING btree (client_id, created_at DESC);


--
-- Name: idx_package_types_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_types_shop ON public.package_types USING btree (shop_id);


--
-- Name: idx_package_usage_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_usage_appointment ON public.package_usage USING btree (appointment_id);


--
-- Name: idx_package_usage_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_usage_package ON public.package_usage USING btree (client_package_id);


--
-- Name: idx_platform_activity_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_activity_log_created ON public.platform_activity_log USING btree (created_at DESC);


--
-- Name: idx_platform_activity_log_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_activity_log_shop ON public.platform_activity_log USING btree (target_shop_id);


--
-- Name: idx_price_adjustments_shop_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_adjustments_shop_created ON public.price_adjustments USING btree (shop_id, created_at);


--
-- Name: idx_product_sales_appointment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_sales_appointment_id ON public.product_sales USING btree (appointment_id);


--
-- Name: idx_product_stock_adjustments_inventory_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_stock_adjustments_inventory_id ON public.product_stock_adjustments USING btree (product_inventory_id, created_at);


--
-- Name: idx_product_usage_stocktakes_inventory_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_usage_stocktakes_inventory_id ON public.product_usage_stocktakes USING btree (product_inventory_id, recorded_at);


--
-- Name: idx_push_subscriptions_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_client_id ON public.push_subscriptions USING btree (client_id);


--
-- Name: idx_push_subscriptions_shop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_shop_id ON public.push_subscriptions USING btree (shop_id);


--
-- Name: idx_service_combo_components_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_combo_components_service_id ON public.service_combo_components USING btree (service_id);


--
-- Name: idx_service_product_recipes_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_product_recipes_service_id ON public.service_product_recipes USING btree (service_id);


--
-- Name: idx_service_product_recipes_shop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_product_recipes_shop_id ON public.service_product_recipes USING btree (shop_id);


--
-- Name: idx_service_variations_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_variations_service_id ON public.service_variations USING btree (service_id);


--
-- Name: idx_staff_time_off_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_time_off_dates ON public.staff_time_off USING btree (start_date, end_date);


--
-- Name: idx_staff_time_off_staff_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_time_off_staff_id ON public.staff_time_off USING btree (staff_id);


--
-- Name: idx_staff_working_hours_shop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_working_hours_shop_id ON public.staff_working_hours USING btree (shop_id);


--
-- Name: idx_staff_working_hours_staff_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_working_hours_staff_day ON public.staff_working_hours USING btree (staff_id, day_of_week);


--
-- Name: idx_staff_working_hours_staff_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_working_hours_staff_effective ON public.staff_working_hours USING btree (staff_id, effective_from);


--
-- Name: idx_staff_working_hours_staff_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_working_hours_staff_id ON public.staff_working_hours USING btree (staff_id);


--
-- Name: idx_transactions_appointment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_appointment_id ON public.transactions USING btree (appointment_id);


--
-- Name: idx_transactions_shop_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_shop_created ON public.transactions USING btree (shop_id, created_at);


--
-- Name: appointment_services trg_appointment_services_appointment_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_appointment_services_appointment_version AFTER INSERT OR DELETE OR UPDATE ON public.appointment_services FOR EACH ROW EXECUTE FUNCTION public.bump_parent_appointment_version();


--
-- Name: appointments trg_appointments_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_appointments_version BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.bump_appointment_version();


--
-- Name: transactions trg_transactions_appointment_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_transactions_appointment_version AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.bump_parent_appointment_version();


--
-- Name: appointment_services appointment_services_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: appointment_services appointment_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: appointment_services appointment_services_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: appointment_services appointment_services_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: appointments appointments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: appointments appointments_discount_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_discount_code_id_fkey FOREIGN KEY (discount_code_id) REFERENCES public.discount_codes(id) ON DELETE SET NULL;


--
-- Name: appointments appointments_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: broadcast_messages broadcast_messages_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_messages
    ADD CONSTRAINT broadcast_messages_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: channel_members channel_members_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: channel_members channel_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_channels chat_channels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: chat_channels chat_channels_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: client_debts client_debts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_debts
    ADD CONSTRAINT client_debts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_debts client_debts_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_debts
    ADD CONSTRAINT client_debts_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: client_exercises client_exercises_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_exercises
    ADD CONSTRAINT client_exercises_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_exercises client_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_exercises
    ADD CONSTRAINT client_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: client_files client_files_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_files
    ADD CONSTRAINT client_files_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_memberships client_memberships_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_memberships client_memberships_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: client_memberships client_memberships_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.membership_tiers(id);


--
-- Name: client_packages client_packages_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_packages
    ADD CONSTRAINT client_packages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_packages client_packages_package_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_packages
    ADD CONSTRAINT client_packages_package_type_id_fkey FOREIGN KEY (package_type_id) REFERENCES public.package_types(id) ON DELETE SET NULL;


--
-- Name: client_packages client_packages_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_packages
    ADD CONSTRAINT client_packages_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: client_packages client_packages_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_packages
    ADD CONSTRAINT client_packages_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: clients clients_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: contest_entries contest_entries_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_entries
    ADD CONSTRAINT contest_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: contest_entries contest_entries_contest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_entries
    ADD CONSTRAINT contest_entries_contest_id_fkey FOREIGN KEY (contest_id) REFERENCES public.contests(id) ON DELETE CASCADE;


--
-- Name: contest_entries contest_entries_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_entries
    ADD CONSTRAINT contest_entries_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: discount_codes discount_codes_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_codes
    ADD CONSTRAINT discount_codes_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: exercises exercises_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: gift_cards gift_cards_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: gift_cards gift_cards_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: gift_cards gift_cards_sold_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_sold_by_staff_id_fkey FOREIGN KEY (sold_by_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: idempotency_keys idempotency_keys_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: membership_tier_services membership_tier_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_tier_services
    ADD CONSTRAINT membership_tier_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: membership_tier_services membership_tier_services_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_tier_services
    ADD CONSTRAINT membership_tier_services_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.membership_tiers(id) ON DELETE CASCADE;


--
-- Name: membership_tiers membership_tiers_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_tiers
    ADD CONSTRAINT membership_tiers_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: membership_usage membership_usage_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_usage
    ADD CONSTRAINT membership_usage_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;


--
-- Name: membership_usage membership_usage_client_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_usage
    ADD CONSTRAINT membership_usage_client_membership_id_fkey FOREIGN KEY (client_membership_id) REFERENCES public.client_memberships(id) ON DELETE CASCADE;


--
-- Name: membership_usage membership_usage_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_usage
    ADD CONSTRAINT membership_usage_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: message_read_receipts message_read_receipts_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_read_receipts
    ADD CONSTRAINT message_read_receipts_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: message_read_receipts message_read_receipts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_read_receipts
    ADD CONSTRAINT message_read_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_deliveries notification_deliveries_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: notification_deliveries notification_deliveries_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: package_types package_types_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_types
    ADD CONSTRAINT package_types_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: package_types package_types_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_types
    ADD CONSTRAINT package_types_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: package_usage package_usage_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_usage
    ADD CONSTRAINT package_usage_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;


--
-- Name: package_usage package_usage_client_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_usage
    ADD CONSTRAINT package_usage_client_package_id_fkey FOREIGN KEY (client_package_id) REFERENCES public.client_packages(id) ON DELETE CASCADE;


--
-- Name: package_usage package_usage_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_usage
    ADD CONSTRAINT package_usage_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: platform_activity_log platform_activity_log_target_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_activity_log
    ADD CONSTRAINT platform_activity_log_target_shop_id_fkey FOREIGN KEY (target_shop_id) REFERENCES public.shops(id) ON DELETE SET NULL;


--
-- Name: price_adjustments price_adjustments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_adjustments
    ADD CONSTRAINT price_adjustments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: price_adjustments price_adjustments_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_adjustments
    ADD CONSTRAINT price_adjustments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: product_inventory product_inventory_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_inventory
    ADD CONSTRAINT product_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_sales product_sales_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sales
    ADD CONSTRAINT product_sales_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: product_sales product_sales_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sales
    ADD CONSTRAINT product_sales_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: product_sales product_sales_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sales
    ADD CONSTRAINT product_sales_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.product_inventory(id);


--
-- Name: product_sales product_sales_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sales
    ADD CONSTRAINT product_sales_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: product_sales product_sales_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sales
    ADD CONSTRAINT product_sales_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: product_stock_adjustments product_stock_adjustments_product_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock_adjustments
    ADD CONSTRAINT product_stock_adjustments_product_inventory_id_fkey FOREIGN KEY (product_inventory_id) REFERENCES public.product_inventory(id) ON DELETE CASCADE;


--
-- Name: product_stock_adjustments product_stock_adjustments_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock_adjustments
    ADD CONSTRAINT product_stock_adjustments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: product_usage_stocktakes product_usage_stocktakes_product_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_usage_stocktakes
    ADD CONSTRAINT product_usage_stocktakes_product_inventory_id_fkey FOREIGN KEY (product_inventory_id) REFERENCES public.product_inventory(id) ON DELETE CASCADE;


--
-- Name: product_usage_stocktakes product_usage_stocktakes_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_usage_stocktakes
    ADD CONSTRAINT product_usage_stocktakes_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: push_subscriptions push_subscriptions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: service_categories service_categories_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: service_combo_components service_combo_components_component_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_combo_components
    ADD CONSTRAINT service_combo_components_component_service_id_fkey FOREIGN KEY (component_service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: service_combo_components service_combo_components_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_combo_components
    ADD CONSTRAINT service_combo_components_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: service_product_recipes service_product_recipes_product_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_product_recipes
    ADD CONSTRAINT service_product_recipes_product_inventory_id_fkey FOREIGN KEY (product_inventory_id) REFERENCES public.product_inventory(id) ON DELETE CASCADE;


--
-- Name: service_product_recipes service_product_recipes_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_product_recipes
    ADD CONSTRAINT service_product_recipes_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: service_product_recipes service_product_recipes_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_product_recipes
    ADD CONSTRAINT service_product_recipes_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: service_variations service_variations_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_variations
    ADD CONSTRAINT service_variations_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: services services_default_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_default_staff_id_fkey FOREIGN KEY (default_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: services services_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: shop_hours shop_hours_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_hours
    ADD CONSTRAINT shop_hours_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: shops shops_walk_in_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_walk_in_client_id_fkey FOREIGN KEY (walk_in_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: staff_services staff_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_services
    ADD CONSTRAINT staff_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: staff_services staff_services_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_services
    ADD CONSTRAINT staff_services_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff staff_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: staff_time_off staff_time_off_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_time_off
    ADD CONSTRAINT staff_time_off_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: staff_time_off staff_time_off_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_time_off
    ADD CONSTRAINT staff_time_off_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_working_hours staff_working_hours_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_working_hours
    ADD CONSTRAINT staff_working_hours_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: staff_working_hours staff_working_hours_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_working_hours
    ADD CONSTRAINT staff_working_hours_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_client_debt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_client_debt_id_fkey FOREIGN KEY (client_debt_id) REFERENCES public.client_debts(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: transactions transactions_gift_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_gift_card_id_fkey FOREIGN KEY (gift_card_id) REFERENCES public.gift_cards(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id);


--
-- Name: users users_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: users users_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: users users_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

