-- Run in Supabase SQL Editor.
create table if not exists public.planner_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null,
 revision bigint not null default 1
);
alter table public.planner_state enable row level security;
revoke all on public.planner_state from anon;
grant select, insert, update on public.planner_state to authenticated;
drop policy if exists own_state on public.planner_state;
create policy own_state on public.planner_state for all to authenticated
 using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);

create or replace function public.save_planner(p_payload jsonb, p_revision bigint)
returns bigint language plpgsql security invoker set search_path = public as $$
declare new_revision bigint;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 if p_revision = 0 then
  insert into public.planner_state(user_id,payload,revision)
  values(auth.uid(),p_payload,1) on conflict do nothing returning revision into new_revision;
 else
  update public.planner_state set payload=p_payload, revision=revision+1
  where user_id=auth.uid() and revision=p_revision returning revision into new_revision;
 end if;
 if new_revision is null then raise exception 'CONFLICT'; end if;
 return new_revision;
end $$;
revoke all on function public.save_planner(jsonb,bigint) from public, anon;
grant execute on function public.save_planner(jsonb,bigint) to authenticated;
