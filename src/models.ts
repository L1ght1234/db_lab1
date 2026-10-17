export type TournamentStatus = 'draft' | 'registration' | 'ongoing' | 'completed' | 'cancelled';
export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed';
export type TicketStatus = 'reserved' | 'paid' | 'cancelled' | 'refunded';

export interface Team {
  id: number;
  name: string;
  city: string | null;
  founded_year: number | null;
  sport_id: number;
  sport_name: string;
  created_at: Date;
  updated_at: Date | null;
  updated_by: number | null;
}

export interface Tournament {
  id: number;
  name: string;
  season: string;
  start_date: Date;
  end_date: Date;
  status: TournamentStatus;
  sport_id: number;
  sport_name: string;
  teams_count: number;
  created_at: Date;
  updated_at: Date | null;
  updated_by: number | null;
}

export interface MatchScheduleItem {
  id: number;
  scheduled_at: Date;
  status: MatchStatus;
  tournament_id: number;
  tournament_name: string;
  stage_id: number;
  stage_name: string;
  venue_id: number;
  venue_name: string;
  home_team_id: number;
  home_team_name: string;
  away_team_id: number;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: number | null;
  available_seats: number;
  updated_at: Date | null;
  updated_by: number | null;
}

export interface Ticket {
  id: number;
  match_id: number;
  match_title: string;
  category_id: number;
  category_name: string;
  seat_number: string;
  price_paid: string;
  status: TicketStatus;
  purchased_at: Date;
  buyer_user_id: number;
  buyer_name: string;
  updated_at: Date | null;
  updated_by: number | null;
}

export interface TournamentStanding {
  tournament_id: number;
  tournament_name: string;
  position: number;
  team_id: number;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
}
