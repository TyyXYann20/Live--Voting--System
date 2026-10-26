-- Additive upgrade: run AFTER 202610260001_voting.sql. Existing data is preserved.
begin;

-- A revoked ballot is removed from votes but retained in this private audit log.
-- participant_id has no FK, so deleting an unused registration retains its audit entry.
create table public.participant_events (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.voting_sessions(id),
 participant_id uuid not null,
 actor_id uuid not null references auth.users(id),
 action text not null check (action in ('revoke','delete')),
 previous_vote jsonb,
 created_at timestamptz not null default now(),
 check ((action='revoke') = (previous_vote is not null))
);
create index participant_events_session_idx on public.participant_events(session_id,created_at);
alter table public.participant_events enable row level security;
create policy participant_events_admin on public.participant_events
 for select to authenticated using (public.is_admin());
revoke all on public.participant_events from public,anon,authenticated;
grant select on public.participant_events to authenticated;

create function public.manage_participant(p_session uuid,p_participant uuid,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.voting_sessions; p public.participants; ballot public.votes;
begin
 perform public.assert_admin();
 -- Consistent lock order: session first, participant second. Wait for accepted votes.
 select * into s from public.voting_sessions where id=p_session for update;
 if not found or s.status='STOPPED' or s.archived_at is not null then
  raise exception 'Participant records are locked for completed sessions';
 end if;
 select * into p from public.participants
  where id=p_participant and session_id=p_session for update;
 if not found then raise exception 'Participant not found in this session'; end if;
 select * into ballot from public.votes where participant_id=p.id for update;

 if p_action='delete' then
  if ballot.id is not null then
   raise exception 'Revoke the submitted vote before deleting this registration';
  end if;
  delete from public.participants where id=p.id;
 elsif p_action='revoke' then
  if ballot.id is null then raise exception 'This participant has no vote to revoke'; end if;
  delete from public.votes where id=ballot.id;
  -- Auth identity, registered team and code remain bound to the participant.
  -- Refresh counts without publishing private ballot data.
  insert into public.result_signals(session_id) values(p_session)
   on conflict(session_id) do update set nonce=gen_random_uuid();
 else raise exception 'Invalid participant action'; end if;

 insert into public.participant_events(session_id,participant_id,actor_id,action,previous_vote)
 values(p_session,p.id,auth.uid(),p_action,
  case when p_action='revoke' then to_jsonb(ballot) else null end);
end; $$;
revoke execute on function public.manage_participant(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.manage_participant(uuid,uuid,text) to authenticated;

create or replace function public.submit_vote(p_session uuid,p_name text,p_own_team uuid,p_voted_team uuid,p_code text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.voting_sessions; p public.participants; token uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into s from public.voting_sessions where id=p_session for share;
 if not found or s.status<>'LIVE' or s.archived_at is not null
  or (s.start_time is not null and now()<s.start_time)
  or (s.end_time is not null and now()>=s.end_time) then raise exception 'Voting is not open'; end if;
 if s.require_codes then
  select * into p from public.participants where session_id=p_session
   and voting_code_hash=encode(sha256(convert_to(coalesce(p_code,''),'UTF8')),'hex') for update;
  if not found then raise exception 'Invalid participant code'; end if;
  if p.auth_user_id is not null and p.auth_user_id<>auth.uid() then raise exception 'Participant code already used'; end if;
  if p.team_id<>p_own_team then raise exception 'Registered team does not match'; end if;
  update public.participants set auth_user_id=auth.uid() where id=p.id;
 else
  -- An administrator may revoke a ballot. Reuse that person's registration to
  -- permit another vote without changing their registered team or identity.
  select * into p from public.participants
   where session_id=p_session and auth_user_id=auth.uid() for update;
  if found then
   if exists(select 1 from public.votes where participant_id=p.id) then
    raise exception 'A vote has already been submitted for this participant';
   end if;
   if p.team_id<>p_own_team then raise exception 'Registered team does not match'; end if;
  else
   insert into public.participants(session_id,full_name,team_id,auth_user_id)
    values(p_session,trim(p_name),p_own_team,auth.uid()) returning * into p;
  end if;
 end if;
 if p.team_id=p_voted_team then raise exception 'You cannot vote for your own team'; end if;
 if not exists(select 1 from public.teams where id=p_voted_team and session_id=p_session and is_active) then raise exception 'Invalid voting team'; end if;
 insert into public.votes(session_id,participant_id,voted_team_id)
  values(p_session,p.id,p_voted_team) returning voting_token into token;
 perform pg_notify('pulse_vote',p_session::text);
 return token;
exception when unique_violation then raise exception 'A vote has already been submitted for this participant';
end; $$;
revoke execute on function public.submit_vote(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_vote(uuid,text,uuid,uuid,text) to authenticated;
commit;
