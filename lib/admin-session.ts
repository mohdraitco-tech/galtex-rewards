"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/* ============================================================
   حارس جلسة الإدارة — مصدر الحقيقة الوحيد للصلاحيات

   المبدأ: التوكن وحده ما يُحفظ في المتصفح، وهو نص عشوائي لا معنى
   له. كل فحص للصلاحية يتم في قاعدة البيانات عبر check_admin_session.

   فتعديل localStorage لا يفيد المهاجم شيئاً: التوكن المزوّر يُرفض،
   والدوال الإدارية ترفض أي طلب بلا توكن صالح.
   ============================================================ */

const TOKEN_KEY = "galtex_admin_token";

export type AdminSession = {
  admin_id: string;
  username: string;
  full_name?: string | null;
  role: string | null;
  permissions: Record<string, boolean>;
  expires_at: string;
};

// ============ التوكن ============

export function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function saveAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);

  // تنظيف مفاتيح النظام القديم — لم تعد تُستخدم في الفحص
  localStorage.removeItem("galtex_admin_id");
  localStorage.removeItem("galtex_admin_username");
  localStorage.removeItem("galtex_admin_name");
  localStorage.removeItem("galtex_admin_role");
  localStorage.removeItem("galtex_admin_permissions");
}

// ============ تسجيل الخروج ============

export async function logoutAdmin() {
  const token = getAdminToken();

  if (token) {
    // نتجاهل الخطأ: المهم مسح التوكن محلياً في كل الأحوال
    await supabase.rpc("logout_admin_session", { p_token: token }).catch(() => {});
  }

  clearAdminSession();
}

// ============ حالة الحارس ============

export type GuardStatus = "checking" | "authorized" | "denied";

/* الحارس: يتحقق من الجلسة في قاعدة البيانات ويعيد التوجيه عند الفشل.

   الاستخدام في أي صفحة إدارة:
     const { status, session, token } = useAdminGuard("products");
     if (status !== "authorized") return null;

   p_permission = null للصفحات التي يكفيها تسجيل دخول صالح. */
export function useAdminGuard(permission?: string) {
  const router = useRouter();
  const [status, setStatus] = useState<GuardStatus>("checking");
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const token = getAdminToken();

      if (!token) {
        clearAdminSession();
        router.replace("/admin/login");
        return;
      }

      const { data, error } = await supabase.rpc("check_admin_session", { p_token: token });

      if (cancelled) return;

      if (error || !data?.valid) {
        clearAdminSession();
        router.replace("/admin/login");
        return;
      }

      const loaded: AdminSession = {
        admin_id: data.admin_id,
        username: data.username,
        role: data.role ?? null,
        permissions: (data.permissions || {}) as Record<string, boolean>,
        expires_at: data.expires_at,
      };

      // فحص الصلاحية: المدير العام والأدمن يمران دائماً
      const isFullAdmin = loaded.role === "super_admin" || loaded.role === "admin";
      const allowed = !permission || isFullAdmin || loaded.permissions?.[permission] === true;

      if (!allowed) {
        setSession(loaded);
        setStatus("denied");
        router.replace("/admin");
        return;
      }

      setSession(loaded);
      setStatus("authorized");
    }

    verify();

    return () => {
      cancelled = true;
    };
  }, [router, permission]);

  return { status, session, token: getAdminToken() };
}

/* رسالة موحّدة لأخطاء الجلسة القادمة من قاعدة البيانات.
   تُستخدم بعد أي استدعاء RPC محمي. */
export function sessionErrorMessage(error: any): string | null {
  const text = String(error?.message || "");

  if (text.includes("AUTH_REQUIRED") || text.includes("AUTH_INVALID")) {
    return "انتهت الجلسة — يرجى تسجيل الدخول من جديد";
  }

  if (text.includes("AUTH_EXPIRED")) {
    return "انتهت مدة الجلسة — يرجى تسجيل الدخول من جديد";
  }

  if (text.includes("AUTH_SUSPENDED")) {
    return "هذا الحساب موقوف";
  }

  if (text.includes("AUTH_FORBIDDEN")) {
    return "لا تملك صلاحية لهذه العملية";
  }

  return null;
}

/* يتعامل مع خطأ جلسة منتهية: يمسح الجلسة ويعيد للدخول.
   يرجع الرسالة إن كان الخطأ يخص الجلسة، وإلا null. */
export function handleSessionError(error: any, router: ReturnType<typeof useRouter>): string | null {
  const message = sessionErrorMessage(error);

  if (message && !String(error?.message || "").includes("AUTH_FORBIDDEN")) {
    clearAdminSession();
    setTimeout(() => router.replace("/admin/login"), 1500);
  }

  return message;
}
