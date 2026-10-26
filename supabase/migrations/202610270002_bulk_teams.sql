-- Additive upgrade. Run once after 202610260001_voting.sql.
begin;

create function public.create_teams_bulk(p_session uuid,p_teams jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.voting_sessions; item jsonb; duplicate_name text; inserted integer;
begin
 perform public.assert_admin();
 -- Serialize with save_team/session_action: no additions once voting starts,
 -- and no partially-created batch when a conflict or bad input is detected.
 select * into s from public.voting_sessions where id=p_session for update;
 if not found or s.started_at is not null or s.status<>'DRAFT' or s.archived_at is not null then
  raise exception 'Teams are locked after voting starts';
 end if;
 if jsonb_typeof(p_teams) is distinct from 'array' then raise exception 'Expected an array of teams'; end if;
 if jsonb_array_length(p_teams) not between 1 and 100 then raise exception 'Create between 1 and 100 teams at a time'; end if;
 for item in select value from jsonb_array_elements(p_teams) loop
  if jsonb_typeof(item->'name') is distinct from 'string'
   or length(trim(item->>'name')) not between 1 and 80 then
   raise exception 'Each team name must contain 1 to 80 characters';
  end if;
  if jsonb_typeof(item->'color') is distinct from 'string'
   or (item->>'color') !~ '^#[0-9a-fA-F]{6}$' then
   raise exception 'Each team must have a valid hex color';
  end if;
 end loop;
 select min(trim(value->>'name')) into duplicate_name
  from jsonb_array_elements(p_teams)
  group by lower(trim(value->>'name')) having count(*)>1 limit 1;
 if duplicate_name is not null then raise exception 'Duplicate team in pasted list: %',duplicate_name; end if;
 select t.name into duplicate_name from public.teams t
  where t.session_id=p_session and exists(
   select 1 from jsonb_array_elements(p_teams) x where lower(trim(x->>'name'))=lower(trim(t.name))
  ) limit 1;
 if duplicate_name is not null then
  raise exception 'Team already exists: %. Refresh the team list and try again.',duplicate_name;
 end if;

 insert into public.teams(session_id,name,color)
  select p_session,trim(value->>'name'),value->>'color' from jsonb_array_elements(p_teams);
 get diagnostics inserted = row_count;
 update public.voting_sessions set updated_at=clock_timestamp() where id=p_session;
 return inserted;
end; $$;

revoke execute on function public.create_teams_bulk(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_teams_bulk(uuid,jsonb) to authenticated;
commit;
