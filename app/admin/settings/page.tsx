"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AdminSettingsPage() {
  const router = useRouter();

  const [mechanicPercentage, setMechanicPercentage] = useState(75);
  const [savedPercentage, setSavedPercentage] = useState(75);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("get_points_settings");

    if (error || !data) {
      setMessage(error?.message || "حدث خطأ أثناء تحميل الإعدادات");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const value = Number(data.mechanic_percentage ?? 75);
    setMechanicPercentage(value);
    setSavedPercentage(value);
    setUpdatedAt(data.updated_at || null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const sellerPercentage = 100 - mechanicPercentage;
  const hasChanges = mechanicPercentage !== savedPercentage;

  async function handleSave() {
    const adminId =
      typeof window !== "undefined" ? localStorage.getItem("galtex_admin_id") : null;

    if (!adminId) {
      setMessage("تعذر التعرف على حساب الإدارة، يرجى تسجيل الدخول من جديد");
      setMessageType("error");
      return;
    }

    setIsSaving(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("update_points_settings", {
      p_mechanic_percentage: mechanicPercentage,
      p_admin_id: adminId,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء حفظ الإعدادات");
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    setMessage(data.message);
    setMessageType("success");
    setSavedPercentage(mechanicPercentage);
    setIsSaving(false);
    await loadSettings();
  }

  // مثال حي: منتج بعدد نقاط افتراضي 100
  const exampleTotal = 100;
  const exampleMechanic = Math.floor((exampleTotal * mechanicPercentage) / 100);
  const exampleSeller = exampleTotal - exampleMechanic;

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <section className="bg-gradient-to-r from-blue-900 to-blue-700 rounded-[2rem] shadow-xl p-7 md:p-9 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <p className="text-blue-200 font-semibold">GALTEX Rewards</p>
              <h1 className="text-3xl md:text-4xl font-bold mt-2">إعدادات نسب توزيع النقاط</h1>
              <p className="text-blue-100 mt-3">
                تحديد النسبة اللي تروح للميكانيكي والباقي للمبيعات عند كل عملية مسح
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

        {isLoading ? (
          <div className="bg-white rounded-[2rem] shadow-xl p-10 text-center text-gray-500">
            جاري تحميل الإعدادات...
          </div>
        ) : (
          <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-10">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 text-center">
                <p className="text-blue-700 font-bold">نسبة الميكانيكي</p>
                <p className="text-5xl font-black text-blue-900 mt-3">{mechanicPercentage}%</p>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 text-center">
                <p className="text-emerald-700 font-bold">نسبة المبيعات / التاجر</p>
                <p className="text-5xl font-black text-emerald-900 mt-3">{sellerPercentage}%</p>
              </div>
            </div>

            <div className="mt-8">
              <label className="block text-sm font-bold text-gray-700 mb-3">
                اسحب لتعديل نسبة الميكانيكي
              </label>

              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={mechanicPercentage}
                onChange={(event) => setMechanicPercentage(Number(event.target.value))}
                className="w-full accent-blue-700"
              />

              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>0% ميكانيكي</span>
                <span>50%</span>
                <span>100% ميكانيكي</span>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                أو أدخل الرقم مباشرة
              </label>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={mechanicPercentage}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isNaN(value)) return;
                    setMechanicPercentage(Math.min(100, Math.max(0, value)));
                  }}
                  dir="ltr"
                  className="w-32 border border-gray-300 rounded-2xl px-4 py-3 font-bold text-center outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span className="text-gray-500 font-semibold">% للميكانيكي</span>
              </div>
            </div>

            <div className="mt-8 bg-slate-50 border border-slate-200 rounded-3xl p-6">
              <p className="font-bold text-slate-800 mb-4">مثال حي (منتج قيمته 100 نقطة)</p>

              <div className="flex items-center gap-4">
                <div className="flex-1 bg-white rounded-2xl p-4 text-center border border-slate-100">
                  <p className="text-gray-400 text-sm">الميكانيكي يحصل على</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{exampleMechanic} نقطة</p>
                </div>

                <div className="flex-1 bg-white rounded-2xl p-4 text-center border border-slate-100">
                  <p className="text-gray-400 text-sm">المبيعات / التاجر يحصل على</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{exampleSeller} نقطة</p>
                </div>
              </div>
            </div>

            {updatedAt && (
              <p className="text-xs text-gray-400 mt-4 text-center">
                آخر تحديث: {new Date(updatedAt).toLocaleString("ar-SA")}
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="w-full mt-6 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl transition"
            >
              {isSaving
                ? "جاري الحفظ..."
                : hasChanges
                ? "حفظ التعديلات"
                : "لا يوجد تعديلات لحفظها"}
            </button>

            <p className="text-xs text-gray-400 mt-4 text-center leading-6">
              ⚠️ هذا التعديل يؤثر فقط على عمليات المسح الجديدة بعد الحفظ، ولا يغيّر النقاط
              اللي اتصرفت أو اتحسبت مسبقًا.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
