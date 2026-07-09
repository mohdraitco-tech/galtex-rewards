-- ============================================================
-- GALTEX Rewards | نظام "نسيت كلمة المرور" للعملاء
-- ============================================================

-- جدول طلبات إعادة تعيين كلمة المرور
create table if not exists password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  new_password_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references admins(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table password_reset_requests enable row level security;
-- مقفول تماماً من العميل مباشرة — الوصول فقط عن طريق الدوال بالأسفل

-- ============================================================
-- دالة: العميل يطلب إعادة تعيين كلمة المرور
-- ============================================================
create or replace function request_password_reset(
  p_username text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id uuid;
  v_status text;
  v_existing_pending int;
begin
  select id, status into v_customer_id, v_status
  from customers
  where username = p_username
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'message', 'اسم المستخدم أو رقم الجوال غير مسجل لدينا');
  end if;

  if v_status = 'suspended' then
    return jsonb_build_object('success', false, 'message', 'هذا الحساب موقوف، يرجى التواصل مع الإدارة');
  end if;

  if v_status = 'pending' then
    return jsonb_build_object('success', false, 'message', 'الحساب لا يزال قيد المراجعة الأولية');
  end if;

  select count(*) into v_existing_pending
  from password_reset_requests
  where customer_id = v_customer_id and status = 'pending';

  if v_existing_pending > 0 then
    return jsonb_build_object('success', false, 'message', 'يوجد طلب سابق قيد المراجعة بالفعل، يرجى انتظار موافقة الإدارة');
  end if;

  if p_new_password is null or length(p_new_password) < 6 then
    return jsonb_build_object('success', false, 'message', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  end if;

  insert into password_reset_requests (customer_id, new_password_hash)
  values (v_customer_id, crypt(p_new_password, gen_salt('bf')));

  return jsonb_build_object('success', true, 'message', 'تم إرسال طلبك، سيتم مراجعته من الإدارة قريباً');
end;
$$;

-- ============================================================
-- دالة: عرض الطلبات المعلقة للإدارة
-- ============================================================
create or replace function get_pending_password_resets()
returns table (
  id uuid,
  customer_id uuid,
  first_name text,
  last_name text,
  username text,
  customer_number text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    r.id,
    r.customer_id,
    c.first_name,
    c.last_name,
    c.username,
    c.customer_number,
    r.created_at
  from password_reset_requests r
  join customers c on c.id = r.customer_id
  where r.status = 'pending'
  order by r.created_at asc;
$$;

-- ============================================================
-- دالة: موافقة الإدارة على الطلب
-- ============================================================
create or replace function approve_password_reset(
  p_request_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_request password_reset_requests%rowtype;
begin
  select * into v_request
  from password_reset_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'الطلب غير موجود أو تمت معالجته مسبقاً');
  end if;

  update customers
  set password_hash = v_request.new_password_hash
  where id = v_request.customer_id;

  update password_reset_requests
  set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object('success', true, 'message', 'تم تحديث كلمة المرور بنجاح');
end;
$$;

-- ============================================================
-- دالة: رفض الإدارة للطلب
-- ============================================================
create or replace function reject_password_reset(
  p_request_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update password_reset_requests
  set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    return jsonb_build_object('success', false, 'message', 'الطلب غير موجود أو تمت معالجته مسبقاً');
  end if;

  return jsonb_build_object('success', true, 'message', 'تم رفض الطلب');
end;
$$;

-- ============================================================
-- الصلاحيات + إعادة تحميل الـ schema
-- ============================================================
grant execute on function request_password_reset(text, text) to anon, authenticated;
grant execute on function get_pending_password_resets() to anon, authenticated;
grant execute on function approve_password_reset(uuid, uuid) to anon, authenticated;
grant execute on function reject_password_reset(uuid, uuid) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
