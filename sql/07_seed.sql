INSERT INTO roles (name, description) VALUES
    ('admin',     'Адміністратор системи'),
    ('organizer', 'Організатор змагань'),
    ('referee',   'Суддя матчу'),
    ('player',    'Гравець команди'),
    ('fan',       'Глядач / покупець квитків');

INSERT INTO users (role_id, email, password_hash, first_name, last_name, phone) VALUES
    (1, 'admin@sports.ua',      'hash_admin', 'Олександр', 'Коваленко', '+380501112233'),
    (2, 'organizer@sports.ua',  'hash_org',   'Ірина',     'Мельник',   '+380671112244'),
    (3, 'referee@sports.ua',    'hash_ref',   'Сергій',    'Бойко',     '+380631112255'),
    (4, 'shevchenko@team.ua',   'hash_pl1',   'Андрій',    'Шевченко',  '+380951000001'),
    (4, 'stepanenko@team.ua',   'hash_pl2',   'Тарас',     'Степаненко','+380951000002'),
    (5, 'fan.petrenko@mail.ua', 'hash_fan',   'Дмитро',    'Петренко',  '+380971234501');

SELECT set_config('app.user_id', '2', false);

INSERT INTO sports (name, type, rules_url) VALUES
    ('Футбол',    'team', 'https://www.theifab.com/laws'),
    ('Баскетбол', 'team', 'https://www.fiba.basketball/documents');

INSERT INTO venues (name, city, address, capacity, created_by) VALUES
    ('НСК Олімпійський', 'Київ',  'вул. Велика Васильківська, 55', 70050, 2),
    ('Арена Львів',      'Львів', 'вул. Стрийська, 199',           34915, 2);

INSERT INTO ticket_categories (venue_id, name, base_price) VALUES
    (1, 'Standard', 300.00),
    (1, 'VIP',      1500.00),
    (2, 'Standard', 250.00);

INSERT INTO sponsors (name, contact_person, contact_email) VALUES
    ('Епіцентр К', 'Віктор Герега', 'sponsor@epicentrk.ua'),
    ('Нова Пошта', 'Олена Плющ',    'pr@novaposhta.ua');

CALL sp_team_create(1, 'Динамо Київ',     'Київ',    1927, NULL);
CALL sp_team_create(1, 'Шахтар Донецьк',  'Донецьк', 1936, NULL);
CALL sp_team_create(1, 'Карпати Львів',   'Львів',   1963, NULL);

INSERT INTO team_members (team_id, user_id, jersey_number, "position") VALUES
    (1, 4, 7, 'Нападник'),
    (2, 5, 6, 'Півзахисник');

CALL sp_tournament_create(1, 'Прем''єр-ліга України', '2026/2027', '2026-08-01', '2027-05-30', 'Груповий етап', NULL, NULL);

CALL sp_tournament_register_team(1, 1, 1);
CALL sp_tournament_register_team(1, 2, 2);
CALL sp_tournament_register_team(1, 3, 3);

INSERT INTO tournament_sponsors (tournament_id, sponsor_id, contract_amount) VALUES
    (1, 1, 500000.00);

CALL sp_match_schedule(1, 1, 1, 2, '2026-09-15 19:00:00+03', NULL); -- матч 1: Динамо - Шахтар
CALL sp_match_schedule(1, 2, 3, 1, '2026-10-25 17:00:00+03', NULL); -- матч 2: Карпати - Динамо

INSERT INTO match_officials (match_id, user_id, duty_role) VALUES
    (1, 3, 'Головний арбітр');

CALL sp_ticket_sell(1, 1, 6, 'A-10', NULL);
CALL sp_ticket_sell(1, 2, 6, 'VIP-1', NULL);

INSERT INTO match_events (match_id, player_id, event_type, minute, details_jsonb) VALUES
    (1, 4, 'goal', 23, '{"shot": "right_foot"}'),
    (1, 5, 'yellow_card', 41, '{"reason": "фол у центрі поля"}');

CALL sp_match_record_result(1, 2, 1, 'Центральний матч туру');
