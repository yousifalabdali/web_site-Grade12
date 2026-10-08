-- مخطط قاعدة بيانات منصة "تفوّق ١٢" على Supabase
-- شغّل هذا الملف مرة واحدة من: Supabase Dashboard → SQL Editor → New query → Run

-- المواد: كل مادة مستند JSON كامل (الوحدات ← الدروس ← الأسئلة)
create table if not exists public.subjects (
  id         text primary key,
  position   integer not null default 0,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- إحصائيات المحاولات لكل مرحلة (مجمّعة وبدون بيانات شخصية)
create table if not exists public.attempts (
  key         text primary key,          -- "subjectId/lessonId"
  count       integer not null default 0,
  sum_percent double precision not null default 0,
  passed      integer not null default 0
);

-- تفعيل RLS بدون أي سياسات: لا يمكن الوصول للجداول إلا من الخادم بمفتاح service_role
alter table public.subjects enable row level security;
alter table public.attempts enable row level security;

-- تسجيل محاولة بشكل ذرّي (بدون تعارض عند تزامن عدة طلاب)
create or replace function public.record_attempt(p_key text, p_percent double precision, p_pass_percent double precision default 60)
returns void
language sql
set search_path = public
as $$
  insert into public.attempts as a (key, count, sum_percent, passed)
  values (p_key, 1, p_percent, case when p_percent >= p_pass_percent then 1 else 0 end)
  on conflict (key) do update
    set count       = a.count + 1,
        sum_percent = a.sum_percent + excluded.sum_percent,
        passed      = a.passed + excluded.passed;
$$;

revoke all on function public.record_attempt(text, double precision, double precision) from public, anon, authenticated;
grant execute on function public.record_attempt(text, double precision, double precision) to service_role;
