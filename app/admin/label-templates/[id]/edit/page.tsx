"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/* =========================================================================
   TOKENS — نظام ألوان موحّد (بدل الألوان المتضاربة السابقة)
   نستخدم style={{}} بدل كلاسات الألوان بسبب مشكلة Tailwind v4 المعروفة في
   المشروع (راجع ملاحظات المشروع). أي زر أو عنصر جديد لازم يتبع نفس النمط.
   ========================================================================= */
const COLORS = {
  brand: "#0F2A5C", // كحلي GALTEX (نفس لون الشعار على الليبل)
  brandHover: "#173A78",
  brandSoft: "#EEF2FA",
  accent: "#2563EB",
  accentSoft: "#EFF6FF",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  ink: "#0F172A",
  sub: "#64748B",
  line: "#E2E8F0",
  paper: "#FFFFFF",
  canvasBg: "#F8FAFC",
};

/* =========================================================================
   أيقونات SVG صغيرة — بدون أي مكتبة خارجية جديدة (lucide وغيرها) عمداً
   ========================================================================= */
type IconProps = { size?: number; strokeWidth?: number };
const iconBase = (size = 18, strokeWidth = 2) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

const IconPlus = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M12 5v14M5 12h14" /></svg>
);
const IconInfo = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);
const IconSearch = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
);
const IconSave = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></svg>
);
const IconTrash = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
);
const IconArrowBack = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
const IconZoomIn = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2M11 8v6M8 11h6" /></svg>
);
const IconZoomOut = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2M8 11h6" /></svg>
);
const IconMaximize = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M8 3H4v4M16 3h4v4M8 21H4v-4M16 21h4v-4" /></svg>
);
const IconCopy = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M4 16V4h12" /></svg>
);
const IconEye = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
);
const IconLayerFront = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="m12 3 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4" /></svg>
);
const IconLayerBack = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="m12 17 8-4-8-4-8 4 8 4Z" /><path d="m4 12 8 4 8-4" transform="translate(0 -4)" /></svg>
);
const IconChevronUp = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="m6 15 6-6 6 6" /></svg>
);
const IconChevronDown = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="m6 9 6 6 6-6" /></svg>
);
const IconBadge = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M12 2 4 6v6c0 4.5 3.4 7.5 8 10 4.6-2.5 8-5.5 8-10V6l-8-4Z" /></svg>
);
const IconImagePic = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-4 4-3-3-6 6" /></svg>
);
const IconType = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M5 6h14M12 6v13" /></svg>
);
const IconTag = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M3 11V4h7l10 10-7 7L3 11Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
);
const IconPackage = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
);
const IconBarcodeLines = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M4 5v14M8 5v14M11 5v14M15 5v14M18 5v14M20 5v14" /></svg>
);
const IconGridQr = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2v2h-2zM19 14h2v2h-2z" /></svg>
);
const IconHash = ({ size, strokeWidth }: IconProps) => (
  <svg {...iconBase(size, strokeWidth)}><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" /></svg>
);

/* =========================================================================
   أنواع البيانات (بدون تغيير في المنطق)
   ========================================================================= */
type FieldType =
  | "logo"
  | "product_image"
  | "product_name_ar"
  | "part_number"
  | "reference_number"
  | "packing_qty"
  | "barcode"
  | "qr_code"
  | "free_text"
  | "free_image";

type TextAlign = "right" | "center" | "left";

type LabelTemplate = {
  id: string;
  template_name: string;
  width_mm: number;
  height_mm: number;
  template_data?: any;
  is_default?: boolean;
  background_color?: string | null;
  border_color?: string | null;
  border_radius?: number | null;
  is_active?: boolean;
  settings?: any;
  created_at?: string;
};

type TemplateField = {
  id: string;
  type: FieldType;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  visible: boolean;
  text?: string;
  imageData?: string;
  fontSize?: number;
  textAlign?: TextAlign;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  zIndex?: number;
};

type DragState = {
  id: string;
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
};

type ResizeHandle = "tl" | "tr" | "bl" | "br" | "l" | "r" | "t" | "b";

type ResizeState = {
  id: string;
  handle: ResizeHandle;
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
};

type RotateState = {
  id: string;
};

const ADD_ELEMENTS: { type: FieldType; label: string; Icon: (p: IconProps) => React.ReactElement }[] = [
  { type: "logo", label: "Logo", Icon: IconBadge },
  { type: "product_image", label: "Product Image", Icon: IconImagePic },
  { type: "product_name_ar", label: "Product Name", Icon: IconType },
  { type: "part_number", label: "Part Number", Icon: IconTag },
  { type: "reference_number", label: "Reference Number", Icon: IconHash },
  { type: "packing_qty", label: "Packing Qty", Icon: IconPackage },
  { type: "barcode", label: "Barcode", Icon: IconBarcodeLines },
  { type: "qr_code", label: "QR Code", Icon: IconGridQr },
  { type: "free_text", label: "مربع نص حر", Icon: IconType },
  { type: "free_image", label: "صورة حرة", Icon: IconImagePic },
];

const defaultFields: TemplateField[] = [
  { id: "logo", type: "logo", label: "Logo", x: 3, y: 3, w: 22, h: 9, rotate: 0, visible: true, fontSize: 12, textAlign: "center", bold: true, italic: false, underline: false, color: "#0F172A", zIndex: 1 },
  { id: "product_image", type: "product_image", label: "Product Image", x: 3, y: 15, w: 24, h: 18, rotate: 0, visible: true, zIndex: 2 },
  { id: "product_name_ar", type: "product_name_ar", label: "Product Name", x: 31, y: 4, w: 25, h: 9, rotate: 0, visible: true, fontSize: 11, textAlign: "center", bold: true, italic: false, underline: false, color: "#0F172A", zIndex: 3 },
  { id: "part_number", type: "part_number", label: "Part Number", x: 31, y: 16, w: 28, h: 7, rotate: 0, visible: true, fontSize: 10, textAlign: "center", bold: true, italic: false, underline: false, color: "#0F172A", zIndex: 4 },
  { id: "reference_number", type: "reference_number", label: "Reference Number", x: 55, y: 16, w: 22, h: 7, rotate: 0, visible: true, fontSize: 10, textAlign: "center", bold: true, italic: false, underline: false, color: "#0F172A", zIndex: 5 },
  { id: "packing_qty", type: "packing_qty", label: "Packing Qty", x: 31, y: 27, w: 22, h: 7, rotate: 0, visible: true, fontSize: 10, textAlign: "center", bold: true, italic: false, underline: false, color: "#0F172A", zIndex: 6 },
  { id: "barcode", type: "barcode", label: "Barcode", x: 55, y: 26, w: 22, h: 9, rotate: 0, visible: true, zIndex: 7 },
  { id: "qr_code", type: "qr_code", label: "QR Code", x: 65, y: 4, w: 11, h: 11, rotate: 0, visible: true, zIndex: 8 },
];

