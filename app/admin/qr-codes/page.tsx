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
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: "#F5F2EC", color: "#0E2C5C", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== HEADER ===== */}
      <header style={{ background: "rgba(245,242,236,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(18,44,92,0.08)", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 32, width: "auto", display: "block" }} />
            <span style={{ width: 1, height: 26, background: "rgba(18,44,92,0.15)" }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#C4952E" }}>الإدارة</span>
          </div>
          <button type="button" onClick={() => router.push("/admin")} style={{ background: "none", border: "none", color: "#16407F", fontFamily: "inherit", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>‹ لوحة التحكم</button>
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "34px 28px 60px" }}>

        {/* العنوان + أزرار */}
        <div className="gx-titlerow" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 26 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <span style={{ width: 13, height: 13, background: "#C4952E", display: "inline-block", transform: "rotate(45deg)" }} />
              <h1 style={{ fontSize: "clamp(24px,2.6vw,32px)", fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#0E2C5C" }}>إدارة أكواد QR</h1>
            </div>
            <p style={{ fontSize: 15.5, color: "#586377", margin: 0 }}>متابعة الأكواد المولدة وحالة استخدامها من المبيعات والميكانيكي</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ cursor: isImportingQr ? "not-allowed" : "pointer", borderRadius: 12, background: isImportingQr ? "#9AA3B5" : "rgba(196,149,46,0.16)", color: isImportingQr ? "#fff" : "#8F6819", border: isImportingQr ? "none" : "1px solid rgba(196,149,46,0.35)", padding: "11px 20px", fontFamily: "inherit", fontWeight: 700, fontSize: 14, textAlign: "center" }}>
              {isImportingQr ? `جاري الاستيراد... (${qrImportProgress.done}/${qrImportProgress.total})` : "استيراد أكواد QR قديمة"}
              <input type="file" accept=".xlsx,.xls" onChange={handleImportQrExcel} disabled={isImportingQr} style={{ display: "none" }} />
            </label>
            <button type="button" onClick={loadQrCodes} disabled={isLoading} style={{ background: isLoading ? "#9AA3B5" : "#FFFDF8", border: isLoading ? "none" : "1px solid rgba(18,44,92,0.15)", color: isLoading ? "#fff" : "#16407F", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px 22px", borderRadius: 12, cursor: isLoading ? "not-allowed" : "pointer" }}>
              {isLoading ? "جاري التحديث..." : "تحديث"}
            </button>
            <button type="button" onClick={() => router.push("/admin/products")} style={{ background: "rgba(22,64,127,0.08)", border: "1px solid #dfe6f2", color: "#16407F", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px 22px", borderRadius: 12, cursor: "pointer" }}>
              المنتجات
            </button>
          </div>
        </div>

        {/* الإحصائيات (5) */}
        <div className="gx-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 26 }}>
          <StatCard title="مكتملة" value={stats.completed} dark />
          <StatCard title="قرأها الميكانيكي" value={stats.mechanicUsed} />
          <StatCard title="قرأها المبيعات" value={stats.sellerUsed} />
          <StatCard title="غير مستخدمة" value={stats.unused} />
          <StatCard title="إجمالي الأكواد" value={stats.total} />
        </div>

        {message && (
          <div style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", color: "#C0392B", borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 700, marginBottom: 22 }}>
            {message}
          </div>
        )}

        {qrImportSummary && (
          <div style={{ background: "rgba(196,149,46,0.08)", border: "1px solid rgba(196,149,46,0.3)", borderRadius: 16, padding: 20, marginBottom: 22 }}>
            <p style={{ fontWeight: 700, color: "#8F6819", margin: 0 }}>
              نتيجة استيراد الأكواد القديمة: {qrImportSummary.success} من {qrImportSummary.total} تم استيرادها بنجاح
            </p>
            {qrImportSummary.failed.length > 0 && (
              <div style={{ marginTop: 12, maxHeight: 224, overflowY: "auto" }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: "#C0392B", margin: "0 0 4px" }}>أكواد لم تُستورد ({qrImportSummary.failed.length}):</p>
                {qrImportSummary.failed.slice(0, 200).map((f, idx) => (
                  <p key={`${f.token}-${idx}`} style={{ fontSize: 13.5, color: "#C0392B", margin: 0 }}>رقم الصنف: {f.product_number || "-"} — Token: {f.token || "-"} — {f.message}</p>
                ))}
                {qrImportSummary.failed.length > 200 && (
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "#C0392B", margin: 0 }}>و{qrImportSummary.failed.length - 200} كود آخر لم يظهروا هنا (اعرضهم كلهم بتصدير القائمة لاحقًا لو احتجت)</p>
                )}
              </div>
            )}
            <button type="button" onClick={() => setQrImportSummary(null)} style={{ marginTop: 12, background: "none", border: "none", fontSize: 13.5, fontWeight: 700, color: "#8F6819", cursor: "pointer" }}>إغلاق</button>
          </div>
        )}

        {/* البحث والتصفية */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "26px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: "#0E2C5C" }}>البحث والتصفية</h2>
          <p style={{ fontSize: 14.5, color: "#586377", margin: "4px 0 0" }}>ابحث بالـ Token أو رقم الصنف أو اسم المنتج أو اسم العميل</p>

          <div className="gx-search" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>البحث</label>
              <input type="text" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="اكتب Token أو رقم الصنف أو اسم المنتج" className="gx-in" style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>الحالة</label>
              <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as FilterStatus)} className="gx-in" style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C" }}>
                <option value="all">كل الحالات</option>
                <option value="unused">غير مستخدم</option>
                <option value="seller_only">مبيعات فقط</option>
                <option value="mechanic_only">ميكانيكي فقط</option>
                <option value="completed">مكتمل</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
            <p style={{ color: "#586377", margin: 0 }}>
              النتائج الظاهرة:{" "}<span style={{ fontWeight: 700, color: "#16407F" }}>{filteredItems.length}</span>{" "}من أصل{" "}<span style={{ fontWeight: 700, color: "#16407F" }}>{items.length}</span>
            </p>
            <button type="button" onClick={resetFilters} style={{ background: "rgba(18,44,92,0.06)", color: "#586377", border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, padding: "10px 20px", borderRadius: 11, cursor: "pointer" }}>مسح الفلاتر</button>
          </div>
        </section>

        {/* قائمة أكواد QR */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "26px" }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: "#0E2C5C" }}>قائمة أكواد QR</h2>

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "64px 0", color: "#7A8498" }}>جاري تحميل أكواد QR...</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ marginTop: 26, background: "rgba(18,44,92,0.03)", borderRadius: 18, padding: 48, textAlign: "center", color: "#7A8498" }}>لا توجد نتائج مطابقة</div>
          ) : (
            <div className="gx-tablewrap" style={{ overflowX: "auto", marginTop: 26 }}>
              <table style={{ width: "100%", textAlign: "right", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#586377", fontSize: 13, background: "rgba(18,44,92,0.04)" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>المنتج</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>رقم الصنف</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>Token</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>المصدر</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>النقاط</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>المبيعات</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>الميكانيكي</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>الحالة</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>تاريخ الإنشاء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="gx-row" style={{ background: item.is_legacy_import ? "#FBF3DC" : "#FFFFFF" }}>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {item.product_image_url ? (
                            <div style={{ width: 52, height: 52, background: "#fff", border: "1px solid rgba(18,44,92,0.12)", borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
                              <img src={item.product_image_url} alt={item.product_name_ar || item.token} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            </div>
                          ) : (
                            <div style={{ width: 52, height: 52, background: "rgba(18,44,92,0.06)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#9AA3B5", flexShrink: 0 }}>صورة</div>
                          )}
                          <div>
                            <p style={{ fontWeight: 700, color: "#0E2C5C", margin: 0 }}>{item.product_name_ar || "منتج"}</p>
                            <p style={{ fontSize: 13, color: "#7A8498", margin: "2px 0 0" }} dir="ltr">{item.product_name_en || "-"}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", fontWeight: 700, color: "#16407F" }}>{item.product_number || "-"}</td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                        <span style={{ background: "#fff", border: "1px solid rgba(18,44,92,0.14)", color: "#586377", borderRadius: 10, padding: "6px 12px", fontFamily: "'Space Grotesk',monospace", fontSize: 13 }}>{item.token}</span>
                      </td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center" }}>
                        {item.is_legacy_import ? (
                          <span style={{ background: "rgba(196,149,46,0.16)", color: "#8F6819", border: "1px solid rgba(196,149,46,0.35)", padding: "3px 10px", borderRadius: 100, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>من النظام القديم</span>
                        ) : (
                          <span style={{ background: "rgba(18,44,92,0.06)", color: "#7A8498", border: "1px solid rgba(18,44,92,0.12)", padding: "3px 10px", borderRadius: 100, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>جديد</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center", fontWeight: 700, color: "#16407F" }}>{item.points}</td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                        {item.seller_name ? (
                          <UsageBadge label={item.seller_name} date={item.seller_used_at} color="yellow" />
                        ) : (
                          <span style={{ color: "#9AA3B5" }}>لم يستخدم</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                        {item.mechanic_name ? (
                          <UsageBadge label={item.mechanic_name} date={item.mechanic_used_at} color="blue" />
                        ) : (
                          <span style={{ color: "#9AA3B5" }}>لم يستخدم</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center" }}><QrStatus item={item} /></td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center", color: "#7A8498" }}>{new Date(item.created_at).toLocaleDateString("ar-SA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <style>{`
        .gx-in:focus { outline: none; border-color: #16407F; box-shadow: 0 0 0 3px rgba(22,64,127,0.12); }
        .gx-in::placeholder { color: #9AA3B5; }
        .gx-row:hover { filter: brightness(0.98); }
        @media (max-width:980px){
          .gx-kpis { grid-template-columns:1fr 1fr 1fr !important; }
          .gx-search { grid-template-columns:1fr !important; }
          .gx-titlerow { flex-direction:column; }
        }
      `}</style>
    </div>
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
    <div style={{ borderRadius: 18, padding: "20px 22px", background: dark ? "linear-gradient(140deg,#16407F,#0E2C5C)" : "#FFFDF8", border: dark ? "none" : "1px solid rgba(18,44,92,0.1)" }}>
      <p style={{ fontSize: 13, color: dark ? "#C6D2EA" : "#7A8498", margin: 0 }}>{title}</p>
      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 34, lineHeight: 1, margin: "10px 0 0", color: dark ? "#F5F2EC" : "#0E2C5C" }}>{value}</p>
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
  const tone =
    color === "blue"
      ? { bg: "rgba(22,64,127,0.08)", color: "#16407F", border: "#dfe6f2" }
      : { bg: "rgba(196,149,46,0.16)", color: "#8F6819", border: "rgba(196,149,46,0.35)" };

  return (
    <div style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`, borderRadius: 12, padding: "8px 12px", fontSize: 13.5, fontWeight: 700 }}>
      <p style={{ margin: 0 }}>{label}</p>
      {date && (
        <p style={{ fontSize: 11.5, opacity: 0.7, margin: "3px 0 0" }}>{new Date(date).toLocaleDateString("ar-SA")}</p>
      )}
    </div>
  );
}

function QrStatus({ item }: { item: QrCodeItem }) {
  const badge = (bg: string, color: string, border: string, label: string) => (
    <span style={{ background: bg, color, border: `1px solid ${border}`, padding: "4px 12px", borderRadius: 100, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>
  );

  if (item.seller_used_by && item.mechanic_used_by) {
    return badge("rgba(31,138,91,0.1)", "#1F8A5B", "rgba(31,138,91,0.3)", "مكتمل");
  }
  if (item.seller_used_by && !item.mechanic_used_by) {
    return badge("rgba(196,149,46,0.16)", "#8F6819", "rgba(196,149,46,0.35)", "مبيعات فقط");
  }
  if (!item.seller_used_by && item.mechanic_used_by) {
    return badge("rgba(22,64,127,0.08)", "#16407F", "#dfe6f2", "ميكانيكي فقط");
  }
  return badge("rgba(18,44,92,0.05)", "#586377", "rgba(18,44,92,0.12)", "غير مستخدم");
}