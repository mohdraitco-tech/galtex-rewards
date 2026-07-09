"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type PointHistoryItem = {
  id: string;
  product_number: string;
  points: number;
  status: "released" | "pending";
  status_label: string;
  created_at: string;
};

export default function PointsHistoryPage() {
  const router = useRouter();

  const [history, setHistory] = useState<PointHistoryItem[]>([]);
  const [releasedPoints, setReleasedPoints] = useState(0);
  const [pendingPoints, setPendingPoints] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const customerId = localStorage.getItem("galtex_customer_id");

    if (!customerId) {
      router.replace("/");
      return;
    }

    const [historyResult, summaryResult] = await Promise.all([
      supabase.rpc("get_customer_point_history", {
        p_customer_id: customerId,
      }),

      supabase.rpc("get_customer_points_summary", {
        p_customer_id: customerId,
      }),
    ]);

    if (historyResult.error) {
      console.error("History error:", historyResult.error);

      setMessage(
        historyResult.error.message ||
          "حدث خطأ أثناء تحميل سجل النقاط"
      );

      setIsLoading(false);
      return;
    }

    if (summaryResult.error) {
      console.error("Summary error:", summaryResult.error);

      setMessage(
        summaryResult.error.message ||
          "حدث خطأ أثناء تحميل ملخص النقاط"
      );

      setIsLoading(false);
      return;
    }

    setHistory(historyResult.data || []);

    setReleasedPoints(
      Number(summaryResult.data?.released_points || 0)
    );

    setPendingPoints(
      Number(summaryResult.data?.pending_points || 0)
    );

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="max-w-5xl mx-auto">
        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-10">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-blue-900">
              سجل النقاط
            </h1>

            <p className="text-gray-500 mt-3">
              تابع عمليات المسح وحالة نقاطك
            </p>
          </div>

          {message && (
            <div className="mt-6 bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-center">
              {message}
            </div>
          )}

          {!isLoading && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white rounded-3xl p-6 shadow-md">
                <p className="text-blue-100 text-lg">
                  إجمالي النقاط المفرج عنها
                </p>

                <p className="text-5xl font-bold mt-4">
                  {releasedPoints}
                </p>

                <div className="flex items-center gap-2 mt-4">
                  <span className="w-3 h-3 rounded-full bg-white" />

                  <span className="text-blue-100">
                    نقاط جاهزة للاستخدام
                  </span>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-3xl p-6 shadow-sm">
                <p className="text-yellow-800 text-lg font-bold">
                  إجمالي النقاط الموقفة
                </p>

                <p className="text-5xl font-bold mt-4 text-yellow-700">
                  {pendingPoints}
                </p>

                <div className="flex items-center gap-2 mt-4">
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />

                  <span className="text-yellow-700">
                    بانتظار قراءة الميكانيكي للرمز
                  </span>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-16 text-blue-800 font-bold">
              جاري تحميل سجل النقاط...
            </div>
          ) : history.length === 0 ? (
            <div className="mt-8 bg-slate-50 border border-slate-200 rounded-3xl p-10 text-center">
              <p className="text-gray-500 font-semibold">
                لا توجد عمليات نقاط حتى الآن
              </p>
            </div>
          ) : (
            <div className="mt-8 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-blue-50 text-blue-900">
                    <th className="p-4 text-right rounded-tr-2xl">
                      رقم الصنف
                    </th>

                    <th className="p-4 text-right">
                      تاريخ المسح
                    </th>

                    <th className="p-4 text-center">
                      عدد النقاط
                    </th>

                    <th className="p-4 text-center rounded-tl-2xl">
                      الحالة
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((item) => {
                    const isReleased = item.status === "released";

                    return (
                      <tr
                        key={`${item.status}-${item.id}`}
                        className="border-b border-slate-100 hover:bg-slate-50 transition"
                      >
                        <td className="p-4 font-bold text-blue-900">
                          {item.product_number || "-"}
                        </td>

                        <td className="p-4 text-gray-600">
                          {new Date(
                            item.created_at
                          ).toLocaleString("ar-SA")}
                        </td>

                        <td className="p-4 text-center">
                          <span className="text-xl font-bold text-blue-900">
                            {item.points}
                          </span>
                        </td>

                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <span
                              className={`w-3 h-3 rounded-full ${
                                isReleased
                                  ? "bg-blue-600"
                                  : "bg-yellow-400"
                              }`}
                            />

                            <span
                              className={`font-bold ${
                                isReleased
                                  ? "text-blue-700"
                                  : "text-yellow-700"
                              }`}
                            >
                              {item.status_label}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={() => router.push("/rewards")}
            className="w-full mt-8 bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 font-bold rounded-2xl p-5 transition"
          >
            العودة إلى لوحة المكافآت
          </button>
        </section>
      </div>
    </main>
  );
}