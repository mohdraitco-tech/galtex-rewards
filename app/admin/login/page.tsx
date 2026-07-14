"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setIsLoading(true);

    const { data, error } = await supabase.rpc("login_admin", {
      p_username: username.trim(),
      p_password: password,
    });

    if (error) {
      setMessage("حدث خطأ أثناء تسجيل الدخول");
      setIsLoading(false);
      return;
    }

    if (!data?.success) {
      setMessage(data?.message || "تعذر تسجيل الدخول");
      setIsLoading(false);
      return;
    }

    localStorage.setItem("galtex_admin_id", data.admin_id);
    localStorage.setItem("galtex_admin_username", data.username);
    localStorage.setItem("galtex_admin_name", data.full_name);
    localStorage.setItem("galtex_admin_role", data.role);
    // صلاحيات الموظف المرنة (كائن JSON) — تُستخدم لإخفاء/إظهار الأقسام
    // بلوحة الإدارة. المدير العام ما يحتاجها لأن عنده كل الصلاحيات دائمًا.
    localStorage.setItem("galtex_admin_permissions", JSON.stringify(data.permissions || {}));

    router.push("/admin");
  }

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 flex items-center justify-center px-4 py-8"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-3xl bg-white shadow-md ring-1 ring-slate-100">
            <Image
              src="/galtex-logo.png"
              alt="GALTEX"
              width={96}
              height={96}
              priority
              className="h-24 w-24 object-contain"
            />
          </div>
          <h1 className="text-4xl font-bold text-blue-900 tracking-wide">GALTEX</h1>
          <p className="text-3xl font-bold text-blue-700 mt-2">Rewards</p>
          <p className="text-gray-500 mt-3">لوحة تحكم الإدارة</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              اسم المستخدم
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="أدخل اسم المستخدم"
              autoFocus
              className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              كلمة المرور
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="أدخل كلمة المرور"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {message && (
            <div className="text-center text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition"
          >
            {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </main>
  );
}
