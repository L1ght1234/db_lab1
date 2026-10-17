CREATE OR REPLACE VIEW v_teams AS
SELECT t.id, t.name, t.city, t.founded_year,
       t.sport_id, s.name AS sport_name,
       t.created_at, t.updated_at, t.updated_by
FROM teams t
JOIN sports s ON s.id = t.sport_id
WHERE NOT t.is_deleted;

CREATE OR REPLACE VIEW v_tournaments AS
SELECT t.id, t.name, t.season, t.start_date, t.end_date, t.status,
       t.sport_id, s.name AS sport_name,
       (SELECT count(*) FROM tournament_teams tt WHERE tt.tournament_id = t.id)::integer AS teams_count,
       t.created_at, t.updated_at, t.updated_by
FROM tournaments t
JOIN sports s ON s.id = t.sport_id
WHERE NOT t.is_deleted;

CREATE OR REPLACE VIEW v_match_schedule AS
SELECT m.id, m.scheduled_at, m.status,
       t.id AS tournament_id, t.name AS tournament_name,
       st.id AS stage_id, st.name AS stage_name,
       v.id AS venue_id, v.name AS venue_name,
       m.home_team_id, ht.name AS home_team_name,
       m.away_team_id, aw.name AS away_team_name,
       r.home_score, r.away_score, r.winner_team_id,
       fn_match_available_seats(m.id) AS available_seats,
       m.updated_at, m.updated_by
FROM matches m
JOIN tournament_stages st ON st.id = m.stage_id
JOIN tournaments t        ON t.id = st.tournament_id AND NOT t.is_deleted
JOIN venues v             ON v.id = m.venue_id
JOIN teams ht             ON ht.id = m.home_team_id
JOIN teams aw             ON aw.id = m.away_team_id
LEFT JOIN match_results r ON r.match_id = m.id
WHERE NOT m.is_deleted;

CREATE OR REPLACE VIEW v_tickets AS
SELECT tk.id, tk.match_id,
       ht.name || ' - ' || aw.name AS match_title,
       tk.category_id, tc.name AS category_name,
       tk.seat_number, tk.price_paid, tk.status, tk.purchased_at,
       tk.buyer_user_id, u.first_name || ' ' || u.last_name AS buyer_name,
       tk.updated_at, tk.updated_by
FROM tickets tk
JOIN matches m            ON m.id = tk.match_id
JOIN teams ht             ON ht.id = m.home_team_id
JOIN teams aw             ON aw.id = m.away_team_id
JOIN ticket_categories tc ON tc.id = tk.category_id
JOIN users u              ON u.id = tk.buyer_user_id
WHERE NOT tk.is_deleted;

CREATE OR REPLACE VIEW v_tournament_standings AS
SELECT t.id AS tournament_id, t.name AS tournament_name, s.*
FROM tournaments t
CROSS JOIN LATERAL fn_tournament_standings(t.id) s
WHERE NOT t.is_deleted;
