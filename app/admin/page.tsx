"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type PendingCustomer = { id: string };

type AdminCustomer = {
  customer_type: string | null;
  current_points: number;
};

export default function AdminPage() {
  const router = useRouter();

  const [adminName, setAdminName] = useState("");
  const [pendingCustomers, setPendingCustomers] = useState<PendingCustomer[]>([]);
  const [allCustomers, setAllCustomers] = useState<AdminCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const stats = useMemo(() => {
    return {
      totalCustomers: allCustomers.length,
      pendingRequests: pendingCustomers.length,
      mechanics: allCustomers.filter((c) => c.customer_type === "mechanic").length,
      sellers: allCustomers.filter((c) => c.customer_type === "seller").length,
      totalPoints: allCustomers.reduce(
        (total, customer) => total + Number(customer.current_points || 0),
        0
      ),
    };
  }, [allCustomers, pendingCustomers]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const [pendingResult, customersResult] = await Promise.all([
      supabase.rpc("get_pending_customers"),
      supabase.rpc("get_admin_customers"),
    ]);

    if (pendingResult.error) {
      setMessage(pendingResult.error.message || "حدث خطأ أثناء تحميل طلبات التسجيل");
      setIsLoading(false);
      return;
    }

    if (customersResult.error) {
      setMessage(customersResult.error.message || "حدث خطأ أثناء تحميل العملاء");
      setIsLoading(false);
      return;
    }

    setPendingCustomers(pendingResult.data || []);
    setAllCustomers(customersResult.data || []);
    setIsLoading(false);
  }, []);

  function handleLogout() {
    localStorage.removeItem("galtex_admin_id");
    localStorage.removeItem("galtex_admin_username");
    localStorage.removeItem("galtex_admin_name");
    localStorage.removeItem("galtex_admin_role");

    router.replace("/admin/login");
  }

  useEffect(() => {
    setAdminName(localStorage.getItem("galtex_admin_name") || "");
    loadData();
  }, [loadData]);

  const navCards = [
    {
      title: "إدارة العملاء والنقاط",
      description: "طلبات التسجيل، صرف النقاط، إيقاف وتفعيل الحسابات",
      href: "/admin/customers",
      badge: stats.pendingRequests > 0 ? `${stats.pendingRequests} طلب معلق` : undefined,
      bg: "#1d4ed8",
      bgHover: "#1e40af",
    },
    {
      title: "المنتجات",
      description: "إضافة وتعديل المنتجات، وتوليد أكواد QR",
      href: "/admin/products",
      bg: "#16a34a",
      bgHover: "#15803d",
    },
    {
      title: "أكواد QR",
      description: "متابعة الأكواد المولدة وحالة استخدامها",
      href: "/admin/qr-codes",
      bg: "#dc2626",
      bgHover: "#b91c1c",
    },
    {
      title: "قوالب الليبل",
      description: "تصميم وإدارة قوالب طباعة الليبلات",
      href: "/admin/label-templates",
      bg: "#ea580c",
      bgHover: "#c2410c",
    },
  ];

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="bg-gradient-to-r from-blue-900 to-blue-700 rounded-[2rem] shadow-xl p-8 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <h1 className="text-4xl font-bold">GALTEX Rewards</h1>
              <p className="text-blue-100 mt-3 text-lg">لوحة تحكم الإدارة</p>
              {adminName && (
                <p className="text-blue-200 mt-2 text-sm">مرحباً، {adminName}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={loadData}
                disabled={isLoading}
                className="bg-white text-blue-800 hover:bg-blue-50 disabled:bg-gray-200 disabled:text-gray-400 px-6 py-3 rounded-2xl font-bold shadow-sm"
              >
                {isLoading ? "جاري التحديث..." : "تحديث البيانات"}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl font-bold shadow-sm transition"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="إجمالي العملاء" value={stats.totalCustomers} />
          <StatCard label="طلبات معلقة" value={stats.pendingRequests} />
          <StatCard label="الميكانيكيين" value={stats.mechanics} />
          <StatCard label="المبيعات / التجار" value={stats.sellers} />
          <StatCard label="إجمالي النقاط" value={stats.totalPoints} dark />
        </section>

        {message && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl font-semibold text-center">
            {message}
          </div>
        )}

        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">الأقسام</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {navCards.map((card) => (
              <button
                key={card.href}
                type="button"
                onClick={() => router.push(card.href)}
                style={{ backgroundColor: card.bg }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = card.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = card.bg)}
                className="text-right rounded-[2rem] p-6 text-white shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-bold">{card.title}</h3>

                  {card.badge && (
                    <span className="bg-white/20 border border-white/30 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      {card.badge}
                    </span>
                  )}
                </div>

                <p className="text-white/80 mt-3 text-sm leading-6">{card.description}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: number;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-3 md:p-5 shadow-sm ${
        dark ? "bg-gradient-to-r from-blue-800 to-blue-950 text-white" : "bg-white text-blue-900"
      }`}
    >
      <p className={`text-xs md:text-sm ${dark ? "text-blue-100" : "text-gray-500"}`}>{label}</p>
      <p className="text-2xl md:text-4xl font-bold mt-1 md:mt-3">{value}</p>
    </div>
  );
}