function normalizeType(type: string): FieldType {
  const t = String(type || "").toLowerCase();
  if (t === "logo") return "logo";
  if (t === "productimage" || t === "product_image") return "product_image";
  if (t === "productname" || t === "product_name" || t === "product_name_ar") return "product_name_ar";
  if (t === "partnumber" || t === "part_number") return "part_number";
  if (t === "referencenumber" || t === "reference_number" || t === "refnumber" || t === "ref_number") return "reference_number";
  if (t === "packingqty" || t === "packing_qty") return "packing_qty";
  if (t === "barcode") return "barcode";
  if (t === "qrcode" || t === "qr_code") return "qr_code";
  if (t === "freetext" || t === "free_text") return "free_text";
  if (t === "freeimage" || t === "free_image") return "free_image";
  return "free_text";
}

function readFields(settings: any, templateData: any): TemplateField[] {
  const raw =
    settings?.fields_array || templateData?.fields_array || settings?.fields || templateData?.fields || [];

  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((field: any, index: number) => ({
      id: String(field.id || `${field.type || "field"}_${index}`),
      type: normalizeType(String(field.type || field.id || "free_text")),
      label: String(field.label || field.type || field.id || "Field"),
      x: Number(field.x ?? 0),
      y: Number(field.y ?? 0),
      w: Number(field.w ?? 10),
      h: Number(field.h ?? 10),
      rotate: Number(field.rotate ?? 0),
      visible: field.visible !== false,
      text: field.text,
      imageData: field.imageData,
      fontSize: Number(field.fontSize ?? 11),
      textAlign: field.textAlign || "center",
      bold: field.bold === true,
      italic: field.italic === true,
      underline: field.underline === true,
      color: field.color || "#0F172A",
      zIndex: Number(field.zIndex ?? index + 1),
    }));
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([key, value]: [string, any], index) => ({
      id: String(value?.id || key),
      type: normalizeType(String(value?.type || key)),
      label: String(value?.label || key),
      x: Number(value?.x ?? 0),
      y: Number(value?.y ?? 0),
      w: Number(value?.w ?? 10),
      h: Number(value?.h ?? 10),
      rotate: Number(value?.rotate ?? 0),
      visible: value?.visible !== false,
      text: value?.text,
      imageData: value?.imageData,
      fontSize: Number(value?.fontSize ?? 11),
      textAlign: value?.textAlign || "center",
      bold: value?.bold === true,
      italic: value?.italic === true,
      underline: value?.underline === true,
      color: value?.color || "#0F172A",
      zIndex: Number(value?.zIndex ?? index + 1),
    }));
  }

  return defaultFields;
}

function fieldTitle(type: FieldType) {
  if (type === "logo") return "Logo";
  if (type === "product_image") return "Product Image";
  if (type === "product_name_ar") return "Product Name";
  if (type === "part_number") return "Part Number";
  if (type === "reference_number") return "Reference Number";
  if (type === "packing_qty") return "Packing Qty";
  if (type === "barcode") return "Barcode";
  if (type === "qr_code") return "QR Code";
  if (type === "free_text") return "مربع نص حر";
  if (type === "free_image") return "صورة حرة";
  return "Field";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/* =========================================================================
   عناصر ثابتة (hoisted) — لا تعتمد على حالة المكوّن، فلا داعي لإعادة إنشائها
   في كل رندر. هذا يفيد الأداء ويسمح لـ React.memo أدناه يشتغل صح.
   ========================================================================= */
function textStyle(field: TemplateField, noWrap?: boolean): React.CSSProperties {
  return {
    width: "100%",
    fontSize: `${field.fontSize || 11}px`,
    textAlign: field.textAlign || "center",
    lineHeight: 1.15,
    whiteSpace: noWrap ? "nowrap" : "pre-wrap",
    overflow: noWrap ? "visible" : "hidden",
    wordBreak: noWrap ? "normal" : "break-word",
    fontWeight: field.bold === false ? 400 : 900,
    fontStyle: field.italic ? "italic" : "normal",
    textDecoration: field.underline ? "underline" : "none",
    color: field.color || "#0F172A",
  };
}

function renderField(field: TemplateField, isUploading?: boolean) {
  if (field.type === "logo") {
    return (
      <div className="text-center leading-none" style={textStyle(field)}>
        <div className="font-black tracking-wide" style={{ color: COLORS.brand }}>GALTEX</div>
        <div className="mt-1 text-[8px] font-bold tracking-[4px]" style={{ color: COLORS.brand }}>GERMANY</div>
      </div>
    );
  }

  if (field.type === "product_image") {
    if (isUploading) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded text-xs font-bold" style={{ backgroundColor: COLORS.brandSoft, color: COLORS.brand }}>
          جاري رفع الصورة...
        </div>
      );
    }
    return field.imageData ? (
      <img src={field.imageData} alt="صورة" loading="lazy" className="h-full w-full object-contain" />
    ) : (
      <div className="flex h-full w-full items-center justify-center rounded bg-slate-50 text-xs text-slate-400">
        صورة المنتج
      </div>
    );
  }

  if (field.type === "product_name_ar") {
    return <div className="w-full font-black text-slate-900" style={textStyle(field, true)}>Description: BRAKE PAD</div>;
  }


  if (field.type === "part_number") {
    return <div className="w-full font-black text-slate-900" style={textStyle(field, true)}>ITEM NO : GFB-1001</div>;
  }

  if (field.type === "reference_number") {
    return <div className="w-full font-black text-slate-900" style={textStyle(field, true)}>Ref: REF-1001</div>;
  }

  if (field.type === "packing_qty") {
    return <div className="w-full font-black text-slate-900" style={textStyle(field, true)}>QTY: 4 PCS</div>;
  }

  if (field.type === "barcode") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden text-center">
        <div className="w-full overflow-hidden text-[20px] leading-none tracking-[-4px]">
          ||||||||||||||||||||||||||||
        </div>
        <div className="text-[9px] leading-none">6281234567890</div>
      </div>
    );
  }

  if (field.type === "qr_code") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-[10px] font-black text-white">
        QR
      </div>
    );
  }

  if (field.type === "free_text") {
    return <div className="w-full font-bold text-slate-900" style={textStyle(field)}>{field.text || "نص حر"}</div>;
  }

  if (field.type === "free_image") {
    if (isUploading) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded text-xs font-bold" style={{ backgroundColor: COLORS.brandSoft, color: COLORS.brand }}>
          جاري رفع الصورة...
        </div>
      );
    }
    return field.imageData ? (
      <img src={field.imageData} alt="صورة حرة" loading="lazy" className="h-full w-full object-contain" />
    ) : (
      <div className="flex h-full w-full items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
        صورة حرة
      </div>
    );
  }

  return null;
}

/* مواضع/مؤشرات المقابض — أرقام بكسل صريحة (بدون كلاسات Tailwind سالبة أو
   كلاسات cursor نادرة، تفاديًا لمشكلة اختفاء الكلاسات غير المستخدمة سابقًا) */
const HANDLE_SIZE = 12;
const HALF_HANDLE = HANDLE_SIZE / 2;

