begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check (length(trim(full_name)) > 0),
 role text not null default 'employee' check (role in ('employee','hr'))
);
-- Pending requests use the attendance table, with no date/time/signature yet.
create table public.attendance (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.profiles(id),
 work_date date,
 location text not null check (location in ('office','remote')),
 in_time timestamptz,
 out_time timestamptz,
 hr_approved_by uuid references public.profiles(id),
 signature_approved boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 constraint approval_consistent check (
  (in_time is null and work_date is null and hr_approved_by is null and not signature_approved and out_time is null)
  or (in_time is not null and work_date is not null and hr_approved_by is not null and signature_approved)
 ),
 constraint checkout_after_in check (out_time is null or out_time >= in_time)
);
create unique index one_open_session on public.attendance(employee_id) where out_time is null;
create index attendance_history on public.attendance(employee_id, created_at desc);
alter table public.profiles enable row level security;
alter table public.attendance enable row level security;
create function public.is_hr() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = auth.uid() and role = 'hr');
$$;
-- Change UTC here before applying if your business uses another IANA timezone.
create function public.attendance_timezone() returns text language sql immutable set search_path = '' as $$ select 'UTC'::text; $$;
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_hr()));
create policy attendance_read on public.attendance for select to authenticated using (employee_id = (select auth.uid()) or (select public.is_hr()));
-- No direct table mutations. Only the narrowly scoped RPCs below can write.
revoke all on public.profiles, public.attendance from anon, authenticated;
grant select on public.profiles, public.attendance to authenticated;
create function public.new_employee_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id, full_name, role) values(new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), split_part(new.email,'@',1), 'Employee'), 'employee');
 return new;
end; $$;
create trigger new_employee after insert on auth.users for each row execute function public.new_employee_profile();
create function public.request_check_in(p_location text) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='employee') then raise exception 'Employee access required'; end if;
 if p_location is null or p_location not in ('office','remote') then raise exception 'Choose Office or Remote'; end if;
 insert into public.attendance(employee_id, location) values(auth.uid(), p_location) returning id into result;
 return result;
exception when unique_violation then raise exception 'You already have a pending request or active check-in';
end; $$;
create function public.approve_check_in(p_attendance_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare approved_at timestamptz;
begin
 if not public.is_hr() then raise exception 'HR access required'; end if;
 -- Lock before reading the clock, even when approvals race.
 perform 1 from public.attendance where id=p_attendance_id and employee_id <> auth.uid() and in_time is null for update;
 if not found then raise exception 'Request is no longer pending'; end if;
 approved_at := clock_timestamp();
 update public.attendance set in_time=approved_at, work_date=(approved_at at time zone public.attendance_timezone())::date, hr_approved_by=auth.uid(), signature_approved=true where id=p_attendance_id;
end; $$;
create function public.check_out(p_attendance_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='employee') then raise exception 'Employee access required'; end if;
 perform 1 from public.attendance where id=p_attendance_id and employee_id=auth.uid() and in_time is not null and out_time is null for update;
 if not found then raise exception 'No active check-in found'; end if;
 update public.attendance set out_time=clock_timestamp() where id=p_attendance_id;
end; $$;
revoke all on function public.is_hr(), public.attendance_timezone(), public.new_employee_profile(), public.request_check_in(text), public.approve_check_in(uuid), public.check_out(uuid) from public, anon, authenticated;
grant execute on function public.is_hr(), public.attendance_timezone(), public.request_check_in(text), public.approve_check_in(uuid), public.check_out(uuid) to authenticated;
alter publication supabase_realtime add table public.attendance;
commit;
