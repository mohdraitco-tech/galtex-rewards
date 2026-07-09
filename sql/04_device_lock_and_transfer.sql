-- ============================================================
-- GALTEX Rewards | إصلاح نظام نقل الجهاز
-- (متوافق مع جدول device_transfer_requests الموجود مسبقاً)
-- ============================================================

-- ============================================================
-- دالة: العميل يطلب نقل الجهاز
-- ============================================================
create or replace function request_device_transfer(
  p_customer_id uuid,
  p_new_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing_pending int;
  v_old_device_id uuid;
  v_request_no text;
begin
  select device_id into v_old_device_id
  from customers
  where id = p_customer_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'العميل غير موجود');
  end if;

  select count(*) into v_existing_pending
  from device_transfer_requests
  where customer_id = p_customer_id and status = 'pending';

  if v_existing_pending > 0 then
    return jsonb_build_object('success', false, 'message', 'يوجد طلب نقل جهاز سابق قيد المراجعة بالفعل');
  end if;

  v_request_no := 'DTR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || floor(random() * 900 + 100)::text;

  insert into device_transfer_requests (
    request_no, customer_id, old_device_id, new_device_fingerprint
  ) values (
    v_request_no, p_customer_id, v_old_device_id, p_new_device_id
  );

  return jsonb_build_object('success', true, 'message', 'تم إرسال طلب نقل الجهاز، سيتم مراجعته من الإدارة');
end;
$$;

-- ============================================================
-- دالة: عرض طلبات نقل الجهاز المعلقة للإدارة
-- ============================================================
create or replace function get_pending_device_transfers()
returns table (
  id uuid,
  customer_id uuid,
  first_name text,
  last_name text,
  username text,
  customer_number text,
  new_device_id text,
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
    r.new_device_fingerprint as new_device_id,
    r.requested_at as created_at
  from device_transfer_requests r
  join customers c on c.id = r.customer_id
  where r.status = 'pending'
  order by r.requested_at asc;
$$;

-- ============================================================
-- دالة: موافقة الإدارة على نقل الجهاز
-- ============================================================
create or replace function approve_device_transfer(
  p_request_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_request device_transfer_requests%rowtype;
begin
  select * into v_request
  from device_transfer_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'الطلب غير موجود أو تمت معالجته مسبقاً');
  end if;

  update customers
  set device_id = v_request.new_device_fingerprint
  where id = v_request.customer_id;

  update device_transfer_requests
  set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object('success', true, 'message', 'تم نقل الجهاز بنجاح');
end;
$$;

-- ============================================================
-- دالة: رفض الإدارة لطلب نقل الجهاز
-- ============================================================
create or replace function reject_device_transfer(
  p_request_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update device_transfer_requests
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
grant execute on function request_device_transfer(uuid, text) to anon, authenticated;
grant execute on function get_pending_device_transfers() to anon, authenticated;
grant execute on function approve_device_transfer(uuid, uuid) to anon, authenticated;
grant execute on function reject_device_transfer(uuid, uuid) to anon, authenticated;

NOTIFY pgrst, 'reload schema';