-- Run ONLY in the trusted Supabase SQL Editor, after creating an Auth user.
-- Replace this email with your exact administrator email. Never run from a browser.
do $$
declare administrator uuid;
begin
 select id into administrator from auth.users where lower(email)=lower('naomityy67@gmail.com');
 if administrator is null then raise exception 'Create the administrator in Authentication > Users first'; end if;
 insert into public.profiles(id,full_name,role) values(administrator,'Event administrator','admin')
 on conflict(id) do update set role='admin';
end $$;