const HANDLE_GEOMETRY: Record<ResizeHandle, React.CSSProperties> = {
  tl: { left: -HALF_HANDLE, top: -HALF_HANDLE, cursor: "nwse-resize" },
  tr: { right: -HALF_HANDLE, top: -HALF_HANDLE, cursor: "nesw-resize" },
  bl: { left: -HALF_HANDLE, bottom: -HALF_HANDLE, cursor: "nesw-resize" },
  br: { right: -HALF_HANDLE, bottom: -HALF_HANDLE, cursor: "nwse-resize" },
  l: { left: -HALF_HANDLE, top: "50%", marginTop: -HALF_HANDLE, cursor: "ew-resize" },
  r: { right: -HALF_HANDLE, top: "50%", marginTop: -HALF_HANDLE, cursor: "ew-resize" },
  t: { top: -HALF_HANDLE, left: "50%", marginLeft: -HALF_HANDLE, cursor: "ns-resize" },
  b: { bottom: -HALF_HANDLE, left: "50%", marginLeft: -HALF_HANDLE, cursor: "ns-resize" },
};

const RESIZE_HANDLES: ResizeHandle[] = ["tl", "tr", "bl", "br", "l", "r", "t", "b"];

/* أنماط CSS خام (بدون كلاسات Tailwind) لمقابض التحكم — تضمن الظهور دايمًا
   بغض النظر عن مشكلة الكلاسات غير المستخدمة سابقًا في المشروع. الألوان
   تُمرَّر عبر CSS variables على عنصر <main> فتبقى نقطة تحكم واحدة. */
const HANDLES_STYLE_TAG = `
  .gtx-field-box { cursor: move; user-select: none; }
  .gtx-handle {
    position: absolute;
    width: ${HANDLE_SIZE}px;
    height: ${HANDLE_SIZE}px;
    background: #ffffff;
    border: 2px solid var(--gtx-accent);
    border-radius: 3px;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.3);
    padding: 0;
    transition: transform 0.08s ease, background-color 0.08s ease;
  }
  .gtx-handle:hover { background: var(--gtx-accent); transform: scale(1.45); }
  .gtx-handle:active { transform: scale(1.2); }
  .gtx-rotate-line {
    position: absolute;
    left: 50%;
    top: -22px;
    width: 2px;
    height: 22px;
    margin-left: -1px;
    background: var(--gtx-accent);
  }
  .gtx-rotate-handle {
    position: absolute;
    top: -46px;
    left: 50%;
    margin-left: -14px;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--gtx-accent);
    border: 2px solid #ffffff;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.35);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    font-size: 14px;
    transition: transform 0.08s ease, background-color 0.08s ease;
  }
  .gtx-rotate-handle:hover { background: var(--gtx-brand); transform: scale(1.12); }
  .gtx-rotate-handle:active { cursor: grabbing; transform: scale(1.0); }
`;

/* =========================================================================
   عنصر واحد داخل مساحة التصميم — Memoized
   بما إن setFields يستبدل فقط العنصر المتغيّر داخل المصفوفة (باقي العناصر
   تحافظ على نفس المرجع/reference)، فـ React.memo هنا يمنع إعادة رندر كل
   العناصر الأخرى أثناء السحب/التكبير/التدوير — وهذا أهم تحسين أداء بالصفحة.
   ========================================================================= */
type FieldItemProps = {
  field: TemplateField;
  template: LabelTemplate;
  isSelected: boolean;
  isUploading: boolean;
  onStartDrag: (e: React.MouseEvent, field: TemplateField) => void;
  onStartResize: (e: React.MouseEvent, field: TemplateField, handle: ResizeHandle) => void;
  onStartRotate: (e: React.MouseEvent, field: TemplateField) => void;
};

function FieldItemImpl({ field, template, isSelected, isUploading, onStartDrag, onStartResize, onStartRotate }: FieldItemProps) {
  return (
    <div
      onMouseDown={(event) => onStartDrag(event, field)}
      className="gtx-field-box absolute flex items-center justify-center"
      style={{
        left: `${(field.x / template.width_mm) * 100}%`,
        top: `${(field.y / template.height_mm) * 100}%`,
        width: `${(field.w / template.width_mm) * 100}%`,
        height: `${(field.h / template.height_mm) * 100}%`,
        transform: `rotate(${field.rotate || 0}deg)`,
        transformOrigin: "center center",
        zIndex: field.zIndex || 1,
        border: isSelected ? `2px solid ${COLORS.accent}` : "1px solid #94A3B8",
        borderRadius: 2,
        overflow: "visible",
      }}
    >
      {renderField(field, isUploading)}

      {isSelected && (
        <>
          {/* مقبض التدوير — اسحبه بالماوس لتدوير العنصر بحرية */}
          <div className="gtx-rotate-line" />
          <button
            type="button"
            title="اسحب للتدوير"
            onMouseDown={(event) => onStartRotate(event, field)}
            className="gtx-rotate-handle"
          >
            ↻
          </button>

          {/* 8 مقابض تكبير/تصغير — زوايا (قطري) + منتصف الأضلاع (طول/عرض فقط) */}
          {RESIZE_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              title="اسحب للتحكم بالحجم"
              onMouseDown={(event) => onStartResize(event, field, handle)}
              className="gtx-handle"
              style={HANDLE_GEOMETRY[handle]}
            />
          ))}
        </>
      )}
    </div>
  );
}

const FieldItem = memo(FieldItemImpl);

/* =========================================================================
   مكوّنات صغيرة لواجهة موحّدة (أزرار/بطاقات)
   ========================================================================= */
