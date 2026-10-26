-- All authoritative writes happen in locked, security-definer RPCs.
create table public.profiles (
 id uuid primary key references auth.users(id), full_name text not null,
 role text not null default 'participant' check(role in ('admin','participant')), created_at timestamptz not null default now()
);
create table public.voting_sessions (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 description text not null default '' check(length(description)<=2000),
 status text not null default 'DRAFT' check(status in ('DRAFT','LIVE','PAUSED','STOPPED')),
 start_time timestamptz, end_time timestamptz, started_at timestamptz, archived_at timestamptz,
 results_visible boolean not null default false, require_codes boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_time is null or start_time is null or end_time > start_time)
);
create table public.teams (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.voting_sessions(id),
 name text not null check(length(trim(name)) between 1 and 80), color text not null default '#c3f56b' check(color ~ '^#[0-9a-fA-F]{6}$'),
 is_active boolean not null default true, created_at timestamptz not null default now(), unique(session_id,name), unique(session_id,id)
);
create table public.participants (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.voting_sessions(id),
 full_name text not null check(length(trim(full_name)) between 2 and 120), team_id uuid not null,
 auth_user_id uuid references auth.users(id), voting_code_hash text unique,
 created_at timestamptz not null default now(), unique(session_id,id), unique(session_id,auth_user_id),
 foreign key(session_id,team_id) references public.teams(session_id,id)
);
create table public.votes (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.voting_sessions(id),
 participant_id uuid not null unique, voted_team_id uuid not null,
 voting_token uuid not null unique default gen_random_uuid(), created_at timestamptz not null default now(),
 foreign key(session_id,participant_id) references public.participants(session_id,id),
 foreign key(session_id,voted_team_id) references public.teams(session_id,id)
);
create table public.final_results (
 session_id uuid not null references public.voting_sessions(id), team_id uuid not null references public.teams(id),
 votes bigint not null check(votes>=0), captured_at timestamptz not null default now(), primary key(session_id,team_id)
);
create index teams_session_idx on public.teams(session_id);
create index participants_session_idx on public.participants(session_id);
create index participants_auth_idx on public.participants(auth_user_id);
create index votes_session_team_idx on public.votes(session_id,voted_team_id);
create index sessions_status_idx on public.voting_sessions(status) where archived_at is null;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create function public.assert_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin if not public.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if; end;
$$;

alter table public.profiles enable row level security;
alter table public.voting_sessions enable row level security;
alter table public.teams enable row level security;
alter table public.participants enable row level security;
alter table public.votes enable row level security;
alter table public.final_results enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
-- Sessions contain public event metadata only. No counts, names, codes, or ballots.
create policy sessions_read on public.voting_sessions for select to anon,authenticated using(archived_at is null or public.is_admin());
create policy teams_read on public.teams for select to anon,authenticated using(exists(select 1 from public.voting_sessions s where s.id=session_id and (s.archived_at is null or public.is_admin())));
create policy participants_admin on public.participants for select to authenticated using(public.is_admin());
create policy votes_admin on public.votes for select to authenticated using(public.is_admin());
create policy final_admin on public.final_results for select to authenticated using(public.is_admin());
grant usage on schema public to anon,authenticated;
revoke all on public.profiles,public.voting_sessions,public.teams,public.participants,public.votes,public.final_results from anon,authenticated;
grant select on public.voting_sessions,public.teams to anon,authenticated;
grant select on public.profiles,public.participants,public.votes,public.final_results to authenticated;

