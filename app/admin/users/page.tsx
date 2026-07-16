"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type AdminRole = "super_admin" | "employee";

type Permissions = {
  products?: boolean;
  customers?: boolean;
  qr_codes?: boolean;
  label_templates?: boolean;
  settings?: boolean;
  can_delete?: boolean;
  can_import_legacy?: boolean;
};

type AdminUser = {
  id: string;
  username: string;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  permissions: Permissions;
  created_at: string;
};

type MessageType = "success" | "error" | "";

const PERMISSION_SECTIONS: { key: keyof Permissions; label: string; description: string }[] = [
  { key: "products", label: "المنتجات", description: "إضافة وتعديل المنتجات وتوليد أكواد QR" },
  { key: "customers", label: "إدارة العملاء والنقاط", description: "طلبات التسجيل، صرف النقاط، إيقاف الحسابات" },
  { key: "qr_codes", label: "أكواد QR", description: "متابعة الأكواد المولّدة وحالة استخدامها" },
  { key: "label_templates", label: "قوالب الليبل", description: "تصميم وإدارة قوالب طباعة الليبلات" },
  { key: "settings", label: "الإعدادات", description: "نسب توزيع النقاط بين الميكانيكي والمبيعات" },
  { key: "can_delete", label: "حذف نهائي", description: "حذف/إيقاف منتجات أو قوالب بشكل نهائي" },
  { key: "can_import_legacy", label: "استيراد بيانات قديمة بالجملة", description: "استيراد عملاء أو أكواد QR من ملفات إكسل" },
];

const emptyPermissions: Permissions = {
  products: false,
  customers: false,
  qr_codes: false,
  label_templates: false,
  settings: false,
  can_delete: false,
  can_import_legacy: false,
};

type FormState = {
  id: string | null; // null = إنشاء جديد
  username: string;
  password: string;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  permissions: Permissions;
};

const emptyForm: FormState = {
  id: null,
  username: "",
  password: "",
  full_name: "",
  role: "employee",
  is_active: true,
  permissions: { ...emptyPermissions },
};

export default function AdminUsersPage() {
  const router = useRouter();

  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  const [form, setForm] = useState<FormState>(emptyForm);

  const [resetPasswordFor, setResetPasswordFor] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const isEditing = form.id !== null;

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("get_admin_users");

    if (error) {
      setMessage(error.message || "حدث خطأ أثناء تحميل المستخدمين");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    setUsers((data || []) as AdminUser[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const id = localStorage.getItem("galtex_admin_id");
    const role = localStorage.getItem("galtex_admin_role");
    setCurrentAdminId(id);
    setCurrentRole(role);

    // هذي الصفحة للمدير العام بس — أي حد ثاني يوصلها مباشرة يُرجَّع للوحة الإدارة
    if (role !== "super_admin") {
      router.replace("/admin");
      return;
    }

    loadUsers();
  }, [loadUsers, router]);

  function resetForm() {
    setForm(emptyForm);
  }

  function startEdit(user: AdminUser) {
    setForm({
      id: user.id,
      username: user.username,
      password: "",
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      permissions: { ...emptyPermissions, ...(user.permissions || {}) },
    });
    setMessage("");
    setMessageType("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePermission(key: keyof Permissions) {
    setForm((previous) => ({
      ...previous,
      permissions: { ...previous.permissions, [key]: !previous.permissions[key] },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setMessageType("");

    if (!currentAdminId) {
      setMessage("تعذر التعرف على حسابك، سجّل الدخول من جديد");
      setMessageType("error");
      return;
    }

    if (!form.username.trim() || !form.full_name.trim()) {
      setMessage("يرجى تعبئة اسم المستخدم والاسم الكامل");
      setMessageType("error");
      return;
    }

    if (!isEditing && !form.password.trim()) {
      setMessage("يرجى تحديد كلمة مرور للحساب الجديد");
      setMessageType("error");
      return;
    }

    setIsSaving(true);

    if (isEditing) {
      const { data, error } = await supabase.rpc("update_admin_user", {
        p_requester_admin_id: currentAdminId,
        p_admin_id: form.id,
        p_full_name: form.full_name.trim(),
        p_role: form.role,
        p_permissions: form.permissions,
        p_is_active: form.is_active,
      });

      setIsSaving(false);

      if (error || !data?.success) {
        setMessage(data?.message || error?.message || "تعذر تحديث الحساب");
        setMessageType("error");
        return;
      }

      setMessage(data.message || "تم تحديث الحساب بنجاح");
      setMessageType("success");
      resetForm();
      await loadUsers();
      return;
    }

    const { data, error } = await supabase.rpc("create_admin_user", {
      p_requester_admin_id: currentAdminId,
      p_username: form.username.trim(),
      p_password: form.password,
      p_full_name: form.full_name.trim(),
      p_role: form.role,
      p_permissions: form.permissions,
    });

    setIsSaving(false);

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "تعذر إنشاء الحساب");
      setMessageType("error");
      return;
    }

    setMessage(data.message || "تم إنشاء الحساب بنجاح");
    setMessageType("success");
    resetForm();
    await loadUsers();
  }

  async function submitPasswordReset() {
    if (!currentAdminId || !resetPasswordFor) return;

    if (!newPassword.trim()) {
      setMessage("يرجى إدخال كلمة مرور جديدة");
      setMessageType("error");
      return;
    }

    setIsResetting(true);

    const { data, error } = await supabase.rpc("admin_reset_user_password", {
      p_requester_admin_id: currentAdminId,
      p_admin_id: resetPasswordFor.id,
      p_new_password: newPassword,
    });

    setIsResetting(false);

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "تعذر تغيير كلمة المرور");
      setMessageType("error");
      return;
    }

    setMessage(data.message || "تم تغيير كلمة المرور بنجاح");
    setMessageType("success");
    setResetPasswordFor(null);
    setNewPassword("");
  }

  const sortedUsers = useMemo(
    () => users.slice().sort((a, b) => (a.role === b.role ? 0 : a.role === "super_admin" ? -1 : 1)),
    [users]
  );

  if (currentRole !== "super_admin") {
    return null; // يمنع أي وميض بالمحتوى قبل ما يصير التحويل بـ useEffect
  }
  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: "#F5F2EC", color: "#0E2C5C", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== HEADER ===== */}
      <header style={{ background: "rgba(245,242,236,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(18,44,92,0.08)", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 32, width: "auto", display: "block" }} />
            <span style={{ width: 1, height: 26, background: "rgba(18,44,92,0.15)" }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#C4952E" }}>الإدارة</span>
          </div>
          <button type="button" onClick={() => router.push("/admin")} style={{ background: "none", border: "none", color: "#16407F", fontFamily: "inherit", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>‹ لوحة التحكم</button>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 28px 60px" }}>

        {/* العنوان */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ width: 12, height: 12, background: "#C4952E", display: "inline-block", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
            <h1 style={{ fontSize: "clamp(24px,2.6vw,32px)", fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#0E2C5C" }}>إدارة المستخدمين</h1>
          </div>
          <p style={{ fontSize: 15.5, color: "#586377", margin: 0 }}>أنشئ حسابات إدارية جديدة وحدّد بالضبط أي الأقسام يقدر كل موظف يوصلها</p>
        </div>

        {message && (
          <div style={{ borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 700, marginBottom: 22, background: messageType === "success" ? "rgba(31,138,91,0.1)" : "rgba(192,57,43,0.08)", border: messageType === "success" ? "1px solid rgba(31,138,91,0.3)" : "1px solid rgba(192,57,43,0.25)", color: messageType === "success" ? "#1F8A5B" : "#C0392B" }}>
            {message}
          </div>
        )}

        {/* ============== نموذج إنشاء/تعديل ============== */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "26px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: "#0E2C5C" }}>
              {isEditing ? `تعديل حساب: ${form.full_name}` : "إنشاء حساب جديد"}
            </h2>
            {isEditing && (
              <button type="button" onClick={resetForm} style={{ background: "rgba(18,44,92,0.06)", color: "#586377", border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, padding: "9px 18px", borderRadius: 11, cursor: "pointer" }}>
                إلغاء التعديل
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="gx-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>الاسم الكامل</label>
                <input type="text" required value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} className="gx-in" style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>اسم المستخدم</label>
                <input type="text" required disabled={isEditing} value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} dir="ltr" className="gx-in" style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: isEditing ? "rgba(18,44,92,0.05)" : "#FFFFFF", color: isEditing ? "#9AA3B5" : "#0E2C5C" }} />
                {isEditing && (
                  <p style={{ fontSize: 12, color: "#9AA3B5", margin: "6px 0 0" }}>اسم المستخدم لا يمكن تغييره بعد الإنشاء</p>
                )}
              </div>
              {!isEditing && (
                <div>
                  <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>كلمة المرور</label>
                  <input type="text" required value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} dir="ltr" className="gx-in" style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FBF3DC", color: "#0E2C5C" }} />
                </div>
              )}
            </div>

            {form.role === "super_admin" ? (
              <div style={{ background: "rgba(122,64,158,0.08)", border: "1px solid rgba(122,64,158,0.25)", color: "#7A409E", borderRadius: 14, padding: 16, fontSize: 14, fontWeight: 600 }}>
                هذا حساب &quot;مدير عام&quot; ويملك كل الصلاحيات تلقائيًا.
              </div>
            ) : (
              <div>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 12 }}>الأقسام المسموح للموظف يوصلها</label>
                <div className="gx-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {PERMISSION_SECTIONS.map((section) => (
                    <label key={section.key} className="gx-perm" style={{ display: "flex", alignItems: "flex-start", gap: 12, border: "1px solid rgba(18,44,92,0.12)", borderRadius: 14, padding: 14, background: "#F5F2EC", cursor: "pointer" }}>
                      <input type="checkbox" checked={Boolean(form.permissions[section.key])} onChange={() => togglePermission(section.key)} style={{ width: 18, height: 18, marginTop: 2, accentColor: "#16407F", flexShrink: 0 }} />
                      <div>
                        <p style={{ fontWeight: 700, color: "#0E2C5C", margin: 0, fontSize: 14.5 }}>{section.label}</p>
                        <p style={{ fontSize: 12, color: "#7A8498", margin: "3px 0 0" }}>{section.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {isEditing && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 12, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 16px", cursor: "pointer", alignSelf: "flex-start" }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} style={{ width: 18, height: 18, accentColor: "#16407F" }} />
                <span style={{ fontWeight: 700, color: "#33405A" }}>الحساب فعّال</span>
              </label>
            )}

            <button type="submit" disabled={isSaving} style={{ alignSelf: "flex-start", background: isSaving ? "#9AA3B5" : "#1F8A5B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: "13px 32px", border: "none", borderRadius: 12, cursor: isSaving ? "not-allowed" : "pointer" }}>
              {isSaving ? "جاري الحفظ..." : isEditing ? "حفظ التعديلات" : "إنشاء الحساب"}
            </button>
          </form>
        </section>

        {/* ============== قائمة الحسابات ============== */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "26px" }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px", color: "#0E2C5C" }}>كل الحسابات الإدارية</h2>

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "64px 0", color: "#7A8498" }}>جاري التحميل...</div>
          ) : sortedUsers.length === 0 ? (
            <div style={{ marginTop: 22, background: "rgba(18,44,92,0.03)", borderRadius: 16, padding: 48, textAlign: "center", color: "#7A8498" }}>لا توجد حسابات بعد</div>
          ) : (
            <div className="gx-tablewrap" style={{ overflowX: "auto", marginTop: 22 }}>
              <table style={{ width: "100%", textAlign: "right", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#586377", fontSize: 13, background: "rgba(18,44,92,0.04)" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>الاسم</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>اسم المستخدم</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>النوع</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>الصلاحيات</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>الحالة</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => {
                    const isSelf = user.id === currentAdminId;
                    const activePermissionsCount = PERMISSION_SECTIONS.filter((s) => user.permissions?.[s.key]).length;
                    return (
                      <tr key={user.id} className="gx-row" style={{ background: "#FFFFFF" }}>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", fontWeight: 700, color: "#0E2C5C" }}>
                          {user.full_name}
                          {isSelf && <span style={{ fontSize: 12, color: "#16407F", marginInlineStart: 8 }}>(أنت)</span>}
                        </td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", color: "#586377" }} dir="ltr">{user.username}</td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center" }}>
                          <span style={{ padding: "4px 12px", borderRadius: 100, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", border: "1px solid", background: user.role === "super_admin" ? "rgba(122,64,158,0.1)" : "rgba(22,64,127,0.08)", color: user.role === "super_admin" ? "#7A409E" : "#16407F", borderColor: user.role === "super_admin" ? "rgba(122,64,158,0.25)" : "#dfe6f2" }}>
                            {user.role === "super_admin" ? "مدير عام" : "موظف"}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center", color: "#586377", fontSize: 13.5 }}>
                          {user.role === "super_admin" ? "الكل" : `${activePermissionsCount} من ${PERMISSION_SECTIONS.length}`}
                        </td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center" }}>
                          <span style={{ padding: "4px 12px", borderRadius: 100, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", border: "1px solid", background: user.is_active ? "rgba(31,138,91,0.1)" : "rgba(192,57,43,0.08)", color: user.is_active ? "#1F8A5B" : "#C0392B", borderColor: user.is_active ? "rgba(31,138,91,0.3)" : "rgba(192,57,43,0.25)" }}>
                            {user.is_active ? "فعّال" : "موقوف"}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "nowrap" }}>
                            <button type="button" onClick={() => startEdit(user)} style={{ background: "rgba(196,149,46,0.16)", color: "#8F6819", border: "none", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                              تعديل
                            </button>
                            <button type="button" onClick={() => { setResetPasswordFor(user); setNewPassword(""); }} style={{ background: "rgba(22,64,127,0.1)", color: "#16407F", border: "none", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                              كلمة مرور جديدة
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ============== نافذة كلمة مرور جديدة ============== */}
      {resetPasswordFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(14,44,92,0.55)", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 440, borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)" }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0E2C5C", margin: 0 }}>تعيين كلمة مرور جديدة</h2>
            <p style={{ marginTop: 8, color: "#586377" }}>
              الحساب: <span style={{ fontWeight: 700, color: "#0E2C5C" }}>{resetPasswordFor.full_name}</span>
            </p>
            <div style={{ marginTop: 20 }}>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>كلمة المرور الجديدة</label>
              <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} dir="ltr" className="gx-in" style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FBF3DC", color: "#0E2C5C" }} />
            </div>
            <div style={{ marginTop: 22, display: "flex", gap: 12 }}>
              <button type="button" onClick={submitPasswordReset} disabled={isResetting} style={{ flex: 1, borderRadius: 12, background: isResetting ? "#9AA3B5" : "#1F8A5B", padding: "13px", fontFamily: "inherit", fontWeight: 700, color: "#fff", border: "none", cursor: isResetting ? "not-allowed" : "pointer" }}>
                {isResetting ? "جاري الحفظ..." : "تأكيد"}
              </button>
              <button type="button" onClick={() => setResetPasswordFor(null)} disabled={isResetting} style={{ borderRadius: 12, background: "#E4E1DA", padding: "13px 26px", fontFamily: "inherit", fontWeight: 700, color: "#586377", border: "none", cursor: isResetting ? "not-allowed" : "pointer" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .gx-in:focus { outline: none; border-color: #16407F; box-shadow: 0 0 0 3px rgba(22,64,127,0.12); }
        .gx-in::placeholder { color: #9AA3B5; }
        .gx-perm:hover { border-color: #16407F !important; background: rgba(22,64,127,0.04) !important; }
        .gx-row:hover { background: rgba(18,44,92,0.02) !important; }
        @media (max-width:820px){
          .gx-2col { grid-template-columns:1fr !important; }
        }
      `}</style>
    </div>
  );
}