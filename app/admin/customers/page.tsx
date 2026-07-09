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
              <h1 className="text-3xl md:text-4xl font-bold mt-2">إدارة العملاء والنقاط</h1>
              <p className="text-blue-100 mt-3">
                طلبات التسجيل، كلمة المرور، نقل الجهاز، صرف النقاط، وإدارة الحسابات
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={loadAll}
                disabled={isLoading}
                className="bg-white text-blue-800 hover:bg-blue-50 disabled:bg-gray-200 disabled:text-gray-400 px-6 py-3 rounded-2xl font-bold transition"
              >
                {isLoading ? "جاري التحديث..." : "تحديث"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin/settings")}
                className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-2xl font-bold transition"
              >
                إعدادات نسب توزيع النقاط
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

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="إجمالي العملاء" value={stats.total} />
          <StatCard title="مفعّلين" value={stats.active} />
          <StatCard title="موقوفين" value={stats.suspended} />
          <StatCard title="إجمالي النقاط" value={stats.totalPoints} dark />
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

        {/* ============== طلبات التسجيل المعلقة ============== */}
        <section className="bg-white rounded-[2rem] shadow-xl p-5 md:p-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">طلبات التسجيل المعلقة</h2>
            <p className="text-gray-500 mt-2">راجع الطلبات الجديدة واختر نوع العميل قبل الموافقة</p>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-500 bg-slate-50 rounded-3xl mt-6">
              جاري تحميل الطلبات...
            </div>
          ) : pendingCustomers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-slate-50 rounded-3xl mt-6">
              لا توجد طلبات تسجيل معلقة
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6">
              {pendingCustomers.map((customer) => {
                const isProcessing = processingPendingId === customer.id;

                return (
                  <div
                    key={customer.id}
                    className="border border-slate-200 rounded-3xl p-5 hover:shadow-md transition bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-bold text-blue-900">
                          {customer.first_name} {customer.last_name}
                        </p>
                        <p className="text-gray-500 mt-1" dir="ltr">
                          {customer.username}
                        </p>
                      </div>

                      <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-3 py-1 text-sm font-bold">
                        معلق
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-5 text-sm">
                      <InfoBox label="المدينة" value={customer.city} />
                      <InfoBox label="الدولة" value={customer.country} />
                      <InfoBox label="الجوال" value={customer.phone_international} ltr />
                      <InfoBox
                        label="تاريخ الطلب"
                        value={new Date(customer.created_at).toLocaleDateString("ar-SA")}
                      />
                    </div>

                    <div className="mt-5">
                      <label className="block text-sm font-bold text-gray-700 mb-2">نوع العميل</label>
                      <select
                        value={customerTypes[customer.id] || ""}
                        onChange={(event) => {
                          setCustomerTypes((previous) => ({
                            ...previous,
                            [customer.id]: event.target.value,
                          }));
                          setMessage("");
                        }}
                        disabled={isProcessing}
                        className="w-full border border-gray-300 rounded-2xl px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">اختر نوع العميل</option>
                        <option value="mechanic">ميكانيكي</option>
                        <option value="seller">مبيعات / تاجر</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-5">
                      <button
                        type="button"
                        onClick={() => approveCustomer(customer.id)}
                        disabled={isProcessing}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-2xl font-bold"
                      >
                        {isProcessing ? "جاري التنفيذ..." : "موافقة"}
                      </button>

                      <button
                        type="button"
                        onClick={() => rejectCustomer(customer.id)}
                        disabled={isProcessing}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-2xl font-bold"
                      >
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
        <section className="bg-white rounded-[2rem] shadow-xl p-5 md:p-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">طلبات إعادة تعيين كلمة المرور</h2>
            <p className="text-gray-500 mt-2">
              العملاء اللي طلبوا استعادة كلمة المرور من صفحة "نسيت كلمة المرور"
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-500 bg-slate-50 rounded-3xl mt-6">
              جاري التحميل...
            </div>
          ) : pendingPasswordResets.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-slate-50 rounded-3xl mt-6">
              لا توجد طلبات إعادة تعيين معلقة
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
              {pendingPasswordResets.map((request) => {
                const isProcessing = processingResetId === request.id;
                const typeLabel =
                  request.customer_type === "seller"
                    ? "مبيعات / تاجر"
                    : request.customer_type === "mechanic"
                    ? "ميكانيكي"
                    : "-";

                return (
                  <div key={request.id} className="border border-slate-200 rounded-3xl p-5 bg-slate-50">
                    <p className="text-lg font-bold text-blue-900">
                      {request.first_name} {request.last_name}
                    </p>
                    <p className="text-gray-500 mt-1" dir="ltr">
                      {request.username}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {request.customer_number && (
                        <span className="bg-white border border-slate-200 text-slate-700 rounded-full px-3 py-1 text-xs font-bold">
                          رقم العميل: {request.customer_number}
                        </span>
                      )}
                      <span className="bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-3 py-1 text-xs font-bold">
                        {typeLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(request.created_at).toLocaleString("ar-SA")}
                    </p>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <button
                        type="button"
                        onClick={() => approvePasswordReset(request.id)}
                        disabled={isProcessing}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-2xl font-bold text-sm"
                      >
                        {isProcessing ? "جاري..." : "موافقة"}
                      </button>

                      <button
                        type="button"
                        onClick={() => rejectPasswordReset(request.id)}
                        disabled={isProcessing}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-2xl font-bold text-sm"
                      >
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
        <section className="bg-white rounded-[2rem] shadow-xl p-5 md:p-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">طلبات نقل الجهاز</h2>
            <p className="text-gray-500 mt-2">
              العملاء اللي حاولوا الدخول من جهاز جديد غير الجهاز المسجل عليه حسابهم
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-500 bg-slate-50 rounded-3xl mt-6">
              جاري التحميل...
            </div>
          ) : pendingDeviceTransfers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-slate-50 rounded-3xl mt-6">
              لا توجد طلبات نقل جهاز معلقة
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
              {pendingDeviceTransfers.map((request) => {
                const isProcessing = processingTransferId === request.id;
                const typeLabel =
                  request.customer_type === "seller"
                    ? "مبيعات / تاجر"
                    : request.customer_type === "mechanic"
                    ? "ميكانيكي"
                    : "-";

                return (
                  <div key={request.id} className="border border-slate-200 rounded-3xl p-5 bg-slate-50">
                    <p className="text-lg font-bold text-blue-900">
                      {request.first_name} {request.last_name}
                    </p>
                    <p className="text-gray-500 mt-1" dir="ltr">
                      {request.username}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {request.customer_number && (
                        <span className="bg-white border border-slate-200 text-slate-700 rounded-full px-3 py-1 text-xs font-bold">
                          رقم العميل: {request.customer_number}
                        </span>
                      )}
                      <span className="bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-3 py-1 text-xs font-bold">
                        {typeLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(request.created_at).toLocaleString("ar-SA")}
                    </p>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <button
                        type="button"
                        onClick={() => approveDeviceTransfer(request.id)}
                        disabled={isProcessing}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-2xl font-bold text-sm"
                      >
                        {isProcessing ? "جاري..." : "موافقة"}
                      </button>

                      <button
                        type="button"
                        onClick={() => rejectDeviceTransfer(request.id)}
                        disabled={isProcessing}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-2xl font-bold text-sm"
                      >
                        رفض
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ============== جدول العملاء + صرف النقاط + الإيقاف/التفعيل ============== */}
        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">جميع العملاء</h2>
            <p className="text-gray-500 mt-2">عرض العملاء، صرف النقاط، وإدارة حالة الحساب</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">البحث</label>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث بالاسم أو اسم المستخدم أو رقم العميل"
                className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">الحالة</label>
              <select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value as FilterStatus)}
                className="w-full border border-gray-300 rounded-2xl px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">الكل</option>
                <option value="active">مفعّل</option>
                <option value="pending">معلق</option>
                <option value="suspended">موقوف</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-gray-500">جاري تحميل العملاء...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="mt-7 bg-slate-50 rounded-3xl p-12 text-center text-gray-500">
              لا توجد نتائج مطابقة
            </div>
          ) : (
            <div className="overflow-x-auto mt-7">
              <table className="w-full text-right border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-blue-900 text-sm">
                    <th className="px-4">رقم العميل</th>
                    <th className="px-4">العميل</th>
                    <th className="px-4">اسم المستخدم</th>
                    <th className="px-4">النوع</th>
                    <th className="px-4">الرصيد</th>
                    <th className="px-4">الحالة</th>
                    <th className="px-4">إجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCustomers.map((customer) => {
                    const typeLabel =
                      customer.customer_type === "seller"
                        ? "مبيعات / تاجر"
                        : customer.customer_type === "mechanic"
                        ? "ميكانيكي"
                        : "-";

                    const isProcessing = processingId === customer.id;

                    return (
                      <tr key={customer.id} className="bg-slate-50 hover:bg-blue-50 transition">
                        <td className="p-4 rounded-r-2xl font-bold text-blue-900">
                          {customer.customer_number || "-"}
                        </td>

                        <td className="p-4 font-bold text-gray-800">
                          {customer.first_name} {customer.last_name}
                        </td>

                        <td className="p-4 text-gray-700" dir="ltr">
                          {customer.username}
                        </td>

                        <td className="p-4">
                          <span className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-sm font-bold">
                            {typeLabel}
                          </span>
                        </td>

                        <td className="p-4 font-bold text-blue-900">{customer.current_points}</td>

                        <td className="p-4">
                          <StatusBadge status={customer.status} />
                        </td>

                        <td className="p-4 rounded-l-2xl">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openRedeemModal(customer)}
                              disabled={customer.status !== "active" || customer.current_points <= 0}
                              className="rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 font-bold text-sm"
                            >
                              صرف نقاط
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleSuspend(customer)}
                              disabled={isProcessing || customer.status === "pending"}
                              className={`rounded-xl px-4 py-2 font-bold text-sm text-white disabled:bg-gray-400 ${
                                customer.status === "active"
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-blue-600 hover:bg-blue-700"
                              }`}
                            >
                              {isProcessing
                                ? "جاري..."
                                : customer.status === "active"
                                ? "إيقاف"
                                : "تفعيل"}
                            </button>

                            <button
                              type="button"
                              onClick={() => openHistory(customer)}
                              className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 font-bold text-sm shadow-sm"
                            >
                              السجل
                            </button>

                            <button
                              type="button"
                              onClick={() => openStatement(customer)}
                              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 font-bold text-sm shadow-sm"
                            >
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
      </div>

      {redeemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-blue-950">صرف نقاط</h2>

            <p className="mt-2 text-gray-500">
              العميل: {redeemModal.customer.first_name} {redeemModal.customer.last_name}
              {" — "}الرصيد الحالي: <span className="font-bold text-blue-900">{redeemModal.customer.current_points}</span>
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">نوع العملية</label>
                <select
                  value={redeemModal.type}
                  onChange={(event) =>
                    setRedeemModal((prev) =>
                      prev ? { ...prev, type: event.target.value as RedeemType } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="cash">صرف نقدي</option>
                  <option value="gift">صرف كهدية</option>
                  <option value="deduct">خصم نقاط</option>
                  <option value="reset">تصفير الرصيد بالكامل</option>
                </select>
              </div>

              {redeemModal.type !== "reset" && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">عدد النقاط</label>
                  <input
                    type="number"
                    min="1"
                    max={redeemModal.customer.current_points}
                    value={redeemModal.points}
                    onChange={(event) =>
                      setRedeemModal((prev) =>
                        prev ? { ...prev, points: event.target.value } : prev
                      )
                    }
                    dir="ltr"
                    className="w-full rounded-2xl border border-gray-300 bg-yellow-50 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              {redeemModal.type === "reset" && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm font-semibold">
                  سيتم تصفير رصيد العميل بالكامل ({redeemModal.customer.current_points} نقطة). هذا الإجراء لا يمكن التراجع عنه.
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ملاحظة (اختياري)</label>
                <textarea
                  value={redeemModal.note}
                  onChange={(event) =>
                    setRedeemModal((prev) =>
                      prev ? { ...prev, note: event.target.value } : prev
                    )
                  }
                  rows={2}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="مثال: تم الصرف نقداً في الفرع"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={submitRedeem}
                disabled={isSubmittingRedeem}
                className="flex-1 rounded-2xl bg-green-600 hover:bg-green-700 disabled:bg-gray-500 px-6 py-4 font-bold text-white shadow-lg"
              >
                {isSubmittingRedeem ? "جاري التنفيذ..." : "تأكيد العملية"}
              </button>

              <button
                type="button"
                onClick={() => setRedeemModal(null)}
                disabled={isSubmittingRedeem}
                className="rounded-2xl bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 px-6 py-4 font-bold text-white shadow-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-blue-950">سجل عمليات الصرف</h2>
                <p className="mt-2 text-gray-500">
                  {historyCustomer.first_name} {historyCustomer.last_name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 font-bold text-slate-700"
              >
                إغلاق
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="text-center py-12 text-gray-500">جاري التحميل...</div>
            ) : historyItems.length === 0 ? (
              <div className="mt-6 bg-slate-50 rounded-2xl p-8 text-center text-gray-500">
                لا توجد عمليات صرف سابقة
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {historyItems.map((item) => (
                  <div key={item.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <RedemptionTypeBadge type={item.redemption_type} />
                      <span className="text-sm text-gray-500">
                        {new Date(item.created_at).toLocaleString("ar-SA")}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                      <div>
                        <p className="text-gray-400 text-xs">قبل</p>
                        <p className="font-bold">{item.points_before}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">المصروف</p>
                        <p className="font-bold text-red-600">-{item.points}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">بعد</p>
                        <p className="font-bold">{item.points_after}</p>
                      </div>
                    </div>

                    {item.note && (
                      <p className="mt-3 text-sm text-gray-600 bg-white rounded-xl p-2 border border-slate-100">
                        {item.note}
                      </p>
                    )}

                    {item.admin_name && (
                      <p className="mt-2 text-xs text-gray-400">بواسطة: {item.admin_name}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {statementCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-blue-950">كشف حساب النقاط</h2>
                <p className="mt-2 text-gray-500">
                  {statementCustomer.first_name} {statementCustomer.last_name}
                  {" — "}
                  <span dir="ltr">{statementCustomer.username}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStatementCustomer(null)}
                className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 font-bold text-slate-700"
              >
                إغلاق
              </button>
            </div>

            {!isLoadingStatement && statementItems.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
                  <p className="text-blue-700 text-sm font-semibold">إجمالي المفرج عنه</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">
                    {statementItems
                      .filter((item) => item.status === "released")
                      .reduce((sum, item) => sum + Number(item.points || 0), 0)}
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 text-center">
                  <p className="text-yellow-700 text-sm font-semibold">إجمالي الموقف</p>
                  <p className="text-2xl font-bold text-yellow-800 mt-1">
                    {statementItems
                      .filter((item) => item.status === "pending")
                      .reduce((sum, item) => sum + Number(item.points || 0), 0)}
                  </p>
                </div>
              </div>
            )}

            {isLoadingStatement ? (
              <div className="text-center py-12 text-gray-500">جاري التحميل...</div>
            ) : statementItems.length === 0 ? (
              <div className="mt-6 bg-slate-50 rounded-2xl p-8 text-center text-gray-500">
                لا توجد عمليات مسح لهذا العميل حتى الآن
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {statementItems.map((item) => {
                  const isReleased = item.status === "released";

                  return (
                    <div
                      key={`${item.status}-${item.id}`}
                      className="border border-slate-200 rounded-2xl p-4 bg-slate-50 flex items-center gap-4"
                    >
                      {item.product_image_url ? (
                        <img
                          src={item.product_image_url}
                          alt={item.product_name_ar || item.product_number}
                          className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-slate-200 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                          صورة
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate">
                          {item.product_name_ar || "منتج"}
                        </p>
                        <p className="text-sm text-gray-500 truncate" dir="ltr">
                          {item.product_name_en || item.product_number}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(item.created_at).toLocaleString("ar-SA")}
                        </p>
                      </div>

                      <div className="text-left flex-shrink-0">
                        <p className="text-xl font-bold text-blue-900">{item.points}</p>
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded-full ${
                            isReleased
                              ? "bg-blue-100 text-blue-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {item.status_label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ title, value, dark = false }: { title: string; value: number; dark?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-3 md:p-5 shadow-sm ${
        dark ? "bg-gradient-to-r from-blue-800 to-blue-950 text-white" : "bg-white text-blue-900"
      }`}
    >
      <p className={`text-xs md:text-sm ${dark ? "text-blue-100" : "text-gray-500"}`}>{title}</p>
      <p className="text-2xl md:text-4xl font-bold mt-1 md:mt-3">{value}</p>
    </div>
  );
}

function InfoBox({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-3 border border-slate-100">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="font-bold text-gray-800 mt-1" dir={ltr ? "ltr" : "rtl"}>
        {value || "-"}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "active"
      ? "bg-green-50 text-green-700 border-green-100"
      : status === "pending"
      ? "bg-yellow-50 text-yellow-700 border-yellow-100"
      : status === "suspended"
      ? "bg-red-50 text-red-700 border-red-100"
      : "bg-slate-50 text-slate-700 border-slate-100";

  const label =
    status === "active"
      ? "مفعل"
      : status === "pending"
      ? "معلق"
      : status === "suspended"
      ? "موقوف"
      : status;

  return (
    <span className={`border px-3 py-1 rounded-full text-sm font-bold ${className}`}>
      {label}
    </span>
  );
}

function RedemptionTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string }> = {
    cash: { label: "صرف نقدي", className: "bg-green-50 text-green-700 border-green-100" },
    gift: { label: "صرف كهدية", className: "bg-purple-50 text-purple-700 border-purple-100" },
    deduct: { label: "خصم نقاط", className: "bg-orange-50 text-orange-700 border-orange-100" },
    reset: { label: "تصفير الرصيد", className: "bg-red-50 text-red-700 border-red-100" },
  };

  const item = map[type] || { label: type, className: "bg-slate-50 text-slate-700 border-slate-100" };

  return (
    <span className={`border px-3 py-1 rounded-full text-sm font-bold ${item.className}`}>
      {item.label}
    </span>
  );
}
