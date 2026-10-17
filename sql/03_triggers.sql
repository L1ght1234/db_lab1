CREATE OR REPLACE FUNCTION trg_fn_set_updated()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    NEW.updated_by := fn_current_app_user();
    RETURN NEW;
END $$;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['users', 'venues', 'teams', 'tournaments', 'matches', 'tickets'] LOOP
        EXECUTE format('CREATE TRIGGER trg_%1$s_updated
                        BEFORE UPDATE ON %1$I
                        FOR EACH ROW
                        EXECUTE FUNCTION trg_fn_set_updated()', t);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION trg_fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_op  audit_operation := TG_OP::audit_operation;
    v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
BEGIN
    IF TG_OP = 'UPDATE' AND v_new ? 'is_deleted' THEN
        IF NOT (v_old->>'is_deleted')::boolean AND (v_new->>'is_deleted')::boolean THEN
            v_op := 'SOFT_DELETE';
        ELSIF (v_old->>'is_deleted')::boolean AND NOT (v_new->>'is_deleted')::boolean THEN
            v_op := 'RESTORE';
        END IF;
    END IF;

    INSERT INTO audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, (COALESCE(v_new, v_old)->>'id')::integer, v_op, v_old, v_new, fn_current_app_user());
    RETURN NULL;
END $$;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['teams', 'tournaments', 'matches', 'tickets'] LOOP
        EXECUTE format('CREATE TRIGGER trg_%1$s_audit_log
                        AFTER INSERT OR UPDATE OR DELETE ON %1$I
                        FOR EACH ROW
                        EXECUTE FUNCTION trg_fn_audit_log()', t);
    END LOOP;
END $$;


CREATE OR REPLACE FUNCTION trg_fn_ticket_check()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_venue_id integer;
BEGIN
    SELECT venue_id INTO v_venue_id FROM matches WHERE id = NEW.match_id AND NOT is_deleted;
    IF v_venue_id IS NULL THEN
        RAISE EXCEPTION 'Активний матч % не знайдено', NEW.match_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM ticket_categories WHERE id = NEW.category_id AND venue_id = v_venue_id) THEN
        RAISE EXCEPTION 'Категорія квитка % не належить арені матчу %', NEW.category_id, NEW.match_id;
    END IF;

    IF fn_match_available_seats(NEW.match_id) <= 0 THEN
        RAISE EXCEPTION 'На матч % немає вільних місць', NEW.match_id;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER trg_tickets_check
BEFORE INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION trg_fn_ticket_check();
