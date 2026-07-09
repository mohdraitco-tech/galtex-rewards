"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function RewardsPage() {
  const router = useRouter();

  const [name, setName] = useState("عميل GALTEX");
  const [points, setPoints] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const customerId = localStorage.getItem("galtex_customer_id");

    if (!customerId) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase.rpc("get_customer_dashboard", {
      p_customer_id: customerId,
    });

    if (error || !data?.success) {
      setMessage(
        data?.message ||
          error?.message ||
          "تعذر تحميل بيانات الحساب"
      );

      setIsLoading(false);
      return;
    }

    setName(
      `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
        "عميل GALTEX"
    );

    setPoints(Number(data.points || 0));

    localStorage.setItem(
      "galtex_customer_points",
      String(data.points || 0)
    );

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    loadDashboard();

    function handlePageFocus() {
      loadDashboard();
    }

    window.addEventListener("focus", handlePageFocus);

    return () => {
      window.removeEventListener("focus", handlePageFocus);
    };
  }, [loadDashboard]);

  function handleLogout() {
    localStorage.removeItem("galtex_customer_id");
    localStorage.removeItem("galtex_customer_name");
    localStorage.removeItem("galtex_customer_points");

    router.replace("/");
  }

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="max-w-5xl mx-auto">
        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-10 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-40 h-40 bg-blue-100 rounded-full blur-3xl opacity-70" />

          <div className="absolute bottom-0 right-0 w-52 h-52 bg-blue-200 rounded-full blur-3xl opacity-40" />

          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
              <div>
                <h1 className="text-4xl font-bold text-blue-900">
                  GALTEX Rewards
                </h1>

                <p className="text-gray-500 mt-3 text-lg">
                  مرحبًا {name} إلى عالم المكافآت من شركة GALTEX الألمانية
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="self-start border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold px-5 py-3 rounded-2xl transition"
              >
                تسجيل الخروج
              </button>
            </div>

            {message && (
              <div className="mt-6 bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-center font-semibold">
                {message}
              </div>
            )}

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2 bg-gradient-to-r from-blue-700 to-blue-900 text-white rounded-3xl p-8 shadow-lg">
                <p className="text-blue-100 text-lg">
                  رصيد النقاط الحالي
                </p>

                <p className="text-6xl font-bold mt-4">
                  {isLoading ? "..." : points}
                </p>

                <p className="text-blue-100 mt-3">
                  نقطة مفرج عنها وجاهزة للاستخدام
                </p>
              </div>

              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200">
                <p className="font-bold text-blue-900 text-lg">
                  ابدأ بسهولة
                </p>

                <p className="text-gray-500 mt-3 leading-7">
                  امسح رمز QR الموجود على منتج GALTEX لتسجيل نقاط المكافآت في حسابك.
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
              <button
                type="button"
                onClick={() => router.push("/rewards/scan")}
                className="text-center bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 font-bold rounded-2xl p-5 shadow-sm transition"
              >
                مسح QR
              </button>

              <button
                type="button"
                onClick={() => router.push("/rewards/history")}
                className="text-center bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 font-bold rounded-2xl p-5 shadow-sm transition"
              >
                سجل النقاط
              </button>

              <button
                type="button"
                onClick={() => router.push("/rewards/profile")}
                className="text-center bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 font-bold rounded-2xl p-5 shadow-sm transition"
              >
                الملف الشخصي
              </button>
            </div>

            <button
              type="button"
              onClick={loadDashboard}
              disabled={isLoading}
              className="w-full mt-5 bg-blue-50 hover:bg-blue-100 disabled:bg-gray-100 text-blue-800 disabled:text-gray-400 font-bold rounded-2xl p-4 transition"
            >
              {isLoading ? "جاري تحديث الرصيد..." : "تحديث الرصيد"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}