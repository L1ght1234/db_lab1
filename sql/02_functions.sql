
CREATE OR REPLACE FUNCTION fn_current_app_user()
RETURNS integer
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN NULLIF(current_setting('app.user_id', true), '')::integer;
END $$;

CREATE OR REPLACE FUNCTION fn_match_available_seats(p_match_id integer)
RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_capacity integer;
    v_sold     integer;
BEGIN
    SELECT v.capacity INTO v_capacity
    FROM matches m
    JOIN venues v ON v.id = m.venue_id
    WHERE m.id = p_match_id;

    SELECT count(*)::integer INTO v_sold
    FROM tickets t
    WHERE t.match_id = p_match_id
      AND NOT t.is_deleted
      AND t.status IN ('reserved', 'paid');

    RETURN v_capacity - COALESCE(v_sold, 0);
END $$;

CREATE OR REPLACE FUNCTION fn_tournament_standings(p_tournament_id integer)
RETURNS TABLE (
    "position"    integer,
    team_id       integer,
    team_name     varchar,
    played        integer,
    won           integer,
    drawn         integer,
    lost          integer,
    goals_for     integer,
    goals_against integer,
    points        integer
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH games AS (
        SELECT m.home_team_id AS t_id, r.home_score AS gf, r.away_score AS ga, r.winner_team_id
        FROM matches m
        JOIN match_results r      ON r.match_id = m.id
        JOIN tournament_stages st ON st.id = m.stage_id
        WHERE st.tournament_id = p_tournament_id AND m.status = 'completed' AND NOT m.is_deleted
        UNION ALL
        SELECT m.away_team_id, r.away_score, r.home_score, r.winner_team_id
        FROM matches m
        JOIN match_results r      ON r.match_id = m.id
        JOIN tournament_stages st ON st.id = m.stage_id
        WHERE st.tournament_id = p_tournament_id AND m.status = 'completed' AND NOT m.is_deleted
    ),
    totals AS (
        SELECT t.id AS t_id,
               t.name AS t_name,
               count(g.t_id)::integer AS played,
               count(*) FILTER (WHERE g.winner_team_id = t.id)::integer AS won,
               count(*) FILTER (WHERE g.t_id IS NOT NULL AND g.winner_team_id IS NULL)::integer AS drawn,
               count(*) FILTER (WHERE g.winner_team_id <> t.id)::integer AS lost,
               COALESCE(sum(g.gf), 0)::integer AS gf,
               COALESCE(sum(g.ga), 0)::integer AS ga
        FROM tournament_teams tt
        JOIN teams t ON t.id = tt.team_id
        LEFT JOIN games g ON g.t_id = t.id
        WHERE tt.tournament_id = p_tournament_id
        GROUP BY t.id, t.name
    )
    SELECT (row_number() OVER (ORDER BY (totals.won * 3 + totals.drawn) DESC, (totals.gf - totals.ga) DESC))::integer,
           totals.t_id,
           totals.t_name,
           totals.played,
           totals.won,
           totals.drawn,
           totals.lost,
           totals.gf,
           totals.ga,
           (totals.won * 3 + totals.drawn)::integer
    FROM totals
    ORDER BY 1;
END $$;
