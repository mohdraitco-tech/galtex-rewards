"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type PendingCustomer = {
  id: string;
  first_name: string;
  last_name: string;
  city: string;
  country: string;
  phone_international: string;
  username: string;
  created_at: string;
};

type PendingPasswordReset = {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  username: string;
  customer_number: string | null;
  customer_type: string | null;
  created_at: string;
};

type PendingDeviceTransfer = {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  username: string;
  customer_number: string | null;
  customer_type: string | null;
  new_device_id: string;
  created_at: string;
};

type AdminCustomer = {
  id: string;
  customer_number: string | null;
  first_name: string;
  last_name: string;
  username: string;
  customer_type: string | null;
  current_points: number;
  status: string;
  created_at: string;
};

type RedemptionItem = {
  id: string;
  redemption_type: string;
  points: number;
  points_before: number;
  points_after: number;
  note: string | null;
  admin_name: string | null;
  created_at: string;
};

type StatementItem = {
  id: string;
  product_number: string;
  product_name_ar: string | null;
  product_name_en: string | null;
  product_image_url: string | null;
  points: number;
  status: "released" | "pending";
  status_label: string;
  created_at: string;
};

type FilterStatus = "all" | "active" | "pending" | "suspended";

type RedeemType = "cash" | "gift" | "deduct" | "reset";

type RedeemModalState = {
  customer: AdminCustomer;
  type: RedeemType;
  points: string;
  note: string;
};

