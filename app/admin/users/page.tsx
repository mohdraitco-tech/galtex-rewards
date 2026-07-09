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
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <section className="bg-gradient-to-r from-blue-900 to-blue-700 rounded-[2rem] shadow-xl p-7 md:p-9 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <p className="text-blue-200 font-semibold">GALTEX Rewards</p>
              <h1 className="text-3xl md:text-4xl font-bold mt-2">إدارة المستخدمين</h1>
              <p className="text-blue-100 mt-3">
                أنشئ حسابات إدارية جديدة وحدّد بالضبط أي الأقسام يقدر كل موظف يوصلها
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-6 py-3 rounded-2xl font-bold transition"
            >
              لوحة الإدارة
            </button>
          </div>
        </section>

        {message && (
          <div
            className={`rounded-2xl p-4 text-center font-bold border ${
              messageType === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {message}
          </div>
        )}

        {/* ============== نموذج إنشاء/تعديل حساب ============== */}
        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-2xl font-bold text-gray-900">
              {isEditing ? `تعديل حساب: ${form.full_name}` : "إنشاء حساب جديد"}
            </h2>

            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-2xl font-bold transition"
              >
                إلغاء التعديل
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">اسم المستخدم</label>
                <input
                  type="text"
                  required
                  disabled={isEditing}
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                  dir="ltr"
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-gray-400"
                />
                {isEditing && (
                  <p className="text-xs text-gray-400 mt-1">اسم المستخدم لا يمكن تغييره بعد الإنشاء</p>
                )}
              </div>

              {!isEditing && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">كلمة المرور</label>
                  <input
                    type="text"
                    required
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    dir="ltr"
                    className="w-full border border-gray-300 rounded-2xl px-4 py-3 bg-yellow-50 outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}
            </div>

            {/* الحسابات الجديدة كلها موظفين بصلاحيات محددة. حساب المدير العام
                (super_admin) وحيد بالنظام ولا يُنشأ من هنا. */}
            {form.role === "super_admin" ? (
              <div className="bg-purple-50 border border-purple-100 text-purple-700 rounded-2xl p-4 text-sm font-semibold">
                هذا حساب "مدير عام" ويملك كل الصلاحيات تلقائيًا.
              </div>
            ) : (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  الأقسام المسموح للموظف يوصلها
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PERMISSION_SECTIONS.map((section) => (
                    <label
                      key={section.key}
                      className="flex items-start gap-3 border border-slate-200 rounded-2xl p-4 bg-slate-50 cursor-pointer hover:bg-blue-50 transition"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(form.permissions[section.key])}
                        onChange={() => togglePermission(section.key)}
                        className="w-5 h-5 mt-0.5"
                      />
                      <div>
                        <p className="font-bold text-gray-800">{section.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {isEditing && (
              <label className="flex items-center gap-3 border border-gray-300 rounded-2xl px-4 py-3 w-full cursor-pointer md:w-auto">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                  className="w-5 h-5"
                />
                <span className="font-bold text-gray-700">الحساب فعّال</span>
              </label>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold px-8 py-3.5 rounded-2xl shadow-lg transition"
            >
              {isSaving ? "جاري الحفظ..." : isEditing ? "حفظ التعديلات" : "إنشاء الحساب"}
            </button>
          </form>
        </section>

        {/* ============== قائمة الحسابات ============== */}
        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-8">
          <h2 className="text-2xl font-bold text-gray-900">كل الحسابات الإدارية</h2>

          {isLoading ? (
            <div className="text-center py-16 text-gray-500">جاري التحميل...</div>
          ) : sortedUsers.length === 0 ? (
            <div className="mt-6 bg-slate-50 rounded-3xl p-12 text-center text-gray-500">
              لا توجد حسابات بعد
            </div>
          ) : (
            <div className="overflow-x-auto mt-6">
              <table className="w-full text-right border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-blue-900 text-sm">
                    <th className="px-4">الاسم</th>
                    <th className="px-4">اسم المستخدم</th>
                    <th className="px-4">النوع</th>
                    <th className="px-4">الصلاحيات</th>
                    <th className="px-4">الحالة</th>
                    <th className="px-4">إجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedUsers.map((user) => {
                    const isSelf = user.id === currentAdminId;
                    const activePermissionsCount = PERMISSION_SECTIONS.filter(
                      (s) => user.permissions?.[s.key]
                    ).length;

                    return (
                      <tr key={user.id} className="bg-slate-50 hover:bg-blue-50 transition">
                        <td className="p-4 rounded-r-2xl font-bold text-gray-800">
                          {user.full_name}
                          {isSelf && <span className="text-xs text-blue-500 mr-2">(أنت)</span>}
                        </td>

                        <td className="p-4 text-gray-700" dir="ltr">{user.username}</td>

                        <td className="p-4">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-bold border ${
                              user.role === "super_admin"
                                ? "bg-purple-50 text-purple-700 border-purple-100"
                                : "bg-blue-50 text-blue-700 border-blue-100"
                            }`}
                          >
                            {user.role === "super_admin" ? "مدير عام" : "موظف"}
                          </span>
                        </td>

                        <td className="p-4 text-gray-600 text-sm">
                          {user.role === "super_admin" ? "الكل" : `${activePermissionsCount} من ${PERMISSION_SECTIONS.length}`}
                        </td>

                        <td className="p-4">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-bold border ${
                              user.is_active
                                ? "bg-green-50 text-green-700 border-green-100"
                                : "bg-red-50 text-red-700 border-red-100"
                            }`}
                          >
                            {user.is_active ? "فعّال" : "موقوف"}
                          </span>
                        </td>

                        <td className="p-4 rounded-l-2xl">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(user)}
                              className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 font-bold text-sm"
                            >
                              تعديل
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setResetPasswordFor(user);
                                setNewPassword("");
                              }}
                              className="rounded-xl bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 font-bold text-sm"
                            >
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
      </div>

      {resetPasswordFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-blue-950">تعيين كلمة مرور جديدة</h2>
            <p className="mt-2 text-gray-500">
              الحساب: <span className="font-bold text-gray-800">{resetPasswordFor.full_name}</span>
            </p>

            <div className="mt-5">
              <label className="block text-sm font-bold text-gray-700 mb-2">كلمة المرور الجديدة</label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                dir="ltr"
                className="w-full border border-gray-300 rounded-2xl px-4 py-3 bg-yellow-50 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={submitPasswordReset}
                disabled={isResetting}
                className="flex-1 rounded-2xl bg-green-600 hover:bg-green-700 disabled:bg-gray-500 px-6 py-4 font-bold text-white shadow-lg"
              >
                {isResetting ? "جاري الحفظ..." : "تأكيد"}
              </button>

              <button
                type="button"
                onClick={() => setResetPasswordFor(null)}
                disabled={isResetting}
                className="rounded-2xl bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 px-6 py-4 font-bold text-white shadow-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}