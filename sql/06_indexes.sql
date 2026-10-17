CREATE UNIQUE INDEX uq_tickets_active_seat
    ON tickets (match_id, seat_number)
    WHERE NOT is_deleted AND status IN ('reserved', 'paid');

CREATE UNIQUE INDEX uq_teams_active_name
    ON teams (sport_id, lower(name))
    WHERE NOT is_deleted;

CREATE INDEX ix_matches_stage_scheduled
    ON matches (stage_id, scheduled_at)
    WHERE NOT is_deleted;

CREATE INDEX ix_audit_log_table_record
    ON audit_log (table_name, record_id);

CREATE INDEX gx_match_events_details
    ON match_events USING gin (details_jsonb);

CREATE INDEX gx_audit_log_new_data
    ON audit_log USING gin (new_data);
