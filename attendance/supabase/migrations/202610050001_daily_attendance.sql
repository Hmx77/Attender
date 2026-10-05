begin;
-- Additive: keep existing records, RLS, privileges and the one-open-session index.
create or replace function public.attendance_today() returns date
language sql volatile set search_path = '' as $$
 select (clock_timestamp() at time zone public.attendance_timezone())::date;
$$;
revoke all on function public.attendance_today() from public, anon, authenticated;
grant execute on function public.attendance_today() to authenticated;

create or replace function public.request_check_in(p_location text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; current_day date;
begin
 -- Serialize employee requests and approvals on the same profile row.
 perform 1 from public.profiles where id=auth.uid() and role='employee' for update;
 if not found then raise exception 'Employee access required'; end if;
 if p_location is null or p_location not in ('office','remote') then raise exception 'Choose Office or Remote'; end if;
 current_day := public.attendance_today();
 if exists(select 1 from public.attendance where employee_id=auth.uid() and
  (out_time is null or work_date=current_day)) then
  raise exception 'You already have attendance today or an open check-in';
 end if;
 insert into public.attendance(employee_id, location) values(auth.uid(), p_location) returning id into result;
 return result;
exception when unique_violation then raise exception 'You already have a pending request or active check-in';
end; $$;

create or replace function public.approve_check_in(p_attendance_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare approved_at timestamptz; employee uuid; current_day date;
begin
 if not public.is_hr() then raise exception 'HR access required'; end if;
 select employee_id into employee from public.attendance where id=p_attendance_id and employee_id<>auth.uid() and in_time is null;
 if not found then raise exception 'Request is no longer pending'; end if;
 -- Match request_check_in lock order to avoid races and deadlocks.
 perform 1 from public.profiles where id=employee for update;
 perform 1 from public.attendance where id=p_attendance_id and in_time is null for update;
 if not found then raise exception 'Request is no longer pending'; end if;
 approved_at := clock_timestamp();
 current_day := (approved_at at time zone public.attendance_timezone())::date;
 if exists(select 1 from public.attendance where employee_id=employee and work_date=current_day and id<>p_attendance_id) then
  raise exception 'This employee already has attendance for today';
 end if;
 update public.attendance set in_time=approved_at, work_date=current_day, hr_approved_by=auth.uid(), signature_approved=true where id=p_attendance_id;
end; $$;
commit;
