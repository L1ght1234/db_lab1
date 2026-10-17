CREATE OR REPLACE PROCEDURE sp_team_create(
    p_sport_id integer, p_name varchar, p_city varchar, p_founded_year integer,
    INOUT p_team_id integer DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO teams (sport_id, name, city, founded_year, created_by)
    VALUES (p_sport_id, p_name, p_city, p_founded_year, fn_current_app_user())
    RETURNING id INTO p_team_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_team_update(
    p_team_id integer, p_name varchar DEFAULT NULL, p_city varchar DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE teams
    SET name = COALESCE(p_name, name),
        city = COALESCE(p_city, city)
    WHERE id = p_team_id AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Активну команду % не знайдено', p_team_id;
    END IF;
END $$;

CREATE OR REPLACE PROCEDURE sp_team_soft_delete(p_team_id integer)
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM tournament_teams tt
               JOIN tournaments t ON t.id = tt.tournament_id
               WHERE tt.team_id = p_team_id AND NOT t.is_deleted AND t.status = 'ongoing') THEN
        RAISE EXCEPTION 'Команда % бере участь в активному турнірі', p_team_id;
    END IF;

    UPDATE teams
    SET is_deleted = true, deleted_at = now(), deleted_by = fn_current_app_user()
    WHERE id = p_team_id AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Активну команду % не знайдено', p_team_id;
    END IF;
END $$;

CREATE OR REPLACE PROCEDURE sp_team_restore(p_team_id integer)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE teams
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
    WHERE id = p_team_id AND is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Видалену команду % не знайдено', p_team_id;
    END IF;
END $$;

CREATE OR REPLACE PROCEDURE sp_tournament_create(
    p_sport_id integer, p_name varchar, p_season varchar,
    p_start_date date, p_end_date date, p_first_stage_name varchar,
    INOUT p_tournament_id integer DEFAULT NULL,
    INOUT p_stage_id integer DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO tournaments (sport_id, name, season, start_date, end_date, status, created_by)
    VALUES (p_sport_id, p_name, p_season, p_start_date, p_end_date, 'ongoing', fn_current_app_user())
    RETURNING id INTO p_tournament_id;

    INSERT INTO tournament_stages (tournament_id, name, stage_order)
    VALUES (p_tournament_id, p_first_stage_name, 1)
    RETURNING id INTO p_stage_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_tournament_register_team(
    p_tournament_id integer, p_team_id integer, p_seed_number integer DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO tournament_teams (tournament_id, team_id, seed_number)
    VALUES (p_tournament_id, p_team_id, p_seed_number);
END $$;

CREATE OR REPLACE PROCEDURE sp_match_schedule(
    p_stage_id integer, p_venue_id integer,
    p_home_team_id integer, p_away_team_id integer, p_scheduled_at timestamptz,
    INOUT p_match_id integer DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO matches (stage_id, venue_id, home_team_id, away_team_id, scheduled_at, created_by)
    VALUES (p_stage_id, p_venue_id, p_home_team_id, p_away_team_id, p_scheduled_at, fn_current_app_user())
    RETURNING id INTO p_match_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_match_record_result(
    p_match_id integer, p_home_score integer, p_away_score integer, p_notes text DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_home_team integer;
    v_away_team integer;
    v_winner    integer;
BEGIN
    SELECT home_team_id, away_team_id INTO v_home_team, v_away_team
    FROM matches WHERE id = p_match_id AND NOT is_deleted;

    IF v_home_team IS NULL THEN
        RAISE EXCEPTION 'Активний матч % не знайдено', p_match_id;
    END IF;

    IF p_home_score > p_away_score THEN
        v_winner := v_home_team;
    ELSIF p_away_score > p_home_score THEN
        v_winner := v_away_team;
    END IF;

    INSERT INTO match_results (match_id, home_score, away_score, winner_team_id, notes)
    VALUES (p_match_id, p_home_score, p_away_score, v_winner, p_notes)
    ON CONFLICT (match_id) DO UPDATE
    SET home_score     = EXCLUDED.home_score,
        away_score     = EXCLUDED.away_score,
        winner_team_id = EXCLUDED.winner_team_id,
        notes          = EXCLUDED.notes;

    UPDATE matches SET status = 'completed' WHERE id = p_match_id;
END $$;

CREATE OR REPLACE PROCEDURE sp_ticket_sell(
    p_match_id integer, p_category_id integer, p_buyer_user_id integer, p_seat_number varchar,
    INOUT p_ticket_id integer DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_price numeric(10,2);
BEGIN
    SELECT base_price INTO v_price FROM ticket_categories WHERE id = p_category_id;

    INSERT INTO tickets (match_id, category_id, buyer_user_id, seat_number, price_paid, status)
    VALUES (p_match_id, p_category_id, p_buyer_user_id, p_seat_number, v_price, 'paid')
    RETURNING id INTO p_ticket_id;
END $$;
