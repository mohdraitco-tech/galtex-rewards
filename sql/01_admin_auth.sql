-- ============================================================
-- GALTEX Rewards | نظام تسجيل دخول الإدارة
-- ============================================================

-- تفعيل امتداد التشفير (لو مش مفعل أصلاً)
create extension if not exists pgcrypto;

-- جدول حسابات الإدارة
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  full_name text not null,
  role text not null default 'admin',        -- admin | super_admin (للتوسع لاحقاً)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- تفعيل حماية على مستوى الصفوف (RLS) — المهم إنه ما حد يقدر يقرأ الجدول مباشرة من المتصفح
alter table admins enable row level security;

-- ما فيه أي policy مسموحة = يعني الجدول مقفول تماماً من العميل (client)،
-- الوصول الوحيد يكون عن طريق دالة login_admin بصلاحية SECURITY DEFINER بالأسفل.

-- ============================================================
-- دالة تسجيل الدخول
-- ============================================================
create or replace function login_admin(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin admins%rowtype;
begin
  select * into v_admin
  from admins
  where username = p_username
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'message', 'اسم المستخدم أو كلمة المرور غير صحيحة');
  end if;

  if not v_admin.is_active then
    return jsonb_build_object('success', false, 'message', 'هذا الحساب موقوف، يرجى مراجعة الإدارة العليا');
  end if;

  if v_admin.password_hash <> crypt(p_password, v_admin.password_hash) then
    return jsonb_build_object('success', false, 'message', 'اسم المستخدم أو كلمة المرور غير صحيحة');
  end if;

  return jsonb_build_object(
    'success', true,
    'admin_id', v_admin.id,
    'username', v_admin.username,
    'full_name', v_admin.full_name,
    'role', v_admin.role
  );
end;
$$;

-- ============================================================
-- إنشاء أول حساب إداري (غيّر اسم المستخدم وكلمة المرور قبل التنفيذ!)
-- ============================================================
insert into admins (username, password_hash, full_name, role)
values (
  'admin',                                   -- 👈 غيّر اسم المستخدم
  crypt('ChangeThisPassword123', gen_salt('bf')), -- 👈 غيّر كلمة المرور
  'مدير النظام',
  'super_admin'
)
on conflict (username) do nothing;
