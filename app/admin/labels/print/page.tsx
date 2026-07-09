"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

type LabelItem = {
  id: string;
  token: string;
  product_number?: string | null;
  product_name?: string | null;
  product_name_ar?: string | null;
  product_name_en?: string | null;
  product_image_url?: string | null;
  packing_qty?: string | number | null;
  barcode?: string | null;
  reference_number?: string | null;
  ean13_barcode?: string | null;
};

type Field = {
  id: string;
  type?: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  visible?: boolean;
  text?: string;
  imageData?: string;
  fontSize?: number;
  textAlign?: "right" | "center" | "left";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  zIndex?: number;
};

type Template = {
  id: string;
  template_name: string;
  width_mm: number;
  height_mm: number;
  background_color?: string | null;
  border_color?: string | null;
  border_radius?: number | null;
  is_default: boolean;
  is_active: boolean;
  settings: any;
  template_data?: any;
};

function parseJson(v: any) {
  if (!v) return {};
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

function getFields(t: Template | null): Field[] {
  if (!t) return [];

  const s = parseJson(t.settings);
  const d = parseJson(t.template_data);

  const raw = s.fields_array || d.fields_array || s.fields || d.fields || [];

  if (Array.isArray(raw)) {
    return raw.map((f: any, i: number) => ({
      ...f,
      id: f.id || `field-${i}`,
      type: f.type || f.id || "",
      x: Number(f.x ?? 0),
      y: Number(f.y ?? 0),
      w: Number(f.w ?? 10),
      h: Number(f.h ?? 10),
      rotate: Number(f.rotate ?? 0),
      visible: f.visible !== false,
      fontSize: Number(f.fontSize ?? 11),
      textAlign: f.textAlign || "center",
      zIndex: Number(f.zIndex ?? i + 1),
    }));
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([key, value]: [string, any], i) => ({
      ...value,
      id: value?.id || key,
      type: value?.type || key,
      x: Number(value?.x ?? 0),
      y: Number(value?.y ?? 0),
      w: Number(value?.w ?? 10),
      h: Number(value?.h ?? 10),
      rotate: Number(value?.rotate ?? 0),
      visible: value?.visible !== false,
      fontSize: Number(value?.fontSize ?? 11),
      textAlign: value?.textAlign || "center",
      zIndex: Number(value?.zIndex ?? i + 1),
    }));
  }

  return [];
}

function fieldType(f: Field) {
  const t = String(f.type || f.id || "").toLowerCase();

  if (t === "logo") return "logo";
  if (t === "product_image" || t === "productimage") return "product_image";
  if (t === "product_name_ar" || t === "productname" || t === "product_name") return "product_name";
  if (t === "part_number" || t === "partnumber") return "part_number";
  if (t === "reference_number" || t === "referencenumber" || t === "refnumber" || t === "ref_number") return "reference_number";
  if (t === "packing_qty" || t === "packingqty") return "packing_qty";
  if (t === "barcode") return "barcode";
  if (t === "qr_code" || t === "qrcode") return "qr_code";
  if (t === "free_text" || t === "freetext") return "free_text";
  if (t === "free_image" || t === "freeimage") return "free_image";

  return t;
}

/* يحدد أي رقم/تنسيق يُطبع بالباركود:
   - لو عند المنتج ean13_barcode ثابت (محسوب مرة وحدة بقاعدة البيانات) →
     نطبعه بصيغة EAN-13 (الشكل الاحترافي التقليدي)
   - غير كذا (منتجات قديمة قبل الترحيل) → CODE128 بالرقم المخزّن حرفيًا،
     لضمان تطابق تام مع أنظمة نقاط البيع والمخزن */
type BarcodePayload = { value: string; format: "EAN13" | "CODE128" };

function getBarcodePayload(label: LabelItem): BarcodePayload | null {
  const ean13 = String(label.ean13_barcode || "").trim();
  if (/^\d{13}$/.test(ean13)) {
    return { value: ean13, format: "EAN13" };
  }

  const raw = String(label.barcode || label.product_number || "").trim();
  if (!raw) return null;

  return { value: raw, format: "CODE128" };
}