function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  tone = "ghost",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "ghost" | "danger";
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: COLORS.brand, color: "#fff", border: `1px solid ${COLORS.brand}` },
    ghost: { backgroundColor: "#fff", color: COLORS.ink, border: `1px solid ${COLORS.line}` },
    danger: { backgroundColor: "#fff", color: COLORS.danger, border: `1px solid #FCA5A5` },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      style={styles[tone]}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SectionCard({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5" style={{ border: `1px solid ${COLORS.line}` }}>
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black text-white"
          style={{ backgroundColor: COLORS.brand }}
        >
          {index}
        </span>
        <h2 className="text-base font-black" style={{ color: COLORS.ink }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

const inputStyle: React.CSSProperties = { border: `1px solid ${COLORS.line}` };

/* =========================================================================
   المكوّن الرئيسي
   ========================================================================= */
export default function EditLabelTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const initialId =
    typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [currentTemplateId, setCurrentTemplateId] = useState<string>(initialId === "new" ? "" : initialId);
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [template, setTemplate] = useState<LabelTemplate | null>(null);
  const [fields, setFields] = useState<TemplateField[]>(defaultFields);
  const [selectedId, setSelectedId] = useState("logo");
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState(6);
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [uploadingImageFieldId, setUploadingImageFieldId] = useState<string | null>(null);

  const [dragging, setDragging] = useState<DragState | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [rotating, setRotating] = useState<RotateState | null>(null);

  const selectedField = useMemo(
    () => fields.find((field) => field.id === selectedId) || null,
    [fields, selectedId]
  );

  const visibleSortedFields = useMemo(
    () => fields.filter((field) => field.visible).slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
    [fields]
  );

  /* ---- refs لأحدث قيم الحالة، تُستخدم داخل مستمعي mousemove/mouseup
     الثابتين (يُضافون مرة واحدة فقط) بدل إعادة تسجيلهم مع كل تغيير حالة ---- */
  const templateRef = useRef(template);
  useEffect(() => { templateRef.current = template; }, [template]);

  const interactionRef = useRef({ dragging, resizing, rotating });
  useEffect(() => { interactionRef.current = { dragging, resizing, rotating }; }, [dragging, resizing, rotating]);

  const rafIdRef = useRef<number | null>(null);
  const lastEventRef = useRef<{ clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadTemplatesList();
      if (currentTemplateId) {
        await loadTemplate(currentTemplateId);
      } else {
        openNewTemplate(false);
      }
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // حارس الصلاحيات: يمنع أي حد ما عنده صلاحية "قوالب الليبل" من فتح
  // الصفحة حتى لو كتب الرابط مباشرة بالمتصفح
  useEffect(() => {
    const role = localStorage.getItem("galtex_admin_role");
   let permitted = role === "admin" || role === "super_admin";

    if (!permitted) {
      try {
        const raw = localStorage.getItem("galtex_admin_permissions");
        const perms = raw ? JSON.parse(raw) : {};
        permitted = Boolean(perms.label_templates);
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

  // ---- تفاعل السحب/التكبير/التدوير: مُسجَّل مرة واحدة + مُقيَّد بمعدّل الفريم ----
  useEffect(() => {
    function processMove(clientX: number, clientY: number) {
      const tpl = templateRef.current;
      const { dragging: d, resizing: r, rotating: rt } = interactionRef.current;
      if (!tpl || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const dxMm = ((clientX - (d?.startMouseX ?? r?.startMouseX ?? 0)) / rect.width) * tpl.width_mm;
      const dyMm = ((clientY - (d?.startMouseY ?? r?.startMouseY ?? 0)) / rect.height) * tpl.height_mm;

      if (d) {
        setFields((current) =>
          current.map((field) =>
            field.id === d.id
              ? {
                  ...field,
                  x: clamp(Number((d.startX + dxMm).toFixed(2)), 0, tpl.width_mm - field.w),
                  y: clamp(Number((d.startY + dyMm).toFixed(2)), 0, tpl.height_mm - field.h),
                }
              : field
          )
        );
      }

      if (r) {
        setFields((current) =>
          current.map((field) => {
            if (field.id !== r.id) return field;

            let nextX = r.startX;
            let nextY = r.startY;
            let nextW = r.startW;
            let nextH = r.startH;

            if (r.handle.includes("r")) nextW = r.startW + dxMm;
            if (r.handle.includes("b")) nextH = r.startH + dyMm;
            if (r.handle.includes("l")) { nextX = r.startX + dxMm; nextW = r.startW - dxMm; }
            if (r.handle.includes("t")) { nextY = r.startY + dyMm; nextH = r.startH - dyMm; }

            nextW = Math.max(2, nextW);
            nextH = Math.max(2, nextH);
            nextX = clamp(nextX, 0, tpl.width_mm - 2);
            nextY = clamp(nextY, 0, tpl.height_mm - 2);

            if (nextX + nextW > tpl.width_mm) nextW = tpl.width_mm - nextX;
            if (nextY + nextH > tpl.height_mm) nextH = tpl.height_mm - nextY;

            return { ...field, x: Number(nextX.toFixed(2)), y: Number(nextY.toFixed(2)), w: Number(nextW.toFixed(2)), h: Number(nextH.toFixed(2)) };
          })
        );
      }

      if (rt) {
        const canvasRect = canvasRef.current!.getBoundingClientRect();
        setFields((current) =>
          current.map((field) => {
            if (field.id !== rt.id) return field;
            const centerX = canvasRect.left + ((field.x + field.w / 2) / tpl.width_mm) * canvasRect.width;
            const centerY = canvasRect.top + ((field.y + field.h / 2) / tpl.height_mm) * canvasRect.height;
            const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI) + 90;
            return { ...field, rotate: Math.round(angle) };
          })
        );
      }
    }

    function handleMove(event: MouseEvent) {
      const { dragging: d, resizing: r, rotating: rt } = interactionRef.current;
      if (!d && !r && !rt) return;

      lastEventRef.current = { clientX: event.clientX, clientY: event.clientY };

      if (rafIdRef.current != null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const last = lastEventRef.current;
        if (last) processMove(last.clientX, last.clientY);
      });
    }

    function handleUp() {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      setDragging(null);
      setResizing(null);
      setRotating(null);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []); // مسجّل مرة واحدة فقط — يقرأ الحالة من refs دائمًا محدّثة

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedField || !template) return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;

      const step = event.shiftKey ? 1 : 0.5;

      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelectedField(); }
      if (event.ctrlKey && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelectedField(); }
      if (event.key === "ArrowUp") { event.preventDefault(); updateSelectedPosition(0, -step); }
      if (event.key === "ArrowDown") { event.preventDefault(); updateSelectedPosition(0, step); }
      if (event.key === "ArrowLeft") { event.preventDefault(); updateSelectedPosition(-step, 0); }
      if (event.key === "ArrowRight") { event.preventDefault(); updateSelectedPosition(step, 0); }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedField, template]);

  async function loadTemplatesList() {
    const { data, error } = await supabase
      .from("label_templates")
      .select("id, template_name, width_mm, height_mm, is_default, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setTemplates([]);
      setMessage("خطأ في استعلام القوالب: " + error.message);
      return [];
    }

    const list = ((data || []) as LabelTemplate[]).filter((item) => item.is_active !== false);
    setTemplates(list);
    return list;
  }

  async function loadTemplate(templateId: string) {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("label_templates")
      .select("id, template_name, width_mm, height_mm, template_data, is_default, background_color, border_color, border_radius, is_active, settings")
      .eq("id", templateId)
      .single();

    if (error || !data) {
      setMessage(error?.message || "لم يتم العثور على القالب");
      setLoading(false);
      return;
    }

    const loaded = data as LabelTemplate;
    // القالب يُحمَّل بالضبط زي ما اتحفظ — بدون أي إضافة تلقائية لعناصر، حتى
    // لو المستخدم حذف عنصرًا كان موجودًا سابقًا؛ الإضافة الوحيدة المسموحة
    // هي يدويًا من شريط "إضافة عنصر".
    const normalized = readFields(loaded.settings || {}, loaded.template_data || {});

    setTemplate(loaded);
    setFields(normalized);
    setSelectedId(normalized[0]?.id || "");
    setCurrentTemplateId(loaded.id);
    setLoading(false);

    // تحسين تلقائي بالخلفية: أي صورة قديمة مخزّنة Base64 (سبب البطء) تُرفع
    // لـ Storage وتُستبدل برابط خفيف. لا يوقف عرض الشاشة، ويكفي "حفظ" بعدها
    // لتثبيت التحسين نهائيًا فيصير فتح القالب سريع من المرة الجاية.
    migrateBase64ImagesToStorage(normalized);
  }

  /* ضغط/تصغير الصورة بالمتصفح قبل الرفع — يحوّل صور الكاميرا الكبيرة (عدة
     ميجابايت) لملف أصغر بكثير بدون فرق واضح بجودة الطباعة على الليبل.
     يحافظ على PNG (للشفافية) ويحوّل الباقي لـ JPEG بجودة عالية. */
  async function compressImageForUpload(source: Blob): Promise<Blob> {
    const MAX_DIMENSION = 1400;

    try {
      const bitmap = await createImageBitmap(source);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const targetW = Math.max(1, Math.round(bitmap.width * scale));
      const targetH = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return source;

      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close?.();

      const keepPng = source.type === "image/png";
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, keepPng ? "image/png" : "image/jpeg", keepPng ? undefined : 0.85)
      );

      // لو الضغط ما قلّل الحجم فعليًا (نادر) نرجع للأصل بدل ما نخسر جودة بدون فايدة
      if (blob && blob.size < source.size) return blob;
      return source;
    } catch {
      return source; // أي متصفح/ملف ما يدعم الضغط يرفع الأصل بدل ما يفشل كليًا
    }
  }

  async function uploadFieldImage(blob: Blob, extHint: string): Promise<string | null> {
    const ext = (extHint || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `label-fields/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("label-template-images")
      .upload(path, blob, { upsert: true, cacheControl: "31536000", contentType: blob.type || undefined });

    if (uploadError) {
      setMessage("فشل رفع الصورة: " + uploadError.message);
      return null;
    }

    const { data } = supabase.storage.from("label-template-images").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function migrateBase64ImagesToStorage(loadedFields: TemplateField[]) {
    const heavy = loadedFields.filter(
      (f) => (f.type === "product_image" || f.type === "free_image") && f.imageData?.startsWith("data:")
    );

    for (const f of heavy) {
      try {
        const original = await (await fetch(f.imageData as string)).blob();
        const compressed = await compressImageForUpload(original);
        const ext = compressed.type === "image/png" ? "png" : "jpg";
        const url = await uploadFieldImage(compressed, ext);
        if (!url) continue;

        setFields((current) => current.map((field) => (field.id === f.id ? { ...field, imageData: url } : field)));
      } catch {
        // فشل ترحيل صورة واحدة لا يوقف الباقي — تبقى بصيغتها القديمة حتى محاولة لاحقة
      }
    }
  }

  function openNewTemplate(showMessage = true) {
    setCurrentTemplateId("");
    setTemplate({
      id: "",
      template_name: "قالب جديد",
      width_mm: 80,
      height_mm: 40,
      template_data: {},
      is_default: false,
      background_color: "#FFFFFF",
      border_color: "#1E88E5",
      border_radius: 2,
      is_active: true,
      settings: {},
    });
    setFields(defaultFields);
    setSelectedId(defaultFields[0].id);
    if (showMessage) setMessage("فتح قالب جديد. عدّل البيانات ثم اضغط حفظ.");
  }

  function updateTemplate(field: keyof LabelTemplate, value: any) {
    if (!template) return;
    setTemplate({ ...template, [field]: value });
  }

  function updateField(fieldKey: keyof TemplateField, value: any) {
    setFields((current) => current.map((field) => (field.id === selectedId ? { ...field, [fieldKey]: value } : field)));
  }

  function updateSelectedPosition(dx: number, dy: number) {
    if (!selectedField || !template) return;
    setFields((current) =>
      current.map((field) => {
        if (field.id !== selectedField.id) return field;
        return {
          ...field,
          x: clamp(Number((field.x + dx).toFixed(2)), 0, template.width_mm - field.w),
          y: clamp(Number((field.y + dy).toFixed(2)), 0, template.height_mm - field.h),
        };
      })
    );
  }

  function fieldsObject() {
    return fields.reduce((acc: any, field) => {
      acc[field.id] = field;
      return acc;
    }, {});
  }

  function cleanSettings() {
    return { ...(template?.settings || {}), fields_array: fields, fields: fieldsObject() };
  }

  async function handleQueryCurrent() {
    setMessage("جاري استعلام القوالب...");
    const list = await loadTemplatesList();
    setMessage(list.length === 0 ? "لا توجد قوالب محفوظة بعد." : "");
    setShowQueryModal(true);
  }

  function handlePickTemplateFromModal(id: string) {
    if (!id) {
      openNewTemplate(true);
      router.replace("/admin/label-templates/new/edit");
    } else {
      loadTemplate(id);
      router.replace(`/admin/label-templates/${id}/edit`);
    }
    setShowQueryModal(false);
  }

  function handleEditMode() {
    setMessage(currentTemplateId ? "أنت تعدّل القالب الحالي." : "أنت في قالب جديد. اضغط حفظ لإنشائه.");
  }

  async function handleSmartSave() {
    if (!template) return;
    const name = template.template_name.trim();
    if (!name) { setMessage("يرجى كتابة اسم القالب أولاً"); return; }

    setSaving(true);
    setMessage("");

    const isNew = !currentTemplateId;

    const { data: savedId, error } = await supabase.rpc("save_label_template_admin", {
      p_id: currentTemplateId || null,
      p_template_name: name,
      p_width_mm: Number(template.width_mm),
      p_height_mm: Number(template.height_mm),
      p_background_color: template.background_color || "#FFFFFF",
      p_border_color: template.border_color || "#1E88E5",
      p_border_radius: Number(template.border_radius || 2),
      p_is_default: template.is_default || false,
      p_settings: cleanSettings(),
      p_template_data: { fields_array: fields },
    });

    setSaving(false);

    if (error) {
      setMessage("فشل الحفظ: " + error.message);
      return;
    }

    setMessage(isNew ? "تم حفظ القالب الجديد بنجاح." : "تم حفظ التعديلات بنجاح.");

    if (savedId) {
      setCurrentTemplateId(savedId as string);
      await loadTemplatesList();
      if (isNew) {
        router.replace(`/admin/label-templates/${savedId}/edit`);
      }
    }
  }

  async function handleDeleteTemplate() {
    if (!currentTemplateId) { setMessage("اختر قالبًا محفوظًا أولًا ثم اضغط حذف."); return; }
    if (!window.confirm("هل أنت متأكد من حذف هذا القالب؟")) return;

    setSaving(true);
    setMessage("جاري حذف القالب...");

    const deletedId = currentTemplateId;
    const { error } = await supabase.rpc("delete_label_template_admin", { p_template_id: deletedId });

    setSaving(false);
    if (error) { setMessage("فشل حذف القالب: " + error.message); return; }

    openNewTemplate(false);
    setCurrentTemplateId("");
    await loadTemplatesList();
    router.replace("/admin/label-templates/new/edit");
    setMessage("تم حذف القالب بنجاح.");
  }

  function handleGoBack() {
    // نستخدم تاريخ المتصفح الفعلي عشان "رجوع" يوديك لنفس الصفحة اللي جيت
    // منها بالضبط (منتجات، لوحة الإدارة، أو أي صفحة ثانية) — بدل وجهة ثابتة
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/admin");
    }
  }

  // أنواع لازم توجد مرة وحدة بس بالقالب — الضغط على "+" وهي موجودة أصلاً
  // يحدّدها بدل ما ينشئ نسخة مكررة فوقها (هذا سبب مشكلة الصور المتكررة).
  const SINGLE_INSTANCE_TYPES: FieldType[] = [
    "logo",
    "product_image",
    "product_name_ar",
    "part_number",
    "reference_number",
    "packing_qty",
    "barcode",
    "qr_code",
  ];

  function addField(type: FieldType, label: string) {
    if (SINGLE_INSTANCE_TYPES.includes(type)) {
      const existing = fields.find((f) => f.type === type);
      if (existing) {
        setSelectedId(existing.id);
        setMessage(`عنصر "${label}" موجود بالفعل بالقالب — تم تحديده بدل إنشاء نسخة مكررة.`);
        return;
      }
    }

    // "صورة حرة" ممكن تحتاج أكثر من نسخة فعلاً (صور زخرفية مختلفة)، لكن لو
    // فيه نسخة فاضية بعد ما رفعتلها صورة، نعيد استخدامها بدل التكديس فوقها
    if (type === "free_image") {
      const existingEmpty = fields.find((f) => f.type === "free_image" && !f.imageData);
      if (existingEmpty) {
        setSelectedId(existingEmpty.id);
        setMessage('يوجد عنصر "صورة حرة" فاضي بالفعل — تم تحديده. ارفع له صورة، أو احذفه لو ما تحتاجه قبل ما تضيف وحدة جديدة.');
        return;
      }
    }

    const maxZ = Math.max(0, ...fields.map((field) => field.zIndex || 0));
    const newField: TemplateField = {
      id: `${type}_${Date.now()}`,
      type,
      label,
      x: 5,
      y: 5,
      w: type === "qr_code" ? 10 : type === "free_image" ? 16 : 22,
      h: type === "qr_code" ? 10 : type === "free_image" ? 12 : 7,
      rotate: 0,
      visible: true,
      text: type === "free_text" ? "اكتب النص هنا" : undefined,
      fontSize: 11,
      textAlign: "center",
      bold: true,
      italic: false,
      underline: false,
      color: "#0F172A",
      zIndex: maxZ + 1,
    };
    setFields((current) => [...current, newField]);
    setSelectedId(newField.id);
  }

  function deleteSelectedField() {
    const next = fields.filter((field) => field.id !== selectedId);
    setFields(next);
    setSelectedId(next[0]?.id || "");
  }

  function duplicateSelectedField() {
    if (!selectedField) return;
    const maxZ = Math.max(0, ...fields.map((field) => field.zIndex || 0));
    const copy: TemplateField = {
      ...selectedField,
      id: `${selectedField.type}_${Date.now()}`,
      label: `${selectedField.label} Copy`,
      x: Number((selectedField.x + 2).toFixed(1)),
      y: Number((selectedField.y + 2).toFixed(1)),
      zIndex: maxZ + 1,
    };
    setFields((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  function moveLayer(action: "front" | "back" | "forward" | "backward") {
    if (!selectedField) return;
    const zValues = fields.map((field) => field.zIndex || 0);
    const maxZ = Math.max(...zValues);
    const minZ = Math.min(...zValues);

    if (action === "front") updateField("zIndex", maxZ + 1);
    if (action === "back") updateField("zIndex", minZ - 1);
    if (action === "forward") updateField("zIndex", (selectedField.zIndex || 0) + 1);
    if (action === "backward") updateField("zIndex", (selectedField.zIndex || 0) - 1);
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedField) return;

    const fieldId = selectedField.id;
    event.target.value = ""; // يسمح برفع نفس الملف مرة ثانية لو احتاج المستخدم

    setUploadingImageFieldId(fieldId);
    setMessage("جاري تحسين الصورة...");

    const compressed = await compressImageForUpload(file);
    const ext = compressed.type === "image/png" ? "png" : "jpg";

    setMessage("جاري رفع الصورة...");
    const url = await uploadFieldImage(compressed, ext);

    setUploadingImageFieldId((current) => (current === fieldId ? null : current));

    if (!url) return; // uploadFieldImage already set an error message

    setFields((current) => current.map((field) => (field.id === fieldId ? { ...field, imageData: url } : field)));
    setMessage("تم رفع الصورة بنجاح.");
  }


  const handleStartDrag = useCallback((event: React.MouseEvent, field: TemplateField) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(field.id);
    setDragging({ id: field.id, startMouseX: event.clientX, startMouseY: event.clientY, startX: field.x, startY: field.y });
  }, []);

  const handleStartResize = useCallback((event: React.MouseEvent, field: TemplateField, handle: ResizeHandle) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(field.id);
    setResizing({
      id: field.id,
      handle,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startX: field.x,
      startY: field.y,
      startW: field.w,
      startH: field.h,
    });
  }, []);

  const handleStartRotate = useCallback((event: React.MouseEvent, field: TemplateField) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(field.id);
    setRotating({ id: field.id });
  }, []);

  if (isAuthorized !== true) return null;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ backgroundColor: COLORS.canvasBg }}>
        <div className="flex items-center gap-3 font-bold" style={{ color: COLORS.sub }}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300" style={{ borderTopColor: COLORS.brand }} />
          جاري تحميل شاشة التصميم...
        </div>
      </main>
    );
  }

  if (!template) {
    return (
      <main className="flex min-h-screen items-center justify-center font-bold" style={{ backgroundColor: COLORS.canvasBg, color: COLORS.danger }}>
        {message}
      </main>
    );
  }

  return (
    <main
      className="min-h-screen"
      style={
        {
          backgroundColor: COLORS.canvasBg,
          "--gtx-accent": COLORS.accent,
          "--gtx-brand": COLORS.brand,
        } as React.CSSProperties
      }
      dir="rtl"
    >
      {/* CSS خام (ليس كلاسات Tailwind) لمقابض التحكم — يضمن ظهورها دائمًا
          بدل الاعتماد على كلاسات لم تُستخدم سابقًا بالمشروع وتختفي أحيانًا */}
      <style>{HANDLES_STYLE_TAG}</style>

      {/* ===== Header / Toolbar ===== */}
      <header className="sticky top-0 z-50 bg-white px-5 py-4" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <div className="mx-auto flex max-w-[2000px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white"
              style={{ backgroundColor: COLORS.brand }}
            >
              GX
            </span>
            <div>
              <h1 className="text-xl font-black" style={{ color: COLORS.ink }}>تعديل قالب الليبل</h1>
              <p className="text-xs font-medium" style={{ color: COLORS.sub }}>
                تحكم حر بالماوس لكل عنصر داخل الليبل — {template.width_mm} × {template.height_mm} مم
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton icon={<IconPlus size={16} />} label="جديد" onClick={() => openNewTemplate(true)} />
            <ToolbarButton icon={<IconInfo size={16} />} label="تعديل" onClick={handleEditMode} />
            <ToolbarButton icon={<IconSearch size={16} />} label="استعلام" onClick={handleQueryCurrent} />
            <ToolbarButton
              icon={<IconTrash size={16} />}
              label="حذف"
              onClick={handleDeleteTemplate}
              disabled={saving}
              tone="danger"
            />
            <span className="mx-1 h-8 w-px" style={{ backgroundColor: COLORS.line }} />
            <ToolbarButton
              icon={<IconSave size={16} />}
              label={saving ? "جاري الحفظ..." : "حفظ"}
              onClick={handleSmartSave}
              disabled={saving}
              tone="primary"
            />
            <ToolbarButton icon={<IconArrowBack size={16} />} label="رجوع" onClick={handleGoBack} />
          </div>
        </div>
      </header>

      {/* ===== شريط إضافة العناصر — كامل العرض تحت الهيدر مباشرة ===== */}
      <div className="bg-white" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <div className="mx-auto flex max-w-[2000px] items-center gap-3 overflow-x-auto px-5 py-3">
          <span className="shrink-0 text-xs font-black" style={{ color: COLORS.sub }}>
            إضافة عنصر:
          </span>
          {ADD_ELEMENTS.map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => addField(type, label)}
              className="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
              style={inputStyle}
              title={`إضافة ${label}`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: COLORS.brandSoft, color: COLORS.brand }}>
                <Icon size={14} />
              </span>
              <span style={{ color: COLORS.ink }}>{label}</span>
              <IconPlus size={12} />
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div
          className="mx-auto mt-5 max-w-[2000px] rounded-xl px-5 py-3 text-center text-sm font-bold"
          style={{ backgroundColor: COLORS.accentSoft, color: COLORS.brand, border: `1px solid #BFDBFE` }}
        >
          {message}
        </div>
      )}

      <div
        className="mx-auto grid max-w-[2000px] gap-5 p-5"
        style={{ gridTemplateColumns: "280px minmax(900px, 1fr) 300px" }}
      >
        {/* ===== Sidebar يسار: القوالب / الإعدادات / إضافة عناصر ===== */}
        <aside className="space-y-5">
          <SectionCard index={1} title="استعلام القوالب">
            <div className="rounded-xl p-4" style={{ backgroundColor: COLORS.canvasBg, border: `1px solid ${COLORS.line}` }}>
              <div className="text-[11px] font-bold" style={{ color: COLORS.sub }}>القالب المفتوح حاليًا</div>
              <div className="mt-1 text-sm font-black" style={{ color: COLORS.ink }}>
                {template.template_name || "قالب جديد"}
              </div>
              <div className="mt-0.5 text-xs font-medium" style={{ color: COLORS.sub }}>
                {template.width_mm} × {template.height_mm} مم
              </div>
            </div>

            <button
              type="button"
              onClick={handleQueryCurrent}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white"
              style={{ backgroundColor: COLORS.brand }}
            >
              <IconSearch size={16} />
              تصفح القوالب المحفوظة
            </button>
          </SectionCard>

          <SectionCard index={2} title="إعدادات القالب">
            <label className="text-xs font-bold" style={{ color: COLORS.sub }}>اسم القالب</label>
            <input
              value={template.template_name || ""}
              onChange={(e) => updateTemplate("template_name", e.target.value)}
              className="mb-4 mt-2 w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              style={inputStyle}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold" style={{ color: COLORS.sub }}>العرض (مم)</label>
                <input
                  type="number"
                  value={template.width_mm}
                  onChange={(e) => updateTemplate("width_mm", Number(e.target.value))}
                  className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-xs font-bold" style={{ color: COLORS.sub }}>الارتفاع (مم)</label>
                <input
                  type="number"
                  value={template.height_mm}
                  onChange={(e) => updateTemplate("height_mm", Number(e.target.value))}
                  className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
                  style={inputStyle}
                />
              </div>
            </div>
          </SectionCard>
        </aside>

        {/* ===== مساحة التصميم ===== */}
        <section
          className="flex flex-col rounded-2xl bg-white p-6"
          style={{ border: `1px solid ${COLORS.line}`, height: "calc(100vh - 170px)", minHeight: 640 }}
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black" style={{ color: COLORS.ink }}>3. مساحة التصميم</h2>
              <p className="mt-1 text-xs font-medium" style={{ color: COLORS.sub }}>
                اسحب العنصر لتحريكه، من 8 مربعات الأطراف لتكبيره/تصغيره طولاً أو عرضًا، ومن المقبض الدائري ↻ لتدويره — كله بالماوس
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-xl p-1" style={{ border: `1px solid ${COLORS.line}` }}>
              <button type="button" onClick={() => setZoom((z) => Math.max(3, z - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: COLORS.ink }}>
                <IconZoomOut size={16} />
              </button>
              <div className="min-w-[52px] text-center text-sm font-bold" style={{ color: COLORS.ink }}>{Math.round((zoom / 6) * 100)}%</div>
              <button type="button" onClick={() => setZoom((z) => Math.min(12, z + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: COLORS.ink }}>
                <IconZoomIn size={16} />
              </button>
              <span className="mx-1 h-5 w-px" style={{ backgroundColor: COLORS.line }} />
              <button type="button" onClick={() => setZoom(6)} title="إعادة الضبط 100%" className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: COLORS.ink }}>
                <IconMaximize size={16} />
              </button>
            </div>
          </div>

          <div
            className="flex flex-1 items-center justify-center overflow-auto rounded-2xl p-10"
            style={{
              minHeight: 0,
              backgroundColor: COLORS.canvasBg,
              backgroundImage: `radial-gradient(${COLORS.line} 1px, transparent 1px)`,
              backgroundSize: `${Math.max(10, zoom * 5)}px ${Math.max(10, zoom * 5)}px`,
            }}
          >
            <div
              ref={canvasRef}
              className="relative overflow-hidden bg-white shadow-xl"
              onMouseDown={() => setSelectedId("")}
              style={{
                width: `${Number(template.width_mm) * zoom}px`,
                height: `${Number(template.height_mm) * zoom}px`,
                backgroundColor: template.background_color || "#FFFFFF",
                border: `2px solid ${template.border_color || "#1E88E5"}`,
                borderRadius: `${template.border_radius || 2}mm`,
                flexShrink: 0,
              }}
            >
              {visibleSortedFields.map((field) => (
                <FieldItem
                  key={field.id}
                  field={field}
                  template={template}
                  isSelected={selectedId === field.id}
                  isUploading={uploadingImageFieldId === field.id}
                  onStartDrag={handleStartDrag}
                  onStartResize={handleStartResize}
                  onStartRotate={handleStartRotate}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ===== يمين: خصائص العنصر + قائمة العناصر (عمود واحد مدمج لإفساح المجال لمساحة التصميم) ===== */}
        <aside className="space-y-5" style={{ maxHeight: "calc(100vh - 170px)", overflowY: "auto" }}>
          <div className="rounded-2xl bg-white p-5" style={{ border: `1px solid ${COLORS.line}` }}>
          <h2 className="mb-4 text-base font-black" style={{ color: COLORS.ink }}>4. خصائص العنصر</h2>

          {!selectedField ? (
            <p className="text-sm font-medium" style={{ color: COLORS.sub }}>اختر عنصرًا من مساحة العمل</p>
          ) : (
            <>
              <div className="mb-5 rounded-xl px-4 py-3 text-sm font-bold" style={{ backgroundColor: COLORS.brandSoft, color: COLORS.brand }}>
                {selectedField.label} — {fieldTitle(selectedField.type)}
              </div>

              {(selectedField.type === "free_text" ||
                selectedField.type === "product_name_ar" ||
                selectedField.type === "part_number" ||
                selectedField.type === "reference_number" ||
                selectedField.type === "packing_qty" ||
                selectedField.type === "logo") && (
                <>
                  <div className="mt-5">
                    <label className="text-xs font-bold" style={{ color: COLORS.sub }}>حجم الخط</label>
                    <input
                      type="number"
                      value={selectedField.fontSize || 11}
                      onChange={(e) => updateField("fontSize", Number(e.target.value))}
                      className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
                      style={inputStyle}
                    />
                  </div>

                  <div className="mt-5">
                    <label className="text-xs font-bold" style={{ color: COLORS.sub }}>المحاذاة</label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {([
                        ["right", "يمين"],
                        ["center", "وسط"],
                        ["left", "يسار"],
                      ] as [TextAlign, string][]).map(([value, label]) => {
                        const active = selectedField.textAlign === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updateField("textAlign", value)}
                            className="rounded-lg px-2 py-2 text-xs font-bold"
                            style={{
                              border: `1px solid ${active ? COLORS.brand : COLORS.line}`,
                              backgroundColor: active ? COLORS.brandSoft : COLORS.paper,
                              color: active ? COLORS.brand : COLORS.ink,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-5">
                    <label className="text-xs font-bold" style={{ color: COLORS.sub }}>نمط الخط</label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {([
                        ["bold", "غامق", { fontWeight: 900 }],
                        ["italic", "مائل", { fontStyle: "italic" }],
                        ["underline", "تسطير", { textDecoration: "underline" }],
                      ] as [keyof TemplateField, string, React.CSSProperties][]).map(([key, label, previewStyle]) => {
                        const active = key === "bold" ? selectedField.bold !== false : Boolean(selectedField[key]);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => updateField(key, !active)}
                            className="rounded-lg px-2 py-2 text-xs"
                            style={{
                              border: `1px solid ${active ? COLORS.brand : COLORS.line}`,
                              backgroundColor: active ? COLORS.brandSoft : COLORS.paper,
                              color: active ? COLORS.brand : COLORS.ink,
                              ...previewStyle,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>


                  <div className="mt-5">
                    <label className="text-xs font-bold" style={{ color: COLORS.sub }}>لون النص</label>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedField.color || "#0F172A"}
                        onChange={(e) => updateField("color", e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded-lg"
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        value={selectedField.color || "#0F172A"}
                        onChange={(e) => updateField("color", e.target.value)}
                        className="w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
                        style={inputStyle}
                        dir="ltr"
                      />
                    </div>
                  </div>
                </>
              )}

              {selectedField.type === "free_text" && (
                <div className="mt-5">
                  <label className="text-xs font-bold" style={{ color: COLORS.sub }}>النص</label>
                  <textarea
                    value={selectedField.text || ""}
                    onChange={(e) => updateField("text", e.target.value)}
                    className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
              )}

              {(selectedField.type === "free_image" || selectedField.type === "product_image") && (
                <div className="mt-5">
                  <label className="text-xs font-bold" style={{ color: COLORS.sub }}>اختيار صورة</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImageFieldId === selectedField.id}
                    className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm outline-none disabled:opacity-50"
                    style={inputStyle}
                  />
                  {uploadingImageFieldId === selectedField.id && (
                    <div className="mt-2 flex items-center gap-2 text-xs font-bold" style={{ color: COLORS.brand }}>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300" style={{ borderTopColor: COLORS.brand }} />
                      جاري رفع الصورة إلى المخزن السحابي...
                    </div>
                  )}
                  <p className="mt-1 text-[11px] font-medium" style={{ color: COLORS.sub }}>
                    الصور تُضغط وتُصغَّر تلقائيًا ثم تُرفع لمخزن الصور بدل تخزينها كاملة — تحميل أسرع دائمًا
                  </p>
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => moveLayer("front")} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold" style={inputStyle}>
                  <IconLayerFront size={14} /> للأمام
                </button>
                <button type="button" onClick={() => moveLayer("back")} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold" style={inputStyle}>
                  <IconLayerBack size={14} /> للخلف
                </button>
                <button type="button" onClick={() => moveLayer("forward")} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold" style={inputStyle}>
                  <IconChevronUp size={14} /> طبقة
                </button>
                <button type="button" onClick={() => moveLayer("backward")} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold" style={inputStyle}>
                  <IconChevronDown size={14} /> طبقة
                </button>
              </div>
            </>
          )}
          </div>

          {/* اختصارات لوحة المفاتيح — مرجع سريع بما إن الحذف/النسخ صارت بالكيبورد فقط */}
          <div className="rounded-2xl p-4 text-xs leading-6" style={{ backgroundColor: COLORS.brandSoft, color: COLORS.brand, border: `1px solid #BFDBFE` }}>
            <b>اختصارات لوحة المفاتيح:</b>
            <br />
            الأسهم: تحريك خفيف
            <br />
            Shift + الأسهم: تحريك أسرع
            <br />
            Delete: حذف العنصر المختار
            <br />
            Ctrl + D: نسخ العنصر المختار
          </div>
        </aside>
      </div>

      {showQueryModal && (
        <TemplateQueryModal
          templates={templates}
          currentTemplateId={currentTemplateId}
          onPick={handlePickTemplateFromModal}
          onClose={() => setShowQueryModal(false)}
        />
      )}
    </main>
  );
}

/* =========================================================================
   شاشة استعلام القوالب — نافذة منبثقة كاملة الشاشة لاختيار قالب.
   كل التنسيق هنا بـ style={{}} صراحةً (بدون fixed/bg-black/60 كـ كلاسات
   Tailwind)، حسب الحل الموثّق بالمشروع لمشكلة النوافذ المنبثقة.
   ========================================================================= */
function TemplateQueryModal({
  templates,
  currentTemplateId,
  onPick,
  onClose,
}: {
  templates: LabelTemplate[];
  currentTemplateId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "85vh",
          backgroundColor: COLORS.paper,
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px",
            borderBottom: `1px solid ${COLORS.line}`,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: COLORS.ink }}>استعلام القوالب</div>
            <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: COLORS.sub }}>
              اختر قالبًا لفتحه في مساحة التصميم
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="إغلاق"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${COLORS.line}`,
              backgroundColor: COLORS.paper,
              color: COLORS.ink,
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <button
              type="button"
              onClick={() => onPick("")}
              style={{
                textAlign: "right",
                borderRadius: 14,
                padding: 16,
                border: `2px dashed ${COLORS.brand}`,
                backgroundColor: COLORS.brandSoft,
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.brand }}>+ قالب جديد</div>
              <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: COLORS.brand }}>
                ابدأ تصميمًا من الصفر
              </div>
            </button>

            {templates.map((item) => {
              const active = currentTemplateId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item.id)}
                  style={{
                    textAlign: "right",
                    borderRadius: 14,
                    padding: 16,
                    border: `2px solid ${active ? COLORS.brand : COLORS.line}`,
                    backgroundColor: active ? COLORS.brandSoft : COLORS.paper,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.ink }}>
                    {item.template_name}
                    {item.is_default && (
                      <span
                        style={{
                          marginRight: 6,
                          fontSize: 10,
                          fontWeight: 800,
                          color: COLORS.brand,
                          backgroundColor: COLORS.brandSoft,
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        افتراضي
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: COLORS.sub }}>
                    {item.width_mm} × {item.height_mm} مم
                  </div>
                </button>
              );
            })}
          </div>

          {templates.length === 0 && (
            <div style={{ padding: "30px 10px", textAlign: "center", fontSize: 13, fontWeight: 700, color: COLORS.sub }}>
              لا توجد قوالب محفوظة بعد — احفظ أول قالب من زر "حفظ" أعلى الصفحة.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
