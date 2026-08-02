import { createClient } from "@supabase/supabase-js";

/**
 * عميل Supabase للاستخدام على الخادم فقط (Route Handlers / Server Actions).
 *
 * يستخدم Service Role Key الذي له صلاحيات كاملة ويتجاوز RLS.
 * لذلك يجب عدم استيراد هذا الملف أبداً داخل مكوّنات "use client"،
 * ولا في أي كود يصل للمتصفح.
 *
 * المتغير مطلوب في .env.local (بدون بادئة NEXT_PUBLIC_):
 *   SUPABASE_SERVICE_ROLE_KEY=xxxxxxxx
 *
 * وفي Vercel: Settings > Environment Variables
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