export default function PrintLabelsPage() {
  const router = useRouter();
  const didAutoPrintRef = useRef(false);
  const didLoadRef = useRef(false);

  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [barcodeImages, setBarcodeImages] = useState<Record<string, string>>({});

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const fields = useMemo(() => getFields(selectedTemplate), [selectedTemplate]);

  const requiredBarcodePayloads = useMemo(() => {
    const seen = new Map<string, BarcodePayload>();
    for (const l of labels) {
      const payload = getBarcodePayload(l);
      if (payload) seen.set(payload.value, payload);
    }
    return Array.from(seen.values());
  }, [labels]);

  useEffect(() => {
  if (didLoadRef.current) return;
  didLoadRef.current = true;
  loadData();
}, []);

  useEffect(() => {
    if (didAutoPrintRef.current) return;
    if (loading) return;
    if (message) return;
    if (labels.length === 0) return;
    if (!selectedTemplate) return;
    if (fields.length === 0) return;
    if (Object.keys(qrImages).length < labels.length) return;
    if (Object.keys(barcodeImages).length < requiredBarcodePayloads.length) return;

    const params = new URLSearchParams(window.location.search);
    const autoPrint = params.get("autoPrint");

    if (autoPrint === "1") {
      didAutoPrintRef.current = true;
      setTimeout(() => {
        window.print();
      }, 1200);
    }
  },[loading, message, labels.length, selectedTemplate, fields.length, qrImages, barcodeImages, requiredBarcodePayloads]);

  async function loadData() {
  const start = performance.now();

  setLoading(true);
  setMessage("");

  const params = new URLSearchParams(window.location.search);

  const ids =
    params
      .get("ids")
      ?.split(",")
      .map((x) => x.trim())
      .filter(Boolean) || [];

  const templateIdFromUrl = params.get("templateId") || "";
console.log("templateIdFromUrl =", templateIdFromUrl);
  if (ids.length === 0) {
    setMessage("لم يتم اختيار أي أكواد للطباعة");
    setLoading(false);
   
    return;
  }

  const t1 = performance.now();
const templatesResult = await supabase
  .from("label_templates")
.select("id, template_name, width_mm, height_mm, background_color, border_color, border_radius, is_default, is_active, settings, template_data")
.eq("is_active", true)
.order("created_at", { ascending: false });

console.log("Templates only:", performance.now() - t1);

const t2 = performance.now();

const qrResult = await supabase.rpc("get_print_qr_codes", {
  p_ids: ids,
});

console.log("QR only:", performance.now() - t2);

 

  if (templatesResult.error) {
    setMessage(templatesResult.error.message);
    setLoading(false);
    
    return;
  }

  if (qrResult.error) {
    setMessage(qrResult.error.message);
    setLoading(false);
    
    return;
  }

  const activeTemplates = (templatesResult.data || []) as Template[];

setTemplates(activeTemplates);

  const preselected =
    activeTemplates.find((t) => t.id === templateIdFromUrl) ||
    activeTemplates.find((t) => t.is_default) ||
    activeTemplates[0];

  if (preselected) {
    setSelectedTemplateId(preselected.id);
  } else {
    setMessage("لا توجد قوالب نشطة");
    setLoading(false);
   
    return;
  }

  const mappedLabels: LabelItem[] = (qrResult.data || []).map((row: any) => ({
    id: row.id,
    token: row.token,
    product_number: row.product_number || "",
    product_name: row.product_name_en || row.product_name_ar || "",
    product_name_ar: row.product_name_ar || "",
    product_name_en: row.product_name_en || "",
    product_image_url: row.product_image_url || "",
    packing_qty: row.packing_qty || "",
    barcode: row.barcode || row.product_number || "",
    reference_number: row.reference_number || "",
    ean13_barcode: row.ean13_barcode || "",
  }));

  if (mappedLabels.length === 0) {
    setLabels([]);
    setMessage("تم فتح صفحة الطباعة لكن لم يتم العثور على أكواد QR المطلوبة");
    setLoading(false);
    
    return;
  }

  setLabels(mappedLabels);
  setLoading(false);
  console.log("Total:", performance.now() - start);
  
}

  function qrUrl(token: string) {
  return QRCode.toDataURL(token, {
    width: 300,
    margin: 0,
    errorCorrectionLevel: "H",
  });
}
useEffect(() => {
  async function generateQrImages() {
    const images: Record<string, string> = {};

    for (const label of labels) {
  images[label.token] = await qrUrl(label.token);

  console.log("QR Generated:", label.token);
  console.log(images);
}

    setQrImages(images);
  }

  if (labels.length > 0) {
    generateQrImages();
  }
}, [labels]);

  /* يطبع EAN-13 (شكل احترافي ثابت) لو متوفر بقاعدة البيانات، وإلا CODE128
     بالرقم المخزّن حرفيًا — يضمن تطابق تام مع أنظمة نقاط البيع والمخزن
     للمنتجات القديمة اللي ما انترحلت بعد. */
  function generateBarcodeDataUrl(payload: BarcodePayload): string | null {
    try {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, payload.value, {
        format: payload.format,
        width: 2,
        height: 55,
        displayValue: true,
        fontSize: 16,
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
      });
      return canvas.toDataURL("image/png");
    } catch {
      // احتياط: لو تنسيق EAN13 فشل لأي سبب غير متوقع، جرّب CODE128 بنفس القيمة
      try {
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, payload.value, {
          format: "CODE128",
          width: 2,
          height: 55,
          displayValue: true,
          fontSize: 16,
          margin: 0,
          background: "#ffffff",
          lineColor: "#000000",
        });
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      }
    }
  }

  useEffect(() => {
    const images: Record<string, string> = {};

    for (const payload of requiredBarcodePayloads) {
      const dataUrl = generateBarcodeDataUrl(payload);
      if (dataUrl) images[payload.value] = dataUrl;
    }

    setBarcodeImages(images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredBarcodePayloads]);

  function textStyle(f: Field, noWrap?: boolean): CSSProperties {
    return {
      width: "100%",
      fontSize: `${f.fontSize || 11}px`,
      textAlign: f.textAlign || "center",
      lineHeight: 1.15,
      whiteSpace: noWrap ? "nowrap" : "pre-wrap",
      overflow: noWrap ? "visible" : "hidden",
      wordBreak: noWrap ? "normal" : "break-word",
      fontWeight: f.bold === false ? 400 : 900,
      fontStyle: f.italic ? "italic" : "normal",
      textDecoration: f.underline ? "underline" : "none",
      color: f.color || "#0F172A",
    };
  }

  function fieldBoxStyle(f: Field, t: Template): CSSProperties {
    return {
      left: `${(f.x / t.width_mm) * 100}%`,
      top: `${(f.y / t.height_mm) * 100}%`,
      width: `${(f.w / t.width_mm) * 100}%`,
      height: `${(f.h / t.height_mm) * 100}%`,
      transform: `rotate(${f.rotate || 0}deg)`,
      transformOrigin: "center center",
      zIndex: f.zIndex || 1,
    };
  }

  function renderField(f: Field, label: LabelItem) {
    const type = fieldType(f);

    if (type === "logo") {
      return (
        <div className="leading-none">
          <div className="font-black tracking-wide text-blue-900">GALTEX</div>
          <div className="font-bold text-blue-900" style={{ fontSize: 7, letterSpacing: 3, marginTop: 3 }}>
            GERMANY
          </div>
        </div>
      );
    }

    if (type === "product_image") {
      return label.product_image_url ? (
        <img
  src={label.product_image_url}
  alt="Product"
  loading="eager"
  decoding="sync"
  className="h-full w-full object-contain"
/>
      ) : (
        <div className="text-[8px] text-slate-400">لا توجد صورة</div>
      );
    }

    if (type === "product_name") {
      return (
        <div style={textStyle(f, true)} className="font-black text-slate-900" dir="ltr">
          Description: {label.product_name_en?.trim() || "-"}
        </div>
      );
    }

    if (type === "part_number") {
      return (
        <div style={textStyle(f, true)} className="font-black text-slate-900" dir="ltr">
          ITEM NO : {label.product_number || "-"}
        </div>
      );
    }

    if (type === "reference_number") {
      return (
        <div style={textStyle(f, true)} className="font-black text-slate-900" dir="ltr">
          Ref: {label.reference_number || "-"}
        </div>
      );
    }

    if (type === "packing_qty") {
      return (
        <div style={textStyle(f, true)} className="font-black text-slate-900" dir="ltr">
          QTY: {label.packing_qty ?? "-"}
        </div>
      );
    }

    if (type === "barcode") {
      const payload = getBarcodePayload(label);
      const src = payload ? barcodeImages[payload.value] : null;

      if (!payload) {
        return <div className="text-[8px] text-slate-400">لا يوجد رقم باركود</div>;
      }

      if (!src) {
        return <div className="text-[8px] text-slate-400">Generating...</div>;
      }

      return (
        <div className="flex h-full w-full items-center justify-center overflow-hidden">
          <img src={src} alt={`Barcode ${payload.value}`} className="h-full w-full object-contain" />
        </div>
      );
    }

    if (type === "qr_code") {
  const src = qrImages[label.token];

  if (!src) {
    return <div className="text-[8px] text-slate-400">Generating...</div>;
  }

  return (
    <img
      src={src}
      alt="QR"
      className="h-full w-full object-contain"
    />
  );
}

    if (type === "free_text") {
      return (
        <div style={textStyle(f)} className="font-bold text-slate-900">
          {f.text || ""}
        </div>
      );
    }

    if (type === "free_image" && f.imageData) {
      return <img src={f.imageData} alt="Custom" className="h-full w-full object-contain" />;
    }

    return null;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100" dir="rtl">
        جاري تحميل الليبلات...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0" dir="rtl">
      <div className="print:hidden mx-auto mb-6 max-w-6xl rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-blue-950">طباعة الليبلات</h1>
            <p className="mt-2 text-slate-500">عدد الليبلات المحددة: {labels.length}</p>
          </div>

          <div className="flex items-end gap-3">
            <div>
              <label className="mb-2 block text-sm font-bold">قالب الليبل</label>

              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="min-w-[330px] rounded-xl border bg-blue-50 px-4 py-3 font-bold text-slate-900"
              >
                <option value="">اختر القالب</option>

                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.template_name} — {t.width_mm} × {t.height_mm} mm
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={!selectedTemplate || fields.length === 0 || labels.length === 0}
              className="rounded-xl bg-blue-700 px-7 py-3 font-bold text-white disabled:bg-gray-500"
            >
              طباعة
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/products")}
              className="rounded-xl bg-slate-700 px-6 py-3 font-bold text-white hover:bg-slate-800"
            >
              رجوع
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className="print:hidden mx-auto max-w-6xl rounded-2xl bg-red-50 p-5 text-center font-bold text-red-700">
          {message}
        </div>
      ) : !selectedTemplate ? (
        <div className="print:hidden mx-auto max-w-6xl rounded-2xl bg-yellow-50 p-5 text-center font-bold">
          اختر قالب الليبل
        </div>
      ) : fields.length === 0 ? (
        <div className="print:hidden mx-auto max-w-6xl rounded-2xl bg-yellow-50 p-5 text-center font-bold">
          القالب لا يحتوي على عناصر محفوظة
        </div>
      ) : labels.length === 0 ? (
        <div className="print:hidden mx-auto max-w-6xl rounded-2xl bg-yellow-50 p-5 text-center font-bold">
          لا توجد ليبلات للطباعة
        </div>
      ) : (
        <section className="labels-print-area mx-auto flex max-w-6xl flex-wrap items-start justify-center gap-5 print:max-w-none print:gap-0">
          {labels.map((label) => (
            <div
              key={label.id}
              className="label-print-item relative shrink-0 overflow-hidden bg-white shadow-lg print:shadow-none"
              style={{
                width: `${selectedTemplate.width_mm}mm`,
                height: `${selectedTemplate.height_mm}mm`,
                backgroundColor: selectedTemplate.background_color || "#FFFFFF",
                border: `1px solid ${selectedTemplate.border_color || "#1E88E5"}`,
                borderRadius: `${selectedTemplate.border_radius || 0}mm`,
                breakInside: "avoid",
                pageBreakInside: "avoid",
              }}
            >
              {fields
                .filter((f) => f.visible !== false)
                .slice()
                .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
                .map((f) => {
                  const type = fieldType(f);
                  const singleLineTypes = ["product_name", "part_number", "reference_number", "packing_qty"];
                  const allowOverflow = singleLineTypes.includes(type);
                  return (
                    <div
                      key={f.id}
                      className={`absolute flex items-center justify-center ${allowOverflow ? "" : "overflow-hidden"}`}
                      style={fieldBoxStyle(f, selectedTemplate)}
                    >
                      {renderField(f, label)}
                    </div>
                  );
                })}
            </div>
          ))}
        </section>
      )}

      <style jsx global>{`
        @media print {
          @page {
            margin: 0;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body * {
            visibility: hidden;
          }

          .labels-print-area,
          .labels-print-area * {
            visibility: visible;
          }

          .labels-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-start !important;
            gap: 0 !important;
          }

          .label-print-item {
            margin: 0 !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          img {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
        }
      `}</style>
    </main>
  );
}