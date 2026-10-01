create table public.player (
  id_player uuid primary key default gen_random_uuid(),
  money integer not null default 0 check (money >= 0),
  user_name varchar(255) not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vessel (
  id_vessel uuid primary key default gen_random_uuid()
);

create table public.port (
  id_port uuid primary key default gen_random_uuid()
);

create table public.player_vessel (
  player_id uuid not null references public.player(id_player) on delete cascade,
  vessel_id uuid not null references public.vessel(id_vessel) on delete cascade,
  primary key (player_id, vessel_id)
);

create table public.player_port (
  player_id uuid not null references public.player(id_player) on delete cascade,
  port_id uuid not null references public.port(id_port) on delete cascade,
  primary key (player_id, port_id)
);
