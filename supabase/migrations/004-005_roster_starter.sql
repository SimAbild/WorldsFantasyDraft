-- Kun startspillere kan vælges; reserver står i roster, så deres kampe stadig kan genkendes.
-- (submit_draft og v_player_card blev opdateret til at kræve is_starter; se databasens migrationshistorik)
alter table public.roster add column is_starter boolean not null default true;