export default function AdminCustomersPage() {
  const router = useRouter();

  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [pendingCustomers, setPendingCustomers] = useState<PendingCustomer[]>([]);
  const [pendingPasswordResets, setPendingPasswordResets] = useState<PendingPasswordReset[]>([]);
  const [pendingDeviceTransfers, setPendingDeviceTransfers] = useState<PendingDeviceTransfer[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [customerTypes, setCustomerTypes] = useState<Record<string, string>>({});

  const [processingPendingId, setProcessingPendingId] = useState<string | null>(null);
  const [processingResetId, setProcessingResetId] = useState<string | null>(null);
  const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const [redeemModal, setRedeemModal] = useState<RedeemModalState | null>(null);
  const [isSubmittingRedeem, setIsSubmittingRedeem] = useState(false);

  const [historyCustomer, setHistoryCustomer] = useState<AdminCustomer | null>(null);
  const [historyItems, setHistoryItems] = useState<RedemptionItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [statementCustomer, setStatementCustomer] = useState<AdminCustomer | null>(null);
  const [statementItems, setStatementItems] = useState<StatementItem[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);

  const [processingId, setProcessingId] = useState<string | null>(null);

  function getAdminId() {
    return typeof window !== "undefined" ? localStorage.getItem("galtex_admin_id") : null;
  }

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setMessage("");
    setMessageType("");

    const [pendingResult, resetsResult, transfersResult, customersResult] = await Promise.all([
      supabase.rpc("get_pending_customers"),
      supabase.rpc("get_pending_password_resets"),
      supabase.rpc("get_pending_device_transfers"),
      supabase.rpc("get_admin_customers"),
    ]);

    if (pendingResult.error) {
      setMessage(pendingResult.error.message || "حدث خطأ أثناء تحميل طلبات التسجيل");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    if (customersResult.error) {
      setMessage(customersResult.error.message || "حدث خطأ أثناء تحميل العملاء");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    setPendingCustomers(pendingResult.data || []);
    setPendingPasswordResets(resetsResult.data || []);
    setPendingDeviceTransfers(transfersResult.data || []);
    setCustomers(customersResult.data || []);

    const initialTypes: Record<string, string> = {};
    (pendingResult.data || []).forEach((customer: PendingCustomer) => {
      initialTypes[customer.id] = "";
    });
    setCustomerTypes(initialTypes);

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // حارس الصلاحيات: يمنع أي حد ما عنده صلاحية "إدارة العملاء" من فتح
  // الصفحة حتى لو كتب الرابط مباشرة بالمتصفح
  useEffect(() => {
    const role = localStorage.getItem("galtex_admin_role");
    let permitted = role === "admin" || role === "super_admin";

    if (!permitted) {
      try {
        const raw = localStorage.getItem("galtex_admin_permissions");
        const perms = raw ? JSON.parse(raw) : {};
        permitted = Boolean(perms.customers);
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

  // ============== طلبات التسجيل المعلقة ==============
  async function approveCustomer(customerId: string) {
    setMessage("");

    const selectedType = customerTypes[customerId];

    if (!selectedType) {
      setMessage("يرجى اختيار نوع العميل قبل الموافقة");
      setMessageType("error");
      return;
    }

    setProcessingPendingId(customerId);

    const { data, error } = await supabase.rpc("approve_customer", {
      p_customer_id: customerId,
      p_customer_type: selectedType,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء تفعيل العميل");
      setMessageType("error");
      setProcessingPendingId(null);
      return;
    }

    const customerTypeName = selectedType === "mechanic" ? "ميكانيكي" : "مبيعات / تاجر";

    setMessage(`تم تفعيل العميل بنجاح كـ ${customerTypeName} - رقم العميل الداخلي: ${data.customer_number}`);
    setMessageType("success");
    setProcessingPendingId(null);
    await loadAll();
  }

  async function rejectCustomer(customerId: string) {
    setMessage("");
    setProcessingPendingId(customerId);

    const { data, error } = await supabase.rpc("reject_customer", {
      p_customer_id: customerId,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء رفض العميل");
      setMessageType("error");
      setProcessingPendingId(null);
      return;
    }

    setMessage(data.message || "تم رفض طلب العميل");
    setMessageType("success");
    setProcessingPendingId(null);
    await loadAll();
  }

  // ============== طلبات إعادة تعيين كلمة المرور ==============
  async function approvePasswordReset(requestId: string) {
    const adminId = getAdminId();

    if (!adminId) {
      setMessage("تعذر التعرف على حساب الإدارة، يرجى تسجيل الدخول من جديد");
      setMessageType("error");
      return;
    }

    setProcessingResetId(requestId);
    setMessage("");

    const { data, error } = await supabase.rpc("approve_password_reset", {
      p_request_id: requestId,
      p_admin_id: adminId,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء الموافقة على الطلب");
      setMessageType("error");
      setProcessingResetId(null);
      return;
    }

    setMessage(data.message);
    setMessageType("success");
    setProcessingResetId(null);
    await loadAll();
  }

  async function rejectPasswordReset(requestId: string) {
    const adminId = getAdminId();

    if (!adminId) {
      setMessage("تعذر التعرف على حساب الإدارة، يرجى تسجيل الدخول من جديد");
      setMessageType("error");
      return;
    }

    setProcessingResetId(requestId);
    setMessage("");

    const { data, error } = await supabase.rpc("reject_password_reset", {
      p_request_id: requestId,
      p_admin_id: adminId,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء رفض الطلب");
      setMessageType("error");
      setProcessingResetId(null);
      return;
    }

    setMessage(data.message);
    setMessageType("success");
    setProcessingResetId(null);
    await loadAll();
  }

  // ============== طلبات نقل الجهاز ==============
  async function approveDeviceTransfer(requestId: string) {
    const adminId = getAdminId();

    if (!adminId) {
      setMessage("تعذر التعرف على حساب الإدارة، يرجى تسجيل الدخول من جديد");
      setMessageType("error");
      return;
    }

    setProcessingTransferId(requestId);
    setMessage("");

    const { data, error } = await supabase.rpc("approve_device_transfer", {
      p_request_id: requestId,
      p_admin_id: adminId,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء الموافقة على الطلب");
      setMessageType("error");
      setProcessingTransferId(null);
      return;
    }

    setMessage(data.message);
    setMessageType("success");
    setProcessingTransferId(null);
    await loadAll();
  }

  async function rejectDeviceTransfer(requestId: string) {
    const adminId = getAdminId();

    if (!adminId) {
      setMessage("تعذر التعرف على حساب الإدارة، يرجى تسجيل الدخول من جديد");
      setMessageType("error");
      return;
    }

    setProcessingTransferId(requestId);
    setMessage("");

    const { data, error } = await supabase.rpc("reject_device_transfer", {
      p_request_id: requestId,
      p_admin_id: adminId,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء رفض الطلب");
      setMessageType("error");
      setProcessingTransferId(null);
      return;
    }

    setMessage(data.message);
    setMessageType("success");
    setProcessingTransferId(null);
    await loadAll();
  }

  // ============== إحصائيات وتصفية جدول العملاء ==============
  const stats = useMemo(() => {
    return {
      total: customers.length,
      active: customers.filter((c) => c.status === "active").length,
      suspended: customers.filter((c) => c.status === "suspended").length,
      totalPoints: customers.reduce((sum, c) => sum + Number(c.current_points || 0), 0),
    };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return customers.filter((c) => {
      const matchesStatus = filterStatus === "all" || c.status === filterStatus;

      const searchable = [c.first_name, c.last_name, c.username, c.customer_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !q || searchable.includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [customers, search, filterStatus]);

  // ============== صرف النقاط ==============
  function openRedeemModal(customer: AdminCustomer) {
    setRedeemModal({ customer, type: "cash", points: "", note: "" });
  }

  async function submitRedeem() {
    if (!redeemModal) return;

    const adminId = getAdminId();

    if (!adminId) {
      setMessage("تعذر التعرف على حساب الإدارة، يرجى تسجيل الدخول من جديد");
      setMessageType("error");
      return;
    }

    const pointsValue = redeemModal.type === "reset" ? 0 : Number(redeemModal.points);

    if (redeemModal.type !== "reset" && (!pointsValue || pointsValue <= 0)) {
      setMessage("يرجى إدخال عدد نقاط صحيح");
      setMessageType("error");
      return;
    }

    setIsSubmittingRedeem(true);

    const { data, error } = await supabase.rpc("redeem_points", {
      p_customer_id: redeemModal.customer.id,
      p_admin_id: adminId,
      p_type: redeemModal.type,
      p_points: pointsValue,
      p_note: redeemModal.note.trim() || null,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء تنفيذ عملية الصرف");
      setMessageType("error");
      setIsSubmittingRedeem(false);
      return;
    }

    setMessage(`تم تنفيذ العملية بنجاح — الرصيد الجديد: ${data.points_after} نقطة`);
    setMessageType("success");
    setIsSubmittingRedeem(false);
    setRedeemModal(null);
    await loadAll();
  }

  // ============== إيقاف / تفعيل ==============
  async function toggleSuspend(customer: AdminCustomer) {
    setProcessingId(customer.id);
    setMessage("");

    const rpcName = customer.status === "active" ? "suspend_customer" : "reactivate_customer";

    const { data, error } = await supabase.rpc(rpcName, {
      p_customer_id: customer.id,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء تنفيذ العملية");
      setMessageType("error");
      setProcessingId(null);
      return;
    }

    setMessage(data.message);
    setMessageType("success");
    setProcessingId(null);
    await loadAll();
  }

  // ============== سجل الصرف ==============
  async function openHistory(customer: AdminCustomer) {
    setHistoryCustomer(customer);
    setIsLoadingHistory(true);
    setHistoryItems([]);

    const { data, error } = await supabase.rpc("get_customer_redemptions", {
      p_customer_id: customer.id,
    });

    if (error) {
      setIsLoadingHistory(false);
      return;
    }

    setHistoryItems(data || []);
    setIsLoadingHistory(false);
  }

  // ============== كشف الحساب ==============
  async function openStatement(customer: AdminCustomer) {
    setStatementCustomer(customer);
    setIsLoadingStatement(true);
    setStatementItems([]);

    const { data, error } = await supabase.rpc("get_customer_statement", {
      p_customer_id: customer.id,
    });

    if (error) {
      setIsLoadingStatement(false);
      return;
    }

    setStatementItems(data || []);
    setIsLoadingStatement(false);
  }

  if (isAuthorized !== true) return null;
  const star =
    "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";

  if (isAuthorized === null) {
    return (
      <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: "#F5F2EC", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#586377" }}>
        جاري التحقق من الصلاحية...
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: "#F5F2EC", color: "#0E2C5C", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== HEADER (خفيف على بيج) ===== */}
      <header style={{ background: "rgba(245,242,236,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(18,44,92,0.08)", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 32, width: "auto", display: "block" }} />
            <span style={{ width: 1, height: 26, background: "rgba(18,44,92,0.15)" }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#C4952E" }}>الإدارة</span>
          </div>
          <button type="button" onClick={() => router.push("/admin")} style={{ background: "none", border: "none", color: "#16407F", fontFamily: "inherit", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>‹ لوحة التحكم</button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "34px 28px 60px" }}>

        {/* عنوان + أزرار */}
        <div className="gx-titlerow" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 26 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ width: 12, height: 12, background: "#C4952E", display: "inline-block", clipPath: star }} />
              <h1 style={{ fontSize: "clamp(24px,2.6vw,32px)", fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#0E2C5C" }}>إدارة العملاء والنقاط</h1>
            </div>
            <p style={{ fontSize: 15.5, color: "#586377", margin: 0 }}>طلبات التسجيل، صرف النقاط، وإيقاف وتفعيل الحسابات</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={loadAll} disabled={isLoading} style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.15)", color: "#16407F", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px 22px", borderRadius: 12, cursor: isLoading ? "not-allowed" : "pointer" }}>
              {isLoading ? "جاري التحديث..." : "تحديث"}
            </button>
            <button type="button" onClick={() => router.push("/admin/settings")} style={{ background: "#C4952E", border: "none", color: "#0E2C5C", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px 22px", borderRadius: 12, cursor: "pointer" }}>
              إعدادات نسب توزيع النقاط
            </button>
          </div>
        </div>

        {/* الإحصائيات */}
        <div className="gx-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 26 }}>
          <StatCard title="إجمالي النقاط" value={stats.totalPoints} dark />
          <StatCard title="موقوفين" value={stats.suspended} tone="red" />
          <StatCard title="مفعّلين" value={stats.active} tone="green" />
          <StatCard title="إجمالي العملاء" value={stats.total} />
        </div>

        {message && (
          <div style={{ borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 700, marginBottom: 22, background: messageType === "success" ? "rgba(31,138,91,0.1)" : "rgba(192,57,43,0.08)", border: messageType === "success" ? "1px solid rgba(31,138,91,0.3)" : "1px solid rgba(192,57,43,0.25)", color: messageType === "success" ? "#1F8A5B" : "#C0392B" }}>
            {message}
          </div>
        )}

        {/* ============== طلبات التسجيل المعلقة ============== */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "24px 26px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px", color: "#0E2C5C" }}>طلبات التسجيل المعلّقة</h2>
          <p style={{ fontSize: 14.5, color: "#586377", margin: 0 }}>راجع الطلبات الجديدة واختر نوع العميل قبل الموافقة</p>

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#7A8498", background: "rgba(18,44,92,0.03)", borderRadius: 16, marginTop: 18 }}>جاري تحميل الطلبات...</div>
          ) : pendingCustomers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#7A8498", background: "rgba(18,44,92,0.03)", borderRadius: 16, marginTop: 18 }}>لا توجد طلبات تسجيل معلقة</div>
          ) : (
            <div className="gx-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 22 }}>
              {pendingCustomers.map((customer) => {
                const isProcessing = processingPendingId === customer.id;
                return (
                  <div key={customer.id} style={{ border: "1px solid rgba(18,44,92,0.1)", borderRadius: 18, padding: 20, background: "#F5F2EC" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                      <div>
                        <p style={{ fontSize: 19, fontWeight: 700, color: "#0E2C5C", margin: 0 }}>{customer.first_name} {customer.last_name}</p>
                        <p style={{ color: "#586377", margin: "4px 0 0" }} dir="ltr">{customer.username}</p>
                      </div>
                      <span style={{ background: "#FBF3DC", color: "#8F6819", border: "1px solid #e8d9a8", borderRadius: 100, padding: "5px 14px", fontSize: 13, fontWeight: 700 }}>معلق</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
                      <InfoBox label="المدينة" value={customer.city} />
                      <InfoBox label="الدولة" value={customer.country} />
                      <InfoBox label="الجوال" value={customer.phone_international} ltr />
                      <InfoBox label="تاريخ الطلب" value={new Date(customer.created_at).toLocaleDateString("ar-SA")} />
                    </div>
                    <div style={{ marginTop: 18 }}>
                      <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>نوع العميل</label>
                      <select
                        value={customerTypes[customer.id] || ""}
                        onChange={(event) => {
                          setCustomerTypes((previous) => ({ ...previous, [customer.id]: event.target.value }));
                          setMessage("");
                        }}
                        disabled={isProcessing}
                        className="gx-in"
                        style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C" }}
                      >
                        <option value="">اختر نوع العميل</option>
                        <option value="mechanic">ميكانيكي</option>
                        <option value="seller">مبيعات / تاجر</option>
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
                      <button type="button" onClick={() => approveCustomer(customer.id)} disabled={isProcessing} style={{ background: isProcessing ? "#9AA3B5" : "#1F8A5B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14.5, padding: "12px", border: "none", borderRadius: 12, cursor: isProcessing ? "not-allowed" : "pointer" }}>
                        {isProcessing ? "جاري التنفيذ..." : "موافقة"}
                      </button>
                      <button type="button" onClick={() => rejectCustomer(customer.id)} disabled={isProcessing} style={{ background: isProcessing ? "#9AA3B5" : "#C0392B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14.5, padding: "12px", border: "none", borderRadius: 12, cursor: isProcessing ? "not-allowed" : "pointer" }}>
                        رفض
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ============== طلبات إعادة تعيين كلمة المرور ============== */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "24px 26px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px", color: "#0E2C5C" }}>طلبات إعادة تعيين كلمة المرور</h2>
          <p style={{ fontSize: 14.5, color: "#586377", margin: 0 }}>العملاء اللي طلبوا استعادة كلمة المرور من صفحة &quot;نسيت كلمة المرور&quot;</p>

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#7A8498", background: "rgba(18,44,92,0.03)", borderRadius: 16, marginTop: 18 }}>جاري التحميل...</div>
          ) : pendingPasswordResets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#7A8498", background: "rgba(18,44,92,0.03)", borderRadius: 16, marginTop: 18 }}>لا توجد طلبات إعادة تعيين معلقة</div>
          ) : (
            <div className="gx-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 22 }}>
              {pendingPasswordResets.map((request) => {
                const isProcessing = processingResetId === request.id;
                const typeLabel = request.customer_type === "seller" ? "مبيعات / تاجر" : request.customer_type === "mechanic" ? "ميكانيكي" : "-";
                return (
                  <div key={request.id} style={{ border: "1px solid rgba(18,44,92,0.1)", borderRadius: 18, padding: 20, background: "#F5F2EC" }}>
                    <p style={{ fontSize: 17, fontWeight: 700, color: "#0E2C5C", margin: 0 }}>{request.first_name} {request.last_name}</p>
                    <p style={{ color: "#586377", margin: "4px 0 0" }} dir="ltr">{request.username}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {request.customer_number && (
                        <span style={{ background: "#FFFFFF", border: "1px solid rgba(18,44,92,0.12)", color: "#586377", borderRadius: 100, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>رقم العميل: {request.customer_number}</span>
                      )}
                      <span style={{ background: "#F5F2EC", color: "#16407F", border: "1px solid #dfe6f2", borderRadius: 100, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>{typeLabel}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#7A8498", margin: "10px 0 0" }}>{new Date(request.created_at).toLocaleString("ar-SA")}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                      <button type="button" onClick={() => approvePasswordReset(request.id)} disabled={isProcessing} style={{ background: isProcessing ? "#9AA3B5" : "#1F8A5B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px", border: "none", borderRadius: 12, cursor: isProcessing ? "not-allowed" : "pointer" }}>
                        {isProcessing ? "جاري..." : "موافقة"}
                      </button>
                      <button type="button" onClick={() => rejectPasswordReset(request.id)} disabled={isProcessing} style={{ background: isProcessing ? "#9AA3B5" : "#C0392B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px", border: "none", borderRadius: 12, cursor: isProcessing ? "not-allowed" : "pointer" }}>
                        رفض
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ============== طلبات نقل الجهاز ============== */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "24px 26px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px", color: "#0E2C5C" }}>طلبات نقل الجهاز</h2>
          <p style={{ fontSize: 14.5, color: "#586377", margin: 0 }}>العملاء اللي حاولوا الدخول من جهاز جديد غير الجهاز المسجل عليه حسابهم</p>

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#7A8498", background: "rgba(18,44,92,0.03)", borderRadius: 16, marginTop: 18 }}>جاري التحميل...</div>
          ) : pendingDeviceTransfers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#7A8498", background: "rgba(18,44,92,0.03)", borderRadius: 16, marginTop: 18 }}>لا توجد طلبات نقل جهاز معلقة</div>
          ) : (
            <div className="gx-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 22 }}>
              {pendingDeviceTransfers.map((request) => {
                const isProcessing = processingTransferId === request.id;
                const typeLabel = request.customer_type === "seller" ? "مبيعات / تاجر" : request.customer_type === "mechanic" ? "ميكانيكي" : "-";
                return (
                  <div key={request.id} style={{ border: "1px solid rgba(18,44,92,0.1)", borderRadius: 18, padding: 20, background: "#F5F2EC" }}>
                    <p style={{ fontSize: 17, fontWeight: 700, color: "#0E2C5C", margin: 0 }}>{request.first_name} {request.last_name}</p>
                    <p style={{ color: "#586377", margin: "4px 0 0" }} dir="ltr">{request.username}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {request.customer_number && (
                        <span style={{ background: "#FFFFFF", border: "1px solid rgba(18,44,92,0.12)", color: "#586377", borderRadius: 100, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>رقم العميل: {request.customer_number}</span>
                      )}
                      <span style={{ background: "#F5F2EC", color: "#16407F", border: "1px solid #dfe6f2", borderRadius: 100, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>{typeLabel}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#7A8498", margin: "10px 0 0" }}>{new Date(request.created_at).toLocaleString("ar-SA")}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                      <button type="button" onClick={() => approveDeviceTransfer(request.id)} disabled={isProcessing} style={{ background: isProcessing ? "#9AA3B5" : "#1F8A5B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px", border: "none", borderRadius: 12, cursor: isProcessing ? "not-allowed" : "pointer" }}>
                        {isProcessing ? "جاري..." : "موافقة"}
                      </button>
                      <button type="button" onClick={() => rejectDeviceTransfer(request.id)} disabled={isProcessing} style={{ background: isProcessing ? "#9AA3B5" : "#C0392B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px", border: "none", borderRadius: 12, cursor: isProcessing ? "not-allowed" : "pointer" }}>
                        رفض
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ============== جدول جميع العملاء ============== */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "24px 26px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px", color: "#0E2C5C" }}>جميع العملاء</h2>
          <p style={{ fontSize: 14.5, color: "#586377", margin: 0 }}>عرض العملاء، صرف النقاط، وإدارة حالة الحساب</p>

          <div className="gx-search" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 22 }}>
            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>البحث</label>
              <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو اسم المستخدم أو رقم العميل" className="gx-in" style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>الحالة</label>
              <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as FilterStatus)} className="gx-in" style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C" }}>
                <option value="all">الكل</option>
                <option value="active">مفعّل</option>
                <option value="pending">معلق</option>
                <option value="suspended">موقوف</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "64px 0", color: "#7A8498" }}>جاري تحميل العملاء...</div>
          ) : filteredCustomers.length === 0 ? (
            <div style={{ marginTop: 26, background: "rgba(18,44,92,0.03)", borderRadius: 18, padding: 48, textAlign: "center", color: "#7A8498" }}>لا توجد نتائج مطابقة</div>
          ) : (
            <div className="gx-tablewrap" style={{ overflowX: "auto", marginTop: 26 }}>
              <table style={{ width: "100%", textAlign: "right", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#586377", fontSize: 13, background: "rgba(18,44,92,0.04)" }}>
                    <th style={{ padding: "0 14px", fontWeight: 600, textAlign: "right" }}>رقم العميل</th>
                    <th style={{ padding: "0 14px", fontWeight: 600, textAlign: "right" }}>العميل</th>
                    <th style={{ padding: "0 14px", fontWeight: 600, textAlign: "right" }}>اسم المستخدم</th>
                    <th style={{ padding: "0 14px", fontWeight: 600, textAlign: "center" }}>النوع</th>
                    <th style={{ padding: "0 14px", fontWeight: 600, textAlign: "center" }}>الرصيد</th>
                    <th style={{ padding: "0 14px", fontWeight: 600, textAlign: "center" }}>الحالة</th>
                    <th style={{ padding: "0 14px", fontWeight: 600, textAlign: "center" }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => {
                    const typeLabel = customer.customer_type === "seller" ? "مبيعات / تاجر" : customer.customer_type === "mechanic" ? "ميكانيكي" : "-";
                    const isProcessing = processingId === customer.id;
                    return (
                      <tr key={customer.id} className="gx-row" style={{ background: "#FFFFFF" }}>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", fontWeight: 700, color: "#0E2C5C", fontFamily: "'Space Grotesk',sans-serif" }}>{customer.customer_number || "-"}</td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", fontWeight: 700, color: "#0E2C5C" }}>{customer.first_name} {customer.last_name}</td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", color: "#586377" }} dir="ltr">{customer.username}</td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center" }}>
                          <span style={{ background: "rgba(22,64,127,0.06)", color: "#16407F", border: "1px solid #dfe6f2", padding: "4px 12px", borderRadius: 100, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{typeLabel}</span>
                        </td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center", fontWeight: 700, color: "#0E2C5C", fontFamily: "'Space Grotesk',sans-serif", fontSize: 16 }}>{customer.current_points}</td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center" }}><StatusBadge status={customer.status} /></td>
                        <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(18,44,92,0.07)", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "nowrap" }}>
                            <button type="button" onClick={() => openRedeemModal(customer)} disabled={customer.status !== "active" || customer.current_points <= 0} style={{ background: (customer.status !== "active" || customer.current_points <= 0) ? "rgba(18,44,92,0.05)" : "rgba(31,138,91,0.12)", color: (customer.status !== "active" || customer.current_points <= 0) ? "#9AA3B5" : "#1F8A5B", border: "none", fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 8, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0, cursor: (customer.status !== "active" || customer.current_points <= 0) ? "not-allowed" : "pointer" }}>
                              صرف نقاط
                            </button>
                            <button type="button" onClick={() => toggleSuspend(customer)} disabled={isProcessing || customer.status === "pending"} style={{ background: (isProcessing || customer.status === "pending") ? "rgba(18,44,92,0.05)" : customer.status === "active" ? "rgba(192,57,43,0.1)" : "rgba(22,64,127,0.1)", color: (isProcessing || customer.status === "pending") ? "#9AA3B5" : customer.status === "active" ? "#C0392B" : "#16407F", border: "none", fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 8, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0, cursor: (isProcessing || customer.status === "pending") ? "not-allowed" : "pointer" }}>
                              {isProcessing ? "جاري..." : customer.status === "active" ? "إيقاف" : "تفعيل"}
                            </button>
                            <button type="button" onClick={() => openHistory(customer)} style={{ background: "rgba(196,149,46,0.16)", color: "#8F6819", border: "none", fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 8, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer" }}>
                              السجل
                            </button>
                            <button type="button" onClick={() => openStatement(customer)} style={{ background: "rgba(22,64,127,0.1)", color: "#16407F", border: "none", fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 8, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer" }}>
                              كشف حساب
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

      {/* ============== نافذة صرف النقاط ============== */}
      {redeemModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(14,44,92,0.55)", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 520, borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)" }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0E2C5C", margin: 0 }}>صرف نقاط</h2>
            <p style={{ marginTop: 8, color: "#586377" }}>
              العميل: {redeemModal.customer.first_name} {redeemModal.customer.last_name}
              {" — "}الرصيد الحالي: <span style={{ fontWeight: 700, color: "#16407F" }}>{redeemModal.customer.current_points}</span>
            </p>
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>نوع العملية</label>
                <select value={redeemModal.type} onChange={(event) => setRedeemModal((prev) => prev ? { ...prev, type: event.target.value as RedeemType } : prev)} className="gx-in" style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(18,44,92,0.18)", background: "#FFFFFF", padding: "12px 14px", fontFamily: "inherit", fontSize: 15, color: "#0E2C5C" }}>
                  <option value="cash">صرف نقدي</option>
                  <option value="gift">صرف كهدية</option>
                  <option value="deduct">خصم نقاط</option>
                  <option value="reset">تصفير الرصيد بالكامل</option>
                </select>
              </div>
              {redeemModal.type !== "reset" && (
                <div>
                  <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>عدد النقاط</label>
                  <input type="number" min="1" max={redeemModal.customer.current_points} value={redeemModal.points} onChange={(event) => setRedeemModal((prev) => prev ? { ...prev, points: event.target.value } : prev)} dir="ltr" className="gx-in" style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(18,44,92,0.18)", background: "#FBF3DC", padding: "12px 14px", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: "#0E2C5C" }} />
                </div>
              )}
              {redeemModal.type === "reset" && (
                <div style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", color: "#C0392B", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 600 }}>
                  سيتم تصفير رصيد العميل بالكامل ({redeemModal.customer.current_points} نقطة). هذا الإجراء لا يمكن التراجع عنه.
                </div>
              )}
              <div>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>ملاحظة (اختياري)</label>
                <textarea value={redeemModal.note} onChange={(event) => setRedeemModal((prev) => prev ? { ...prev, note: event.target.value } : prev)} rows={2} className="gx-in" style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(18,44,92,0.18)", background: "#FFFFFF", padding: "12px 14px", fontFamily: "inherit", fontSize: 15, color: "#0E2C5C" }} placeholder="مثال: تم الصرف نقداً في الفرع" />
              </div>
            </div>
            <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button type="button" onClick={submitRedeem} disabled={isSubmittingRedeem} style={{ flex: 1, borderRadius: 12, background: isSubmittingRedeem ? "#9AA3B5" : "#1F8A5B", padding: "14px", fontFamily: "inherit", fontWeight: 700, color: "#fff", border: "none", cursor: isSubmittingRedeem ? "not-allowed" : "pointer" }}>
                {isSubmittingRedeem ? "جاري التنفيذ..." : "تأكيد العملية"}
              </button>
              <button type="button" onClick={() => setRedeemModal(null)} disabled={isSubmittingRedeem} style={{ borderRadius: 12, background: "#E4E1DA", padding: "14px 26px", fontFamily: "inherit", fontWeight: 700, color: "#586377", border: "none", cursor: isSubmittingRedeem ? "not-allowed" : "pointer" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== نافذة سجل عمليات الصرف ============== */}
      {historyCustomer && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(14,44,92,0.55)", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 640, borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0E2C5C", margin: 0 }}>سجل عمليات الصرف</h2>
                <p style={{ marginTop: 8, color: "#586377" }}>{historyCustomer.first_name} {historyCustomer.last_name}</p>
              </div>
              <button type="button" onClick={() => setHistoryCustomer(null)} style={{ borderRadius: 10, background: "#E4E1DA", padding: "8px 16px", fontFamily: "inherit", fontWeight: 700, color: "#586377", border: "none", cursor: "pointer" }}>إغلاق</button>
            </div>
            {isLoadingHistory ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#7A8498" }}>جاري التحميل...</div>
            ) : historyItems.length === 0 ? (
              <div style={{ marginTop: 20, background: "rgba(18,44,92,0.03)", borderRadius: 16, padding: 40, textAlign: "center", color: "#7A8498" }}>لا توجد عمليات صرف</div>
            ) : (
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                {historyItems.map((item) => (
                  <div key={item.id} style={{ border: "1px solid rgba(18,44,92,0.1)", borderRadius: 14, padding: 16, background: "#F5F2EC" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <RedemptionTypeBadge type={item.redemption_type} />
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: "#C0392B" }}>- {item.points}</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, color: "#586377" }}>
                      الرصيد: {item.points_before} ← {item.points_after}
                      {item.admin_name ? ` — بواسطة: ${item.admin_name}` : ""}
                    </div>
                    {item.note && (
                      <p style={{ marginTop: 10, fontSize: 13, color: "#586377", background: "#FFFFFF", borderRadius: 10, padding: 8, border: "1px solid rgba(18,44,92,0.08)" }}>{item.note}</p>
                    )}
                    <p style={{ marginTop: 8, fontSize: 12, color: "#7A8498" }}>{new Date(item.created_at).toLocaleString("ar-SA")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============== نافذة كشف حساب النقاط ============== */}
      {statementCustomer && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(14,44,92,0.55)", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 640, borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0E2C5C", margin: 0 }}>كشف حساب النقاط</h2>
                <p style={{ marginTop: 8, color: "#586377" }}>{statementCustomer.first_name} {statementCustomer.last_name}</p>
              </div>
              <button type="button" onClick={() => setStatementCustomer(null)} style={{ borderRadius: 10, background: "#E4E1DA", padding: "8px 16px", fontFamily: "inherit", fontWeight: 700, color: "#586377", border: "none", cursor: "pointer" }}>إغلاق</button>
            </div>
            {isLoadingStatement ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#7A8498" }}>جاري التحميل...</div>
            ) : statementItems.length === 0 ? (
              <div style={{ marginTop: 20, background: "rgba(18,44,92,0.03)", borderRadius: 16, padding: 40, textAlign: "center", color: "#7A8498" }}>لا توجد عمليات نقاط</div>
            ) : (
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                {statementItems.map((item) => {
                  const isReleased = item.status === "released";
                  return (
                    <div key={item.id} style={{ border: "1px solid rgba(18,44,92,0.1)", borderRadius: 14, padding: 14, background: "#F5F2EC", display: "flex", alignItems: "center", gap: 14 }}>
                      {item.product_image_url && (
                        <img src={item.product_image_url} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "contain", background: "#FFFFFF", border: "1px solid rgba(18,44,92,0.1)", flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, color: "#0E2C5C", margin: 0, fontSize: 15 }}>{item.product_name_ar || item.product_name_en || item.product_number}</p>
                        <p style={{ fontSize: 12.5, color: "#7A8498", margin: "4px 0 0" }}>{new Date(item.created_at).toLocaleString("ar-SA")}</p>
                      </div>
                      <div style={{ textAlign: "left", flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: isReleased ? "#16407F" : "#8F6819" }}>+ {item.points}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: isReleased ? "#16407F" : "#C4952E" }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: isReleased ? "#16407F" : "#8F6819" }}>{item.status_label}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .gx-in:focus { outline: none; border-color: #16407F; box-shadow: 0 0 0 3px rgba(22,64,127,0.12); }
        .gx-row:hover { background: rgba(18,44,92,0.02) !important; }
        .gx-in::placeholder { color: #9AA3B5; }
        @media (max-width:900px){
          .gx-kpis { grid-template-columns:1fr 1fr !important; }
          .gx-2col, .gx-3col, .gx-search { grid-template-columns:1fr !important; }
          .gx-titlerow { flex-direction:column; }
        }
      `}</style>
    </div>
  );
}

function StatCard({ title, value, dark = false, tone }: { title: string; value: number; dark?: boolean; tone?: "green" | "red" }) {
  const valueColor = dark ? "#F5F2EC" : tone === "green" ? "#1F8A5B" : tone === "red" ? "#C0392B" : "#0E2C5C";
  return (
    <div style={{ borderRadius: 18, padding: "20px 22px", background: dark ? "linear-gradient(140deg,#16407F,#0E2C5C)" : "#FFFDF8", border: dark ? "none" : "1px solid rgba(18,44,92,0.1)" }}>
      <div style={{ fontSize: 13, color: dark ? "#C6D2EA" : "#7A8498", marginBottom: 8 }}>{title}</div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 36, lineHeight: 1, color: valueColor }}>{value}</div>
    </div>
  );
}

function InfoBox({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,44,92,0.08)", borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 12, color: "#7A8498", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "#0E2C5C", ...(ltr ? { direction: "ltr", textAlign: "right" } : {}) }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    active: { label: "مفعّل", bg: "rgba(31,138,91,0.1)", color: "#1F8A5B", border: "rgba(31,138,91,0.3)" },
    pending: { label: "معلق", bg: "#FBF3DC", color: "#8F6819", border: "#e8d9a8" },
    suspended: { label: "موقوف", bg: "rgba(192,57,43,0.08)", color: "#C0392B", border: "rgba(192,57,43,0.25)" },
  };
  const item = map[status] || { label: status, bg: "rgba(18,44,92,0.05)", color: "#586377", border: "rgba(18,44,92,0.12)" };
  return (
    <span style={{ background: item.bg, color: item.color, border: `1px solid ${item.border}`, padding: "5px 14px", borderRadius: 100, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
      {item.label}
    </span>
  );
}

function RedemptionTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    cash: { label: "صرف نقدي", bg: "rgba(31,138,91,0.1)", color: "#1F8A5B", border: "rgba(31,138,91,0.3)" },
    gift: { label: "صرف كهدية", bg: "rgba(122,64,158,0.1)", color: "#7A409E", border: "rgba(122,64,158,0.3)" },
    deduct: { label: "خصم نقاط", bg: "rgba(200,90,40,0.1)", color: "#C85A28", border: "rgba(200,90,40,0.3)" },
    reset: { label: "تصفير الرصيد", bg: "rgba(192,57,43,0.08)", color: "#C0392B", border: "rgba(192,57,43,0.25)" },
  };
  const item = map[type] || { label: type, bg: "rgba(18,44,92,0.05)", color: "#586377", border: "rgba(18,44,92,0.12)" };
  return (
    <span style={{ background: item.bg, color: item.color, border: `1px solid ${item.border}`, padding: "5px 14px", borderRadius: 100, fontSize: 13.5, fontWeight: 700 }}>
      {item.label}
    </span>
  );
}