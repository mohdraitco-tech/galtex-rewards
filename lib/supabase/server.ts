import { createClient } from "@supabase/supabase-js";

/**
 * عميل Supabase للاستخدام على السيرفر فقط (Route Handlers / Server Actions).
 *
 * يستخدم Service Role Key الذي له صلاحيات كاملة على قاعدة البيانات (يتخطى RLS).
 * لذلك يجب عدم استخدام هذا الملف أبداً داخل مكونات "use client"، ولا استيراده
 * في أي كود يصل للمتصفح.
 *
 * لازم تضيف هذا المتغير في .env.local (بدون بادئة NEXT_PUBLIC_):
 * SUPABASE_SERVICE_ROLE_KEY=xxxxxxxxxxxxxxxx
 *
 * تجده في: Supabase Dashboard > Project Settings > API > service_role key
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