create function public.save_session(p_id uuid, p_name text, p_description text, p_start timestamptz, p_end timestamptz, p_require_codes boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; s public.voting_sessions;
begin
 perform public.assert_admin();
 if p_id is null then
  insert into public.voting_sessions(name,description,start_time,end_time,require_codes) values(trim(p_name),p_description,p_start,p_end,p_require_codes) returning id into result;
 else
  select * into s from public.voting_sessions where id=p_id for update;
  if not found or s.status<>'DRAFT' or s.started_at is not null then raise exception 'Only draft sessions can be edited'; end if;
  update public.voting_sessions set name=trim(p_name),description=p_description,start_time=p_start,end_time=p_end,require_codes=p_require_codes,updated_at=clock_timestamp() where id=p_id returning id into result;
 end if;
 return result;
end; $$;

create function public.save_team(p_id uuid,p_session uuid,p_name text,p_color text,p_delete boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.voting_sessions; result uuid;
begin
 perform public.assert_admin();
 select * into s from public.voting_sessions where id=p_session for update;
 if not found or s.started_at is not null or s.status<>'DRAFT' or s.archived_at is not null then raise exception 'Teams are locked after voting starts'; end if;
 if p_delete then delete from public.teams where id=p_id and session_id=p_session returning id into result;
 elsif p_id is null then insert into public.teams(session_id,name,color) values(p_session,trim(p_name),p_color) returning id into result;
 else update public.teams set name=trim(p_name),color=p_color where id=p_id and session_id=p_session returning id into result;
 end if;
 if result is null then raise exception 'Team not found'; end if;
 update public.voting_sessions set updated_at=clock_timestamp() where id=p_session;
 return result;
end; $$;

create function public.session_action(p_session uuid,p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.voting_sessions;
begin
 perform public.assert_admin();
 select * into s from public.voting_sessions where id=p_session for update;
 if not found or s.archived_at is not null then raise exception 'Session unavailable'; end if;
 if p_action='start' and s.status='DRAFT' then
  if (select count(*) from public.teams where session_id=p_session and is_active)<2 then raise exception 'Add at least two teams'; end if;
  if s.end_time is not null and s.end_time<=now() then raise exception 'Scheduled end has passed'; end if;
  update public.voting_sessions set status='LIVE',started_at=now(),results_visible=false where id=p_session;
 elsif p_action='pause' and s.status='LIVE' then update public.voting_sessions set status='PAUSED' where id=p_session;
 elsif p_action='resume' and s.status='PAUSED' then
  if s.end_time is not null and s.end_time<=now() then raise exception 'Scheduled end has passed'; end if;
  update public.voting_sessions set status='LIVE' where id=p_session;
 elsif p_action='stop' and s.status in ('LIVE','PAUSED') then
  insert into public.final_results(session_id,team_id,votes) select p_session,t.id,count(v.id) from public.teams t left join public.votes v on v.voted_team_id=t.id where t.session_id=p_session group by t.id;
  update public.voting_sessions set status='STOPPED',results_visible=false where id=p_session;
 elsif p_action in ('show','hide') and s.status<>'DRAFT' then update public.voting_sessions set results_visible=(p_action='show') where id=p_session;
 elsif p_action='archive' and s.status='STOPPED' then update public.voting_sessions set archived_at=now(),results_visible=false where id=p_session;
 else raise exception 'Invalid session transition'; end if;
 update public.voting_sessions set updated_at=clock_timestamp() where id=p_session;
end; $$;

create function public.issue_participant(p_session uuid,p_name text,p_team uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare code text; pid uuid; s public.voting_sessions;
begin
 perform public.assert_admin();
 select * into s from public.voting_sessions where id=p_session for update;
 if not found or s.status='STOPPED' or s.archived_at is not null or not s.require_codes then raise exception 'Code registration unavailable'; end if;
 -- 244 random bits; only the SHA-256 digest is stored. Plaintext is returned once.
 code := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 insert into public.participants(session_id,full_name,team_id,voting_code_hash)
 values(p_session,trim(p_name),p_team,encode(sha256(convert_to(code,'UTF8')),'hex')) returning id into pid;
 return jsonb_build_object('id',pid,'code',code);
end; $$;

create function public.resolve_participant(p_session uuid,p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.participants;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into p from public.participants where session_id=p_session and voting_code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex');
 if not found then raise exception 'Invalid participant code'; end if;
 return jsonb_build_object('full_name',p.full_name,'team_id',p.team_id,'has_voted',exists(select 1 from public.votes where participant_id=p.id));
end; $$;

create function public.submit_vote(p_session uuid,p_name text,p_own_team uuid,p_voted_team uuid,p_code text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.voting_sessions; p public.participants; token uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 -- A shared lock permits concurrent voters and conflicts with stop/pause's exclusive lock.
 select * into s from public.voting_sessions where id=p_session for share;
 if not found or s.status<>'LIVE' or s.archived_at is not null or (s.start_time is not null and now()<s.start_time) or (s.end_time is not null and now()>=s.end_time) then raise exception 'Voting is not open'; end if;
 if s.require_codes then
  select * into p from public.participants where session_id=p_session and voting_code_hash=encode(sha256(convert_to(coalesce(p_code,''),'UTF8')),'hex') for update;
  if not found then raise exception 'Invalid participant code'; end if;
  if p.auth_user_id is not null and p.auth_user_id<>auth.uid() then raise exception 'Participant code already used'; end if;
  if p.team_id<>p_own_team then raise exception 'Registered team does not match'; end if;
  update public.participants set auth_user_id=auth.uid() where id=p.id;
 else
  insert into public.participants(session_id,full_name,team_id,auth_user_id) values(p_session,trim(p_name),p_own_team,auth.uid()) returning * into p;
 end if;
 if p.team_id=p_voted_team then raise exception 'You cannot vote for your own team'; end if;
 if not exists(select 1 from public.teams where id=p_voted_team and session_id=p_session and is_active) then raise exception 'Invalid voting team'; end if;
 insert into public.votes(session_id,participant_id,voted_team_id) values(p_session,p.id,p_voted_team) returning voting_token into token;
 -- No private ballot publication. A separate safe invalidation signal powers result refresh.
 perform pg_notify('pulse_vote',p_session::text);
 return token;
exception when unique_violation then raise exception 'A vote has already been submitted for this participant';
end; $$;

create function public.get_results(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.voting_sessions; rows jsonb;
begin
 select * into s from public.voting_sessions where id=p_session;
 if not found then raise exception 'Session not found'; end if;
 if not public.is_admin() and (not s.results_visible or s.archived_at is not null) then return jsonb_build_object('hidden',true,'teams','[]'::jsonb); end if;
 if s.status='STOPPED' then
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'votes',f.votes)),'[]'::jsonb) into rows from public.final_results f join public.teams t on t.id=f.team_id where f.session_id=p_session;
 else
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into rows from (select t.id,t.name,t.color,count(v.id) as votes from public.teams t left join public.votes v on v.voted_team_id=t.id where t.session_id=p_session group by t.id) r;
 end if;
 return jsonb_build_object('hidden',false,'teams',rows);
end; $$;

-- Realtime sends only an opaque session ID and random nonce, never counts or ballots.
create table public.result_signals (session_id uuid primary key references public.voting_sessions(id), nonce uuid not null default gen_random_uuid());
alter table public.result_signals enable row level security;
create policy signal_read on public.result_signals for select to anon,authenticated using(public.is_admin() or exists(select 1 from public.voting_sessions s where s.id=session_id and s.results_visible and s.archived_at is null));
grant select on public.result_signals to anon,authenticated;
create function public.signal_vote() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.result_signals(session_id) values(new.session_id) on conflict(session_id) do update set nonce=gen_random_uuid();
 return new;
end; $$;
create trigger vote_signal after insert on public.votes for each row execute function public.signal_vote();

-- Supabase's default function grants are too broad: explicitly list the API surface.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_admin() to authenticated,anon;
grant execute on function public.get_results(uuid) to authenticated,anon;
grant execute on function public.save_session(uuid,text,text,timestamptz,timestamptz,boolean),public.save_team(uuid,uuid,text,text,boolean),public.session_action(uuid,text),public.issue_participant(uuid,text,uuid),public.resolve_participant(uuid,text),public.submit_vote(uuid,text,uuid,uuid,text) to authenticated;

-- Never publish participants or votes: RLS alone is not a public result API.
alter publication supabase_realtime add table public.voting_sessions,public.teams,public.result_signals;
