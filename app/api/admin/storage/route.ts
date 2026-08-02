import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/* ============================================================
   حذف صور التخزين — من الخادم فقط

   لماذا على الخادم: الحذف يحتاج صلاحية لا نملكها في المتصفح.
   منحها لمفتاح anon يعني أن أي زائر يستطيع حذف كل صور المنتجات.
   هنا يعمل الحذف بمفتاح service_role الذي لا يغادر الخادم أبداً.

   الحماية: كل طلب يحتاج توكن جلسة إدارة صالحاً — يُفحص في قاعدة
   البيانات لا في المتصفح.

   العمليات:
     POST { action: "delete", token, names: [...] }  حذف ملفات محددة
     POST { action: "cleanup", token }               حذف كل المهجورة
   ============================================================ */

const BUCKET = "product-images";

// حد Storage API للحذف في الطلب الواحد
const CHUNK = 100;

// التحقق من جلسة الإدارة قبل أي عملية
async function verifySession(token: string) {
  if (!token || typeof token !== "string") {
    return { ok: false as const, message: "يرجى تسجيل الدخول" };
  }

  const { data, error } = await supabaseAdmin.rpc("check_admin_session", { p_token: token });

  if (error || !data?.valid) {
    return { ok: false as const, message: "جلسة غير صالحة — يرجى تسجيل الدخول" };
  }

  return { ok: true as const, session: data };
}

async function removeInChunks(names: string[]) {
  let deleted = 0;
  const failed: string[] = [];

  for (let start = 0; start < names.length; start += CHUNK) {
    const chunk = names.slice(start, start + CHUNK);
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(chunk);

    if (error) {
      failed.push(...chunk);
    } else {
      deleted += chunk.length;
    }
  }

  return { deleted, failed };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, token, names } = body as {
      action?: string;
      token?: string;
      names?: string[];
    };

    const auth = await verifySession(String(token || ""));

    if (!auth.ok) {
      return NextResponse.json({ success: false, message: auth.message }, { status: 401 });
    }

    // ===== حذف ملفات محددة (الصورة القديمة عند الاستبدال) =====
    if (action === "delete") {
      const list = (Array.isArray(names) ? names : [])
        .map((n) => String(n || "").trim())
        .filter(Boolean)
        // حماية: لا نقبل مسارات تخرج من المجلد
        .filter((n) => !n.includes("..") && !n.startsWith("/"));

      if (list.length === 0) {
        return NextResponse.json({ success: true, deleted: 0 });
      }

      const { deleted, failed } = await removeInChunks(list);

      return NextResponse.json({ success: true, deleted, failed: failed.length });
    }

    // ===== تنظيف كل الصور المهجورة =====
    if (action === "cleanup") {
      let deleted = 0;
      let failed = 0;
      let rounds = 0;

      /* الدالة ترجع دفعة محدودة تفادياً لمهلة الاستعلام،
         فنكرّر حتى تعود فارغة. حد الجولات وقاية من حلقة لا تنتهي. */
      while (rounds < 60) {
        rounds += 1;

        const { data, error } = await supabaseAdmin.rpc("get_orphan_image_names", { p_limit: 2000 });

        if (error) {
          return NextResponse.json(
            { success: false, message: `تعذر جلب قائمة الصور: ${error.message}`, deleted },
            { status: 500 }
          );
        }

        const list = (data || []) as string[];
        if (list.length === 0) break;

        const result = await removeInChunks(list);
        deleted += result.deleted;
        failed += result.failed.length;

        // لم يُحذف شيء في هذه الجولة => لا فائدة من التكرار
        if (result.deleted === 0) break;
      }

      return NextResponse.json({ success: true, deleted, failed });
    }

    return NextResponse.json({ success: false, message: "عملية غير معروفة" }, { status: 400 });
  } catch (error) {
    console.error("STORAGE API ERROR:", error);
    return NextResponse.json({ success: false, message: "خطأ في الخادم" }, { status: 500 });
  }
}
