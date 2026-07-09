"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type ProfileData = {
  first_name: string;
  last_name: string;
  username: string;
  customer_number: string | null;
  customer_type: string | null;
  city: string | null;
  country: string | null;
  phone_international: string | null;
  points: number;
  status: string;
  created_at: string;
};

export default function CustomerProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const customerId = localStorage.getItem("galtex_customer_id");

    if (!customerId) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase.rpc("get_customer_profile", {
      p_customer_id: customerId,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "تعذر تحميل بيانات الحساب");
      setIsLoading(false);
      return;
    }

    setProfile(data as ProfileData);
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  function handleLogout() {
    localStorage.removeItem("galtex_customer_id");
    localStorage.removeItem("galtex_customer_number");
    localStorage.removeItem("galtex_customer_name");
    localStorage.removeItem("galtex_customer_points");

    router.replace("/");
  }

  const typeLabel =
    profile?.customer_type === "seller"
      ? "مبيعات / تاجر"
      : profile?.customer_type === "mechanic"
      ? "ميكانيكي"
      : "-";

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-blue-900">الملف الشخصي</h1>
          <p className="text-gray-500 mt-3">بيانات حسابك في GALTEX Rewards</p>
        </section>

        {message && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-center font-semibold">
            {message}
          </div>
        )}

        {isLoading ? (
          <div className="bg-white rounded-[2rem] shadow-xl p-10 text-center text-gray-500">
            جاري تحميل البيانات...
          </div>
        ) : profile ? (
          <>
            <section className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-[2rem] shadow-lg p-8 text-white text-center">
              <p className="text-blue-100">مرحباً</p>
              <p className="text-3xl font-bold mt-2">
                {profile.first_name} {profile.last_name}
              </p>

              <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-2">
                {profile.customer_number && (
                  <span className="bg-white/15 border border-white/25 px-4 py-2 rounded-full text-sm font-bold">
                    رقم العميل: {profile.customer_number}
                  </span>
                )}
                <span className="bg-white/15 border border-white/25 px-4 py-2 rounded-full text-sm font-bold">
                  {typeLabel}
                </span>
              </div>

              <p className="text-5xl font-black mt-6">{profile.points}</p>
              <p className="text-blue-100 mt-1">نقطة في رصيدك</p>
            </section>

            <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-5">بيانات الحساب</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoRow label="اسم المستخدم" value={profile.username} ltr />
                <InfoRow label="المدينة" value={profile.city || "-"} />
                <InfoRow label="الدولة" value={profile.country || "-"} />
                <InfoRow label="رقم الجوال" value={profile.phone_international || "-"} ltr />
                <InfoRow
                  label="تاريخ الانضمام"
                  value={new Date(profile.created_at).toLocaleDateString("ar-SA")}
                />
                <InfoRow
                  label="حالة الحساب"
                  value={profile.status === "active" ? "مفعل" : profile.status}
                />
              </div>
            </section>

            <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-8 space-y-3">
              <button
                type="button"
                onClick={() => router.push("/rewards")}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 rounded-2xl transition"
              >
                العودة إلى لوحة المكافآت
              </button>

              <a
                href="/forgot-password"
                className="block w-full text-center border border-blue-200 hover:bg-blue-50 text-blue-800 font-bold py-4 rounded-2xl transition"
              >
                تغيير كلمة المرور
              </a>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold py-4 rounded-2xl transition"
              >
                تسجيل الخروج
              </button>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function InfoRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="font-bold text-gray-800 mt-1" dir={ltr ? "ltr" : "rtl"}>
        {value}
      </p>
    </div>
  );
}
