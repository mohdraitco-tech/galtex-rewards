"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import * as XLSX from "xlsx";

type QrCodeItem = {
  id: string;
  token: string;
  product_id: string | null;
  product_number: string;
  product_name_ar: string | null;
  product_name_en: string | null;
  product_image_url: string | null;
  points: number;
  status: string;
  seller_used_by: string | null;
  mechanic_used_by: string | null;
  seller_name: string | null;
  mechanic_name: string | null;
  seller_used_at: string | null;
  mechanic_used_at: string | null;
  is_legacy_import: boolean;
  created_at: string;
};

type FilterStatus =
  | "all"
  | "unused"
  | "seller_only"
  | "mechanic_only"
  | "completed";

type QrImportSummary = {
  total: number;
  success: number;
  failed: { product_number: string; token: string; message: string }[];
};

export default function AdminQrCodesPage() {
  const router = useRouter();

  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [items, setItems] = useState<QrCodeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const [isImportingQr, setIsImportingQr] = useState(false);
  const [qrImportSummary, setQrImportSummary] = useState<QrImportSummary | null>(null);
  const [qrImportProgress, setQrImportProgress] = useState({ done: 0, total: 0 });

  const loadQrCodes = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const { data, error } = await supabase.rpc("get_admin_qr_codes");

    if (error) {
      setMessage(error.message || "حدث خطأ أثناء تحميل أكواد QR");
      setIsLoading(false);
      return;
    }

    setItems(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadQrCodes();
  }, [loadQrCodes]);

  // حارس الصلاحيات: يمنع أي حد ما عنده صلاحية "أكواد QR" من فتح الصفحة
  // حتى لو كتب الرابط مباشرة بالمتصفح
  useEffect(() => {
    const role = localStorage.getItem("galtex_admin_role");
    let permitted = role === "admin" || role === "super_admin";

    if (!permitted) {
      try {
        const raw = localStorage.getItem("galtex_admin_permissions");
        const perms = raw ? JSON.parse(raw) : {};
        permitted = Boolean(perms.qr_codes);
      } catch {
        permitted = false;
      }
    }

    if (!permitted) {
      router.replace("/admin");
      return;
    }

    setIsAuthorized(true);
  }, [router]);

  function getQrStatus(item: QrCodeItem): FilterStatus {
    if (item.seller_used_by && item.mechanic_used_by) return "completed";
    if (item.seller_used_by && !item.mechanic_used_by) return "seller_only";
    if (!item.seller_used_by && item.mechanic_used_by) return "mechanic_only";
    return "unused";
  }

  const stats = useMemo(() => {
    return {
      total: items.length,
      unused: items.filter((item) => getQrStatus(item) === "unused").length,
      sellerUsed: items.filter((item) => item.seller_used_by).length,
      mechanicUsed: items.filter((item) => item.mechanic_used_by).length,
      completed: items.filter((item) => getQrStatus(item) === "completed").length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const cleanSearch = searchText.trim().toLowerCase();

    return items.filter((item) => {
      const matchesStatus =
        filterStatus === "all" || getQrStatus(item) === filterStatus;

      const searchableText = [
        item.token,
        item.product_number,
        item.product_name_ar,
        item.product_name_en,
        item.seller_name,
        item.mechanic_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !cleanSearch || searchableText.includes(cleanSearch);

      return matchesStatus && matchesSearch;
    });
  }, [items, searchText, filterStatus]);

  function resetFilters() {
    setSearchText("");
    setFilterStatus("all");
  }

  /* استيراد أكواد QR قديمة من النظام السابق: ملف إكسل بعمودين — "رقم الصنف"
     و"Token" — والباقي (ربط المنتج، النقاط، الحالة) يصير تلقائيًا بقاعدة
     البيانات عبر دالة import_qr_codes_admin.
     مع ملفات كبيرة (عشرات الآلاف من الصفوف) نقسّم الاستيراد لدفعات صغيرة
     بدل إرسال كل شي بطلب واحد ضخم قد يتعدى الوقت المسموح للطلب (timeout). */
  async function handleImportQrExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingQr(true);
    setQrImportSummary(null);
    setQrImportProgress({ done: 0, total: 0 });
    setMessage("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const payload = rows
        .map((row) => ({
          product_number: String(row["رقم الصنف"] ?? row["product_number"] ?? "").trim(),
          token: String(row["Token"] ?? row["التوكن"] ?? row["token"] ?? "").trim(),
        }))
        .filter((r) => r.product_number || r.token);

      if (payload.length === 0) {
        setMessage('الملف فاضي أو أسماء الأعمدة غير مطابقة (المطلوب: "رقم الصنف" و"Token")');
        setIsImportingQr(false);
        event.target.value = "";
        return;
      }

      const BATCH_SIZE = 2000;
      const totalBatches = Math.ceil(payload.length / BATCH_SIZE);
      setQrImportProgress({ done: 0, total: payload.length });

      let totalSuccess = 0;
      const allFailed: { product_number: string; token: string; message: string }[] = [];

      for (let b = 0; b < totalBatches; b++) {
        const batch = payload.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

        const { data, error } = await supabase.rpc("import_qr_codes_admin", {
          p_rows: batch,
        });

        if (error || !data?.success) {
          allFailed.push(
            ...batch.map((r) => ({
              product_number: r.product_number,
              token: r.token,
              message: error?.message || data?.message || "فشل استيراد هذه الدفعة",
            }))
          );
        } else {
          totalSuccess += data.success_count ?? 0;
          allFailed.push(...(data.failed ?? []));
        }

        setQrImportProgress({ done: Math.min((b + 1) * BATCH_SIZE, payload.length), total: payload.length });
      }

      setIsImportingQr(false);
      event.target.value = "";

      setQrImportSummary({
        total: payload.length,
        success: totalSuccess,
        failed: allFailed,
      });

      await loadQrCodes();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر قراءة ملف الإكسل، تأكد من الصيغة");
      setIsImportingQr(false);
      event.target.value = "";
    }
  }

  if (isAuthorized !== true) return null;

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="bg-gradient-to-r from-blue-900 to-blue-700 rounded-[2rem] shadow-xl p-7 md:p-9 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <p className="text-blue-200 font-semibold">GALTEX Rewards</p>

              <h1 className="text-3xl md:text-4xl font-bold mt-2">
                إدارة أكواد QR
              </h1>

              <p className="text-blue-100 mt-3">
                متابعة الأكواد المولدة وحالة استخدامها من المبيعات والميكانيكي
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <label
                className={`px-6 py-3 rounded-2xl font-bold transition cursor-pointer text-center ${
                  isImportingQr
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-purple-500 hover:bg-purple-600 text-white"
                }`}
              >
                {isImportingQr
                  ? `جاري الاستيراد... (${qrImportProgress.done}/${qrImportProgress.total})`
                  : "استيراد أكواد QR قديمة"}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportQrExcel}
                  disabled={isImportingQr}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={loadQrCodes}
                disabled={isLoading}
                className="bg-white text-blue-800 hover:bg-blue-50 disabled:bg-gray-200 disabled:text-gray-400 px-6 py-3 rounded-2xl font-bold transition"
              >
                {isLoading ? "جاري التحديث..." : "تحديث"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin/products")}
                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-6 py-3 rounded-2xl font-bold transition"
              >
                المنتجات
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin")}
                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-6 py-3 rounded-2xl font-bold transition"
              >
                لوحة الإدارة
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <StatCard title="إجمالي الأكواد" value={stats.total} />
          <StatCard title="غير مستخدمة" value={stats.unused} />
          <StatCard title="قرأها المبيعات" value={stats.sellerUsed} />
          <StatCard title="قرأها الميكانيكي" value={stats.mechanicUsed} />
          <StatCard title="مكتملة" value={stats.completed} dark />
        </section>

        {message && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-center font-bold">
            {message}
          </div>
        )}

        {qrImportSummary && (
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
            <p className="font-bold text-purple-900">
              نتيجة استيراد الأكواد القديمة: {qrImportSummary.success} من {qrImportSummary.total} تم استيرادها بنجاح
            </p>

            {qrImportSummary.failed.length > 0 && (
              <div className="mt-3 space-y-1 max-h-56 overflow-y-auto">
                <p className="text-sm font-bold text-red-700">
                  أكواد لم تُستورد ({qrImportSummary.failed.length}):
                </p>
                {qrImportSummary.failed.slice(0, 200).map((f, idx) => (
                  <p key={`${f.token}-${idx}`} className="text-sm text-red-600">
                    رقم الصنف: {f.product_number || "-"} — Token: {f.token || "-"} — {f.message}
                  </p>
                ))}
                {qrImportSummary.failed.length > 200 && (
                  <p className="text-sm font-bold text-red-700">
                    و{qrImportSummary.failed.length - 200} كود آخر لم يظهروا هنا (اعرضهم كلهم بتصدير القائمة لاحقًا لو احتجت)
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setQrImportSummary(null)}
              className="mt-3 text-sm font-bold text-purple-700 hover:underline"
            >
              إغلاق
            </button>
          </div>
        )}

        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              البحث والتصفية
            </h2>

            <p className="text-gray-500 mt-2">
              ابحث بالـ Token أو رقم الصنف أو اسم المنتج أو اسم العميل
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                البحث
              </label>

              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="اكتب Token أو رقم الصنف أو اسم المنتج"
                className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                الحالة
              </label>

              <select
                value={filterStatus}
                onChange={(event) =>
                  setFilterStatus(event.target.value as FilterStatus)
                }
                className="w-full border border-gray-300 rounded-2xl px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">كل الحالات</option>
                <option value="unused">غير مستخدم</option>
                <option value="seller_only">مبيعات فقط</option>
                <option value="mechanic_only">ميكانيكي فقط</option>
                <option value="completed">مكتمل</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-5">
            <p className="text-gray-500">
              النتائج الظاهرة:{" "}
              <span className="font-bold text-blue-900">
                {filteredItems.length}
              </span>{" "}
              من أصل{" "}
              <span className="font-bold text-blue-900">{items.length}</span>
            </p>

            <button
              type="button"
              onClick={resetFilters}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-2xl font-bold transition"
            >
              مسح الفلاتر
            </button>
          </div>
        </section>

        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              قائمة أكواد QR
            </h2>
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-gray-500">
              جاري تحميل أكواد QR...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="mt-7 bg-slate-50 rounded-3xl p-12 text-center text-gray-500">
              لا توجد نتائج مطابقة
            </div>
          ) : (
            <div className="overflow-x-auto mt-7">
              <table className="w-full text-right border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-blue-900 text-sm">
                    <th className="px-4">المنتج</th>
                    <th className="px-4">رقم الصنف</th>
                    <th className="px-4">Token</th>
                    <th className="px-4">المصدر</th>
                    <th className="px-4">النقاط</th>
                    <th className="px-4">المبيعات</th>
                    <th className="px-4">الميكانيكي</th>
                    <th className="px-4">الحالة</th>
                    <th className="px-4">تاريخ الإنشاء</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className={`transition ${
                        item.is_legacy_import
                          ? "bg-amber-50 hover:bg-amber-100"
                          : "bg-slate-50 hover:bg-blue-50"
                      }`}
                    >
                      <td className="p-4 rounded-r-2xl">
                        <div className="flex items-center gap-3">
                          {item.product_image_url ? (
                            <div className="w-14 h-14 bg-white border border-slate-200 rounded-xl overflow-hidden">
                              <img
                                src={item.product_image_url}
                                alt={item.product_name_ar || item.token}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center text-xs text-gray-400">
                              صورة
                            </div>
                          )}

                          <div>
                            <p className="font-bold text-gray-900">
                              {item.product_name_ar || "منتج"}
                            </p>

                            <p className="text-sm text-gray-500" dir="ltr">
                              {item.product_name_en || "-"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 font-bold text-blue-900">
                        {item.product_number || "-"}
                      </td>

                      <td className="p-4">
                        <span className="bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2 font-mono text-sm">
                          {item.token}
                        </span>
                      </td>

                      <td className="p-4">
                        {item.is_legacy_import ? (
                          <span className="bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                            من النظام القديم
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                            جديد
                          </span>
                        )}
                      </td>

                      <td className="p-4 font-bold text-blue-900">
                        {item.points}
                      </td>

                      <td className="p-4">
                        {item.seller_name ? (
                          <UsageBadge
                            label={item.seller_name}
                            date={item.seller_used_at}
                            color="yellow"
                          />
                        ) : (
                          <span className="text-gray-400">لم يستخدم</span>
                        )}
                      </td>

                      <td className="p-4">
                        {item.mechanic_name ? (
                          <UsageBadge
                            label={item.mechanic_name}
                            date={item.mechanic_used_at}
                            color="blue"
                          />
                        ) : (
                          <span className="text-gray-400">لم يستخدم</span>
                        )}
                      </td>

                      <td className="p-4">
                        <QrStatus item={item} />
                      </td>

                      <td className="p-4 rounded-l-2xl text-gray-500">
                        {new Date(item.created_at).toLocaleDateString("ar-SA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  dark = false,
}: {
  title: string;
  value: number;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl p-5 shadow-sm ${
        dark
          ? "bg-gradient-to-r from-blue-800 to-blue-950 text-white"
          : "bg-white text-blue-900"
      }`}
    >
      <p className={dark ? "text-blue-100" : "text-gray-500"}>{title}</p>
      <p className="text-4xl font-bold mt-3">{value}</p>
    </div>
  );
}

function UsageBadge({
  label,
  date,
  color,
}: {
  label: string;
  date: string | null;
  color: "blue" | "yellow";
}) {
  const colorClasses =
    color === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-100"
      : "bg-yellow-50 text-yellow-700 border-yellow-100";

  return (
    <div
      className={`border rounded-2xl px-3 py-2 text-sm font-bold ${colorClasses}`}
    >
      <p>{label}</p>

      {date && (
        <p className="text-xs opacity-70 mt-1">
          {new Date(date).toLocaleDateString("ar-SA")}
        </p>
      )}
    </div>
  );
}

function QrStatus({ item }: { item: QrCodeItem }) {
  if (item.seller_used_by && item.mechanic_used_by) {
    return (
      <span className="bg-green-50 text-green-700 border border-green-100 px-3 py-1 rounded-full text-sm font-bold">
        مكتمل
      </span>
    );
  }

  if (item.seller_used_by && !item.mechanic_used_by) {
    return (
      <span className="bg-yellow-50 text-yellow-700 border border-yellow-100 px-3 py-1 rounded-full text-sm font-bold">
        مبيعات فقط
      </span>
    );
  }

  if (!item.seller_used_by && item.mechanic_used_by) {
    return (
      <span className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-sm font-bold">
        ميكانيكي فقط
      </span>
    );
  }

  return (
    <span className="bg-slate-50 text-slate-600 border border-slate-100 px-3 py-1 rounded-full text-sm font-bold">
      غير مستخدم
    </span>
  );
}
