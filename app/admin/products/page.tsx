"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import * as XLSX from "xlsx";
import { getAdminToken } from "@/lib/admin-session";

type Product = {
  id: string;
  product_name_ar: string | null;
  product_name_en: string | null;
  product_number: string;
  barcode: string | null;
  reference_number: string | null;
  all_references: string | null;
  ean13_barcode: string | null;
  packing_qty: number;
  points: number;
  product_image_url: string | null;
  category_group: string | null;
  category: string | null;
  category_breadcrumb: string | null;
  manufacturer: string | null;
  application: string | null;
  replaces_brands: string | null;
  product_details: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
};

type LabelTemplate = {
  id: string;
  template_name: string;
  width_mm: number;
  height_mm: number;
  is_active: boolean;
  is_default: boolean;
};

type MessageType = "success" | "error" | "";

type ProductForm = {
  product_name_ar: string;
  product_name_en: string;
  product_number: string;
  reference_number: string;
  all_references: string;
  category_group: string;
  category: string;
  category_breadcrumb: string;
  manufacturer: string;
  application: string;
  replaces_brands: string;
  product_details: string;
  packing_qty: string;
  points: string;
};

type ImportSummary = {
  total: number;
  success: number;
  created?: number;
  updated?: number;
  failed: { row?: number; product_number: string; message: string }[];
};

type PrintJob = {
  product: Product;
  quantity: string;
  templateId: string;
};

// وضع استيراد الصور الجماعي:
//   replace = استبدال صور الأصناف التي تملك صورة بالفعل
//   add     = رفع صور للأصناف التي لا تملك صورة (يحمي الموجودة)
type ImageImportMode = "replace" | "add";

const emptyForm: ProductForm = {
  product_name_ar: "",
  product_name_en: "",
  product_number: "",
  reference_number: "",
  all_references: "",
  category_group: "",
  category: "",
  category_breadcrumb: "",
  manufacturer: "",
  application: "",
  replaces_brands: "",
  product_details: "",
  packing_qty: "1",
  points: "0",
};

// عدد الأصناف في الصفحة الواحدة
// عدد الأصناف المعروضة — الباقي يظهر بالبحث فقط
const PAGE_SIZE = 50;

// عدد الأصناف المرسلة في كل دفعة استيراد
const IMPORT_BATCH_SIZE = 200;

// دفعة استيراد الموديلات أكبر لأن الإدراج أخف من الاستيراد المركّب
const APPLICATIONS_BATCH_SIZE = 1000;

// دفعة استيراد الأرقام المرجعية المربوطة بماركاتها
const REFERENCES_BATCH_SIZE = 1000;

// دفعة استيراد الملاحظات
const NOTES_BATCH_SIZE = 1000;

// دفعة استيراد المواصفات الفنية
const SPECS_BATCH_SIZE = 1000;

// فواصل مقبولة بين الأرقام المرجعية: سطر جديد، فاصلة عربية أو إنجليزية،
// فاصلة منقوطة، شرطة عمودية، أو tab
const REFERENCE_SPLIT_PATTERN = /[\n\r,;،|\t]+/;

function splitReferences(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(REFERENCE_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter(Boolean);
}

/* تجريد الرقم من كل ما ليس حرفاً أو رقماً — يجعل هذه كلها متطابقة:
   74 21 356 266  ·  21356266  ·  74-21-356-266  ·  74.21.356.266 */
function stripFormatting(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

// يحذف التكرار (بتجاهل المسافات وحالة الأحرف) ويرجع الأرقام مفصولة بفاصلة
function normalizeReferences(raw: string) {
  const seen = new Set<string>();
  const list: string[] = [];

  splitReferences(raw).forEach((part) => {
    const key = part.replace(/\s+/g, "").toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      list.push(part);
    }
  });

  return list.join(", ");
}

/* شارة الأصناف الجديدة:
   - الأصناف المضافة قبل 30 يوليو 2026 لا تحمل الشارة إطلاقاً (الأصناف القديمة)
   - الأصناف المضافة بعد هذا التاريخ تحمل الشارة 6 أشهر من تاريخ إضافتها ثم تختفي */
const NEW_BADGE_START = new Date("2026-07-30T00:00:00Z").getTime();
const NEW_BADGE_DURATION_MS = 183 * 24 * 60 * 60 * 1000;

function isNewProduct(createdAt: string | null | undefined) {
  if (!createdAt) return false;

  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  if (created < NEW_BADGE_START) return false;

  return Date.now() - created < NEW_BADGE_DURATION_MS;
}

/* كمية التعبئة قد تصل رقماً عادياً (1) أو نصاً وصفياً من الكتالوج:
     "Packaging unit (PU): 10 pcs"  =>  10
     "Packaging unit (PU): 25 m"    =>  25
   نأخذ أول رقم في النص، والافتراضي 1 لو لم نجد رقماً. */
function parsePackingQty(value: any) {
  const raw = String(value ?? "").trim();
  if (!raw) return 1;

  const direct = Number(raw);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);

  const match = raw.match(/\d+/);
  const parsed = match ? Number(match[0]) : 0;

  return parsed > 0 ? parsed : 1;
}

/* يستخرج اسم الملف من رابط التخزين العام:
   https://xxx.supabase.co/storage/v1/object/product-images/200432-123.webp
   => 200432-123.webp */
function storageFileNameFromUrl(url: string | null | undefined) {
  if (!url) return "";
  const parts = String(url).split("/product-images/");
  return parts.length > 1 ? parts[1].split("?")[0] : "";
}

// يقرأ قيمة العمود من صف الإكسل بأي اسم من الأسماء المحتملة (عربي أو إنجليزي)
function pickColumn(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

export default function AdminProductsPage() {
  const router = useRouter();

  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);

  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [keepOldImageUrl, setKeepOldImageUrl] = useState<string | null>(null);

  const [qrQuantities, setQrQuantities] = useState<Record<string, string>>({});
  const [generatingProductId, setGeneratingProductId] = useState<string | null>(null);

  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [isPrintingJob, setIsPrintingJob] = useState(false);

  // البحث الفوري (ما يكتبه المستخدم) والبحث المؤجّل (الذي يُرسل لقاعدة البيانات)
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [categoryGroupFilter, setCategoryGroupFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [applicationFilter, setApplicationFilter] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [totalCount, setTotalCount] = useState(0);

  const [categoryGroups, setCategoryGroups] = useState<string[]>([]);
  const [categoryPairs, setCategoryPairs] = useState<{ group: string | null; name: string }[]>([]);
  const [applications, setApplications] = useState<string[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ group: string | null; category: string | null; path: string }[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");
  // لو رقم الصنف يخص منتج موقوف، نحفظ معرّفه هنا عشان نعرض زر "تفعيل بدل إنشاء جديد"
  const [inactiveDuplicateId, setInactiveDuplicateId] = useState<string | null>(null);
  const [isActivatingDuplicate, setIsActivatingDuplicate] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  // نوع آخر استيراد: منتجات أو موديلات شاحنات (لعنوان صندوق النتيجة)
  const [lastImportKind, setLastImportKind] = useState<"products" | "applications" | "references" | "notes" | "specs" | "iis">("products");

  const [isImportingImages, setIsImportingImages] = useState(false);
  // أي زر يعمل حالياً (عشان نُظهر مؤشّر التقدّم على الزر الصحيح فقط)
  const [importingImagesMode, setImportingImagesMode] = useState<ImageImportMode | null>(null);
  // وضع آخر استيراد اكتمل (لعنوان صندوق النتيجة)
  const [lastImageImportMode, setLastImageImportMode] = useState<ImageImportMode | null>(null);
  const [imageImportSummary, setImageImportSummary] = useState<ImportSummary | null>(null);
  const [imageImportProgress, setImageImportProgress] = useState({ done: 0, total: 0 });

  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // الصورة المكبّرة المعروضة حاليًا (null = ما فيه صورة مكبّرة)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  // الصنف المعروضة أرقامه المرجعية كاملة في نافذة منفصلة
  const [refsModalProduct, setRefsModalProduct] = useState<Product | null>(null);
  // موديلات الشاحنات للصنف المفتوح في نافذة التعديل
  const [productApplications, setProductApplications] = useState<{ brand: string; model: string }[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);
  // نافذة عرض المنتج (قراءة فقط)
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [viewApplications, setViewApplications] = useState<{ brand: string; model: string }[]>([]);
  const [isLoadingViewApplications, setIsLoadingViewApplications] = useState(false);
  // الأرقام المرجعية مربوطة بماركاتها (جدول Comparison numbers)
  const [viewReferences, setViewReferences] = useState<{ brand: string; reference: string }[]>([]);
  const [isLoadingViewReferences, setIsLoadingViewReferences] = useState(false);
  // الأرقام المرجعية بماركاتها داخل نموذج التعديل (قابلة للتحرير)
  const [formReferences, setFormReferences] = useState<{ brand: string; reference: string }[]>([]);
  const [referenceBrands, setReferenceBrands] = useState<string[]>([]);
  // موديلات الشاحنات القابلة للتحرير داخل النموذج
  const [formApplications, setFormApplications] = useState<{ brand: string; model: string }[]>([]);
  const [vehicleBrands, setVehicleBrands] = useState<string[]>([]);
  const [applicationsLoaded, setApplicationsLoaded] = useState(false);
  /* حماية: لا نحفظ الأرقام إلا إذا تأكدنا أنها حُمّلت بنجاح.
     لولا هذا، فشل التحميل يعرض جدولاً فارغاً، والحفظ يمحو أرقام الصنف كلها. */
  const [referencesLoaded, setReferencesLoaded] = useState(false);
  // ملاحظات الصنف (أوصاف من المورّد — خارج البحث عمداً)
  const [viewNotes, setViewNotes] = useState<{ note: string; type: string | null }[]>([]);
  // المواصفات الفنية (Product details)
  const [viewSpecs, setViewSpecs] = useState<{ property: string; value: string }[]>([]);
  /* أرقام الأصناف المعروضة من جدول product_references — المصدر الدقيق.
     العمود النصي all_references أقدم وأنقص، فكان العدد يختلف عن نافذة العرض. */
  const [referencesMap, setReferencesMap] = useState<Record<string, string[]>>({});

  // مصدر واحد لأرقام الصنف: الجدول أولاً، والنص القديم رجوعاً
  function productReferences(product: Product) {
    const mapped = referencesMap[product.product_number];
    return mapped && mapped.length > 0 ? mapped : splitReferences(product.all_references);
  }


  const hasActiveFilters = Boolean(
    categoryGroupFilter || categoryFilter || applicationFilter || manufacturerFilter || brandFilter || statusFilter
  );

  function clearAllFilters() {
    setCategoryGroupFilter("");
    setCategoryFilter("");
    setApplicationFilter("");
    setManufacturerFilter("");
    setBrandFilter("");
    setStatusFilter("");
  }

  // التصنيفات المعروضة تتبع المجموعة المختارة
  const visibleCategories = useMemo(() => {
    const values = new Set<string>();
    categoryPairs.forEach((pair) => {
      if (categoryGroupFilter && pair.group !== categoryGroupFilter) return;
      if (pair.name) values.add(pair.name);
    });
    return Array.from(values).sort();
  }, [categoryPairs, categoryGroupFilter]);

  // قوائم النموذج: التصنيف يتبع المجموعة المختارة، والمسار يتبعهما معاً
  const formCategories = useMemo(() => {
    const values = new Set<string>();
    categoryPairs.forEach((pair) => {
      if (form.category_group && pair.group !== form.category_group) return;
      if (pair.name) values.add(pair.name);
    });
    return Array.from(values).sort();
  }, [categoryPairs, form.category_group]);

  const formBreadcrumbs = useMemo(() => {
    const values = new Set<string>();
    breadcrumbs.forEach((item) => {
      if (form.category_group && item.group !== form.category_group) return;
      if (form.category && item.category !== form.category) return;
      if (item.path) values.add(item.path);
    });
    return Array.from(values).sort();
  }, [breadcrumbs, form.category_group, form.category]);

  const defaultTemplateId = useMemo(() => {
    return templates.find((template) => template.is_default)?.id || templates[0]?.id || "";
  }, [templates]);

  /* تحميل صفحة واحدة فقط من المنتجات — البحث والفلترة والترتيب كلها
     تتم داخل قاعدة البيانات، فعدد الأصناف الكلي لا يؤثر على السرعة */
  const loadProducts = useCallback(async () => {
    setIsLoading(true);

    const { data, error } = await supabase.rpc("get_admin_products_page", {
      p_search: appliedSearch.trim() || null,
      p_category_group: categoryGroupFilter || null,
      p_category: categoryFilter || null,
      p_limit: PAGE_SIZE,
      p_offset: 0,
      p_application: applicationFilter || null,
      p_manufacturer: manufacturerFilter || null,
      p_replaces_brand: brandFilter || null,
      p_status: statusFilter || null,
    });

    if (error) {
      setMessage(error.message || "حدث خطأ أثناء تحميل المنتجات");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const rows = (data?.rows || []) as Product[];
    setProducts(rows);

    // أرقام الخمسين المعروضة فقط — نداء واحد خفيف
    const numbers = rows.map((row) => row.product_number).filter(Boolean);

    if (numbers.length > 0) {
      const { data: refsData } = await supabase.rpc("get_references_map", { p_numbers: numbers });
      setReferencesMap((refsData || {}) as Record<string, string[]>);
    } else {
      setReferencesMap({});
    }
    setTotalCount(Number(data?.total || 0));
    setIsLoading(false);
  }, [appliedSearch, categoryGroupFilter, categoryFilter, applicationFilter, manufacturerFilter, brandFilter, statusFilter]);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase.rpc("get_admin_product_categories");

    if (data) {
      setCategoryGroups((data.groups || []) as string[]);
      setCategoryPairs((data.categories || []) as { group: string | null; name: string }[]);
      setApplications((data.applications || []) as string[]);
      setManufacturers((data.manufacturers || []) as string[]);
      setBrands((data.brands || []) as string[]);
      setBreadcrumbs((data.breadcrumbs || []) as { group: string | null; category: string | null; path: string }[]);
    }
  }, []);

  const loadReferenceBrands = useCallback(async () => {
    const [refsBrands, vehBrands] = await Promise.all([
      supabase.rpc("get_reference_brands"),
      supabase.rpc("get_vehicle_brands"),
    ]);

    setReferenceBrands((refsBrands.data || []) as string[]);
    setVehicleBrands((vehBrands.data || []) as string[]);
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from("label_templates")
      .select("id, template_name, width_mm, height_mm, is_active, is_default")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      setTemplates([]);
      return;
    }

    setTemplates((data || []) as LabelTemplate[]);
  }, []);

  // تحديث كامل: الصفحة الحالية + الإحصائيات + قوائم التصنيف
  const refreshAll = useCallback(async () => {
    await Promise.all([loadProducts(), loadCategories()]);
  }, [loadProducts, loadCategories]);

  // حارس الصلاحيات: يمنع أي حد ما عنده صلاحية "المنتجات" من فتح الصفحة
  // حتى لو كتب الرابط مباشرة بالمتصفح
  useEffect(() => {
    const role = localStorage.getItem("galtex_admin_role");
    let permitted = role === "admin" || role === "super_admin";

    if (!permitted) {
      try {
        const raw = localStorage.getItem("galtex_admin_permissions");
        const perms = raw ? JSON.parse(raw) : {};
        permitted = Boolean(perms.products);
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

  /* تأجيل البحث نصف ثانية بعد آخر حرف — بدل إرسال استعلام لكل حرف */
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  // تحميل الصفحة عند تغيّر البحث أو الفلتر أو رقم الصفحة
  useEffect(() => {
    if (isAuthorized !== true) return;
    loadProducts();
  }, [isAuthorized, loadProducts]);

  // البيانات الثابتة نسبياً: تُحمّل مرة واحدة عند فتح الصفحة
  useEffect(() => {
    if (isAuthorized !== true) return;
    loadCategories();
    loadTemplates();
    loadReferenceBrands();
  }, [isAuthorized, loadCategories, loadTemplates, loadReferenceBrands]);

  // تنظيف رابط معاينة الصورة عند مغادرة الصفحة
  useEffect(() => {
    return () => {
      if (productImagePreview && !keepOldImageUrl) {
        URL.revokeObjectURL(productImagePreview);
      }
    };
  }, [productImagePreview, keepOldImageUrl]);

  /* لو كتب المستخدم رقم صنف أو باركود أو رقم مرجع مطابقاً تماماً،
     نعتبره استخداماً للصنف فيرتفع لأعلى القائمة في التحميل التالي */
  useEffect(() => {
    const q = appliedSearch.trim().toLowerCase();
    if (!q || products.length === 0) return;

    const qPlain = stripFormatting(q);
    if (qPlain.length < 3) return;

    // نتيجة واحدة فقط => هي المقصودة بالتأكيد
    if (products.length === 1) {
      touchProductUsage(products[0].id);
      return;
    }

    // عدة نتائج => نسجّل الصنف الذي طابق البحث حرفياً
    const matched = products.find((product) => {
      const values = [
        product.product_number,
        product.barcode,
        product.ean13_barcode,
        product.reference_number,
        ...splitReferences(product.all_references),
      ];

      return values.some((value) => value && stripFormatting(value) === qPlain);
    });

    if (matched) touchProductUsage(matched.id);
  }, [appliedSearch, products]);

  function updateForm(key: keyof ProductForm, value: string) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function clearMessage() {
    setMessage("");
    setMessageType("");
    setInactiveDuplicateId(null);
  }

  function resetForm() {
    setShowProductModal(false);
    setProductApplications([]);
    setFormApplications([]);
    setFormReferences([]);
    setReferencesLoaded(true);
    setApplicationsLoaded(true);
    removeSelectedImage();
    setForm(emptyForm);
    setEditingProductId(null);
    setKeepOldImageUrl(null);
    clearMessage();
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("يرجى اختيار ملف صورة صحيح");
      setMessageType("error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("حجم الصورة يجب ألا يتجاوز 5 ميجابايت");
      setMessageType("error");
      return;
    }

    if (productImagePreview && !keepOldImageUrl) {
      URL.revokeObjectURL(productImagePreview);
    }

    setProductImage(file);
    setProductImagePreview(URL.createObjectURL(file));
    setKeepOldImageUrl(null);
    clearMessage();
  }

  function removeSelectedImage() {
    if (productImagePreview && !keepOldImageUrl) {
      URL.revokeObjectURL(productImagePreview);
    }

    setProductImage(null);
    setProductImagePreview("");
    setKeepOldImageUrl(null);
  }

  /* ضغط/تصغير الصورة بالمتصفح قبل الرفع.

     الصيغة: WebP أولاً — جودة مماثلة لـ JPEG بحجم أقل 30% تقريباً،
     وهذا فارق كبير مع آلاف الأصناف. المتصفحات القديمة التي لا تدعم
     ترميز WebP ترجع تلقائياً إلى JPEG.

     صور المنتجات فوتوغرافية على خلفية بيضاء، فلا تحتاج شفافية —
     ولهذا نرسم خلفية بيضاء قبل الصورة. */
  async function compressImageForUpload(source: File): Promise<{ blob: Blob; ext: string }> {
    const MAX_DIMENSION = 1400;
    const fallbackExt = source.name.split(".").pop()?.toLowerCase() || "jpg";

    try {
      const bitmap = await createImageBitmap(source);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const targetW = Math.max(1, Math.round(bitmap.width * scale));
      const targetH = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { blob: source, ext: fallbackExt };

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close?.();

      const toBlob = (type: string, quality: number) =>
        new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

      // WebP أولاً
      const webp = await toBlob("image/webp", 0.85);

      // بعض المتصفحات تتجاهل النوع المطلوب وترجع PNG — نتحقق من النوع فعلياً
      if (webp && webp.type === "image/webp") {
        if (webp.size < source.size) return { blob: webp, ext: "webp" };
        // الأصل أصغر (صورة مضغوطة مسبقاً) — نرفعه كما هو
        return { blob: source, ext: fallbackExt };
      }

      // المتصفح لا يدعم ترميز WebP => JPEG
      const jpeg = await toBlob("image/jpeg", 0.85);

      if (jpeg && jpeg.size < source.size) {
        return { blob: jpeg, ext: "jpg" };
      }

      return { blob: source, ext: fallbackExt };
    } catch {
      // أي ملف أو متصفح لا يدعم الضغط يرفع الأصل بدل أن يفشل كليًا
      return { blob: source, ext: fallbackExt };
    }
  }

  async function uploadProductImage(cleanProductNumber: string) {
    if (!productImage) return keepOldImageUrl || null;

    const { blob, ext } = await compressImageForUpload(productImage);
    const safeProductNumber = cleanProductNumber.replace(/[^a-zA-Z0-9_-]/g, "-");
    const fileName = `${safeProductNumber}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, blob, {
        cacheControl: "3600",
        upsert: false,
        contentType: blob.type || productImage.type,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "فشل رفع صورة المنتج");
    }

    const { data } = supabase.storage.from("product-images").getPublicUrl(fileName);
    return data.publicUrl;
  }

  // موديلات الشاحنات والأرقام المرجعية — تُقرأ عند فتح نافذة التعديل
  async function loadProductApplications(productNumber: string) {
    setIsLoadingApplications(true);
    setProductApplications([]);
    setFormApplications([]);
    setFormReferences([]);
    setReferencesLoaded(false);
    setApplicationsLoaded(false);

    const [appsResult, refsResult] = await Promise.all([
      supabase.rpc("get_product_applications", { p_product_number: productNumber }),
      supabase.rpc("get_product_references", { p_product_number: productNumber }),
    ]);

    if (!appsResult.error) {
      const list = (appsResult.data || []) as { brand: string; model: string }[];
      setProductApplications(list);
      setFormApplications(list);
      setApplicationsLoaded(true);
    }

    if (!refsResult.error) {
      setFormReferences((refsResult.data || []) as { brand: string; reference: string }[]);
      setReferencesLoaded(true);
    }

    setIsLoadingApplications(false);
  }

  // فتح نافذة عرض المنتج مع موديلاته — قراءة فقط بلا أي تعديل
  async function openViewProduct(product: Product) {
    setViewProduct(product);
    touchProductUsage(product.id);
    setViewApplications([]);
    setViewReferences([]);
    setViewNotes([]);
    setViewSpecs([]);
    setIsLoadingViewApplications(true);
    setIsLoadingViewReferences(true);

    // الأربعة بالتوازي — أسرع من واحد بعد الآخر
    const [appsResult, refsResult, notesResult, specsResult] = await Promise.all([
      supabase.rpc("get_product_applications", { p_product_number: product.product_number }),
      supabase.rpc("get_product_references", { p_product_number: product.product_number }),
      supabase.rpc("get_product_notes", { p_product_number: product.product_number }),
      supabase.rpc("get_product_specs", { p_product_number: product.product_number }),
    ]);

    setViewNotes((notesResult.data || []) as { note: string; type: string | null }[]);
    setViewSpecs((specsResult.data || []) as { property: string; value: string }[]);

    setViewApplications((appsResult.data || []) as { brand: string; model: string }[]);
    setIsLoadingViewApplications(false);

    setViewReferences((refsResult.data || []) as { brand: string; reference: string }[]);
    setIsLoadingViewReferences(false);
  }

  // تسجيل استخدام الصنف — يرفعه لأعلى القائمة في التحميل التالي
  async function touchProductUsage(productId: string) {
    await supabase.rpc("touch_product_usage", { p_product_id: productId });
  }

  /* حفظ الأرقام المرجعية بماركاتها.
     الأرقام تُدمج أيضاً في خانة "كل الأرقام المرجعية" لأنها أساس البحث،
     فلا يضيع رقم أضفته هنا من نتائج البحث. */
  async function saveFormReferences(productNumber: string) {
    // لم تُحمَّل الأرقام بنجاح => لا نحفظ شيئاً حتى لا نمحو الموجود
    if (!referencesLoaded) return "";

    const rows = formReferences
      .map((row) => ({ brand: row.brand.trim(), reference: row.reference.trim() }))
      .filter((row) => row.brand && row.reference);

    const { data, error } = await supabase.rpc("save_product_references", {
      p_product_number: productNumber,
      p_rows: rows,
    });

    if (error || !data?.success) {
      return data?.message || error?.message || "تعذر حفظ الأرقام المرجعية";
    }

    return "";
  }

  /* حفظ موديلات الشاحنات. مثل الأرقام: لا نحفظ إن لم تُحمَّل بنجاح
     حتى لا يمحو الجدول الفارغ موديلات الصنف. */
  async function saveFormApplications(productNumber: string) {
    if (!applicationsLoaded) return "";

    const rows = formApplications
      .map((row) => ({ brand: row.brand.trim(), model: row.model.trim() }))
      .filter((row) => row.brand && row.model);

    const { data, error } = await supabase.rpc("save_product_applications", {
      p_product_number: productNumber,
      p_rows: rows,
    });

    if (error || !data?.success) {
      return data?.message || error?.message || "تعذر حفظ الموديلات";
    }

    return "";
  }

  // يدمج أرقام الجدول داخل الخانة النصية بلا تكرار
  function mergeReferencesIntoText(currentText: string) {
    const existing = splitReferences(currentText);
    const seen = new Set(existing.map((v) => stripFormatting(v)));
    const merged = [...existing];

    formReferences.forEach((row) => {
      const value = row.reference.trim();
      if (!value) return;

      const key = stripFormatting(value);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(value);
      }
    });

    return merged.join(", ");
  }

  function validateForm() {
    const cleanProductNumber = form.product_number.trim();

    if (!cleanProductNumber) return "يرجى إدخال رقم الصنف";

    if (!form.product_name_ar.trim() && !form.product_name_en.trim()) {
      return "يرجى إدخال اسم المنتج";
    }

    const numericPackingQty = Number(form.packing_qty);
    const numericPoints = Number(form.points || "0");

    if (!Number.isInteger(numericPackingQty) || numericPackingQty <= 0) {
      return "كمية التعبئة غير صحيحة";
    }

    if (!Number.isInteger(numericPoints) || numericPoints < 0) {
      return "عدد النقاط غير صحيح";
    }

    return "";
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();

    const validationMessage = validateForm();

    if (validationMessage) {
      setMessage(validationMessage);
      setMessageType("error");
      return;
    }

    setIsSaving(true);

    const cleanProductNumber = form.product_number.trim();
    const numericPackingQty = Number(form.packing_qty);
    const numericPoints = Number(form.points || "0");

    try {
      const imageUrl = await uploadProductImage(cleanProductNumber);

      if (editingProductId) {
        const { data, error } = await supabase.rpc("update_product", {
          p_product_id: editingProductId,
          p_product_name_ar: form.product_name_ar.trim() || null,
          p_product_name_en: form.product_name_en.trim() || null,
          p_product_number: cleanProductNumber,
          p_reference_number: form.reference_number.trim() || null,
          p_packing_qty: numericPackingQty,
          p_points: numericPoints,
          p_product_image_url: imageUrl,
          p_all_references: normalizeReferences(mergeReferencesIntoText(form.all_references)),
          p_category_group: form.category_group.trim(),
          p_category: form.category.trim(),
          p_category_breadcrumb: form.category_breadcrumb.trim(),
          p_manufacturer: form.manufacturer.trim(),
          p_application: form.application.trim(),
          p_replaces_brands: form.replaces_brands.trim(),
          p_product_details: form.product_details.trim(),
        });

        setIsSaving(false);

        if (error || !data?.success) {
          setMessage(data?.message || error?.message || "تعذر تعديل المنتج");
          setMessageType("error");
          return;
        }

        const refsError = await saveFormReferences(cleanProductNumber);
        const appsError = await saveFormApplications(cleanProductNumber);
        const combinedError = refsError || appsError;

        resetForm();
        setMessage(
          combinedError
            ? `تم تعديل المنتج، لكن حدث خطأ: ${combinedError}`
            : data.message || "تم تعديل المنتج بنجاح"
        );
        setMessageType(combinedError ? "error" : "success");
        await refreshAll();
        return;
      }

      const { data, error } = await supabase.rpc("create_product", {
        p_product_name_ar: form.product_name_ar.trim() || null,
        p_product_name_en: form.product_name_en.trim() || null,
        p_product_number: cleanProductNumber,
        p_packing_qty: numericPackingQty,
        p_points: numericPoints,
        p_product_image_url: imageUrl,
        p_reference_number: form.reference_number.trim() || null,
        p_all_references: normalizeReferences(mergeReferencesIntoText(form.all_references)),
        p_category_group: form.category_group.trim() || null,
        p_category: form.category.trim() || null,
        p_category_breadcrumb: form.category_breadcrumb.trim() || null,
        p_manufacturer: form.manufacturer.trim() || null,
        p_application: form.application.trim() || null,
        p_replaces_brands: form.replaces_brands.trim() || null,
        p_product_details: form.product_details.trim() || null,
      });

      setIsSaving(false);

      if (error) {
        setMessage(error.message || "حدث خطأ أثناء إنشاء المنتج");
        setMessageType("error");
        return;
      }

      if (!data?.success) {
        setMessage(data?.message || "تعذر إنشاء المنتج");
        setMessageType("error");
        // لو الرقم يخص منتج موقوف، نحفظ معرّفه لعرض زر "تفعيل بدل إنشاء جديد"
        if (data?.is_inactive_duplicate && data?.existing_product_id) {
          setInactiveDuplicateId(data.existing_product_id);
        }
        return;
      }

      const createRefsError = await saveFormReferences(cleanProductNumber);
      const createAppsError = await saveFormApplications(cleanProductNumber);
      const createError = createRefsError || createAppsError;

      resetForm();
      setMessage(
        createError
          ? `تم إنشاء المنتج، لكن حدث خطأ: ${createError}`
          : `تم إنشاء المنتج بنجاح — الباركود التلقائي: ${data.barcode || "-"}`
      );
      setMessageType(createError ? "error" : "success");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حدث خطأ أثناء رفع الصورة");
      setMessageType("error");
      setIsSaving(false);
    }
  }

  async function handleActivateDuplicate() {
    if (!inactiveDuplicateId) return;

    setIsActivatingDuplicate(true);

    const { data, error } = await supabase.rpc("restore_product", {
      p_product_id: inactiveDuplicateId,
    });

    setIsActivatingDuplicate(false);

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "تعذر تفعيل المنتج");
      setMessageType("error");
      return;
    }

    setMessage(data.message || "تم تفعيل المنتج بنجاح");
    setMessageType("success");
    setInactiveDuplicateId(null);
    resetForm();
    await refreshAll();
  }

  function handleEditProduct(product: Product) {
    setEditingProductId(product.id);
    setShowProductModal(true);
    setForm({
      product_name_ar: product.product_name_ar || "",
      product_name_en: product.product_name_en || "",
      product_number: product.product_number || "",
      reference_number: product.reference_number || "",
      all_references: product.all_references || "",
      category_group: product.category_group || "",
      category: product.category || "",
      category_breadcrumb: product.category_breadcrumb || "",
      manufacturer: product.manufacturer || "",
      application: product.application || "",
      replaces_brands: product.replaces_brands || "",
      product_details: product.product_details || "",
      packing_qty: String(product.packing_qty || 1),
      points: String(product.points || 0),
    });

    setProductImage(null);
    setProductImagePreview(product.product_image_url || "");
    setKeepOldImageUrl(product.product_image_url || null);
    setMessage("أنت الآن تعدّل المنتج المحدد");
    setMessageType("success");

    loadProductApplications(product.product_number);
    touchProductUsage(product.id);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteProduct(product: Product) {
    setDeleteConfirmProduct(product);
  }

  async function confirmDeleteProduct() {
    if (!deleteConfirmProduct) return;

    const product = deleteConfirmProduct;
    setIsDeleting(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("delete_product", {
      p_product_id: product.id,
    });

    setIsDeleting(false);
    setDeleteConfirmProduct(null);

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "تعذر حذف المنتج");
      setMessageType("error");
      return;
    }

    setMessage(data.message || "تم حذف/إيقاف المنتج بنجاح");
    setMessageType("success");

    if (editingProductId === product.id) resetForm();
    await refreshAll();
  }

  async function handleRestoreProduct(product: Product) {
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("restore_product", {
      p_product_id: product.id,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "تعذر تفعيل المنتج");
      setMessageType("error");
      return;
    }

    setMessage(data.message || "تم تفعيل المنتج بنجاح");
    setMessageType("success");
    await refreshAll();
  }

  async function handleGenerateQr(product: Product) {
    setMessage("");
    setMessageType("");

    const quantity = Number(qrQuantities[product.id] || "1");

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage("يرجى إدخال عدد صحيح لأكواد QR");
      setMessageType("error");
      return;
    }

    setGeneratingProductId(product.id);

    const { data, error } = await supabase.rpc("generate_qr_batch", {
      p_product_id: product.id,
      p_quantity: quantity,
    });

    if (error) {
      setMessage(error.message || "حدث خطأ أثناء إنشاء أكواد QR");
      setMessageType("error");
      setGeneratingProductId(null);
      return;
    }

    if (!data?.success) {
      setMessage(data?.message || "تعذر إنشاء أكواد QR");
      setMessageType("error");
      setGeneratingProductId(null);
      return;
    }

    await touchProductUsage(product.id);

    setMessage(`تم إنشاء ${quantity} كود QR للمنتج رقم ${product.product_number}`);
    setMessageType("success");
    setGeneratingProductId(null);

    setQrQuantities((previous) => ({ ...previous, [product.id]: "1" }));
  }

  function openPrintModal(product: Product) {
    setPrintJob({
      product,
      quantity: qrQuantities[product.id] || "1",
      templateId: defaultTemplateId,
    });
  }

  function extractGeneratedQrIds(data: any): string[] {
    if (!data) return [];

    const candidates =
      data.ids ||
      data.qr_ids ||
      data.qrIds ||
      data.code_ids ||
      data.codes ||
      data.qr_codes ||
      data.items ||
      data.data ||
      [];

    if (!Array.isArray(candidates)) return [];

    return candidates
      .map((item: any) => {
        if (typeof item === "string") return item;
        return item?.id || item?.qr_id || item?.code_id || "";
      })
      .filter(Boolean);
  }

  async function handleGenerateAndPrint() {
    if (!printJob) return;

    const quantity = Number(printJob.quantity || "1");

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage("يرجى إدخال كمية صحيحة للطباعة");
      setMessageType("error");
      return;
    }

    if (!printJob.templateId) {
      setMessage("يرجى اختيار قالب الليبل أولاً");
      setMessageType("error");
      return;
    }

    setIsPrintingJob(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("generate_qr_batch", {
      p_product_id: printJob.product.id,
      p_quantity: quantity,
    });

    if (error || !data?.success) {
      setMessage(error?.message || data?.message || "تعذر إنشاء أكواد QR");
      setMessageType("error");
      setIsPrintingJob(false);
      return;
    }

    let ids = extractGeneratedQrIds(data);

    if (ids.length === 0) {
      const { data: latestCodes, error: latestError } = await supabase
        .from("qr_codes")
        .select("id")
        .eq("product_id", printJob.product.id)
        .order("created_at", { ascending: false })
        .limit(quantity);

      if (latestError || !latestCodes || latestCodes.length === 0) {
        setMessage("تم إنشاء QR لكن لم أستطع جلب الأكواد للطباعة");
        setMessageType("error");
        setIsPrintingJob(false);
        return;
      }

      ids = latestCodes.map((x: any) => x.id);
    }

    const params = new URLSearchParams();
    params.set("ids", ids.join(","));
    params.set("templateId", printJob.templateId);
    params.set("autoPrint", "1");

    await touchProductUsage(printJob.product.id);

    setPrintJob(null);
    setIsPrintingJob(false);
    router.push(`/admin/labels/print?${params.toString()}`);
  }

  /* استيراد الصور بالجملة — بزرّين منفصلين حسب الوضع (mode):
       "replace" = يستبدل صورة الصنف الذي يملك صورة بالفعل فقط.
                   الصنف بدون صورة → يُتخطّى مع رسالة توجّه للزر الثاني.
       "add"     = يرفع صورة للصنف الذي لا يملك صورة فقط.
                   الصنف الذي يملك صورة → محمي ولا يُستبدل أبداً.
     الجدول يعرض 100 صنف فقط، فنجلب قائمة كاملة مختصرة مرة واحدة
     قبل البدء لنعرف أي صنف يملك صورة وأيها لا. */
  async function handleBulkImageImport(
    event: ChangeEvent<HTMLInputElement>,
    mode: ImageImportMode
  ) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsImportingImages(true);
    setImportingImagesMode(mode);
    setImageImportSummary(null);
    setImageImportProgress({ done: 0, total: files.length });
    setMessage("");
    setMessageType("");

    /* نجلب رقم الصنف وحالة الصورة فقط — لا كل بيانات المنتج.
       هذا يجعل التحضير سريعاً حتى مع عشرات آلاف الأصناف. */
    const { data: statusData, error: statusError } = await supabase.rpc("get_products_image_urls");

    if (statusError) {
      setMessage(statusError.message || "تعذر جلب حالة صور الأصناف");
      setMessageType("error");
      setIsImportingImages(false);
      setImportingImagesMode(null);
      event.target.value = "";
      return;
    }

    /* الدالة ترجع كائناً واحداً { "رقم الصنف": هل يملك صورة } — لا جدول صفوف،
       لأن Supabase يحدّ الجداول بألف صف فتضيع باقي الأصناف. */
    // { "رقم الصنف": "رابط الصورة أو نص فارغ" }
    const imageUrlByNumber = new Map<string, string>();
    Object.entries((statusData || {}) as Record<string, string>).forEach(([number, url]) => {
      imageUrlByNumber.set(String(number).trim(), String(url || ""));
    });

    const imageStatusByNumber = new Map<string, boolean>();
    imageUrlByNumber.forEach((url, number) => imageStatusByNumber.set(number, url !== ""));

    if (imageStatusByNumber.size === 0) {
      setMessage("تعذر تحميل قائمة الأصناف — أعد المحاولة أو حدّث الصفحة");
      setMessageType("error");
      setIsImportingImages(false);
      setImportingImagesMode(null);
      event.target.value = "";
      return;
    }

    const summary: ImportSummary = { total: files.length, success: 0, failed: [] };
    let doneCount = 0;

    // أسماء الصور القديمة — تُحذف دفعة واحدة في النهاية
    const filesToDelete: string[] = [];

    async function processOne(file: File, index: number) {
      const productNumber = file.name.replace(/\.[^/.]+$/, "").trim();

      try {
        if (!file.type.startsWith("image/")) {
          summary.failed.push({ row: index + 1, product_number: productNumber, message: "الملف ليس صورة" });
          return;
        }

        const hasImageValue = imageStatusByNumber.get(productNumber);
        const oldImageUrl = imageUrlByNumber.get(productNumber) || "";

        // الصنف غير موجود إطلاقاً بالنظام
        if (hasImageValue === undefined) {
          summary.failed.push({
            row: index + 1,
            product_number: productNumber,
            message: "الصنف غير موجود في النظام",
          });
          return;
        }

        const hasImage = hasImageValue;

        // زر الاستبدال: يعمل فقط لو الصنف يملك صورة سابقة
        if (mode === "replace" && !hasImage) {
          summary.failed.push({
            row: index + 1,
            product_number: productNumber,
            message: "هذا الصنف لا يملك صورة سابقة — استخدم زر «رفع صور (بدون صورة)»",
          });
          return;
        }

        // زر رفع الجديد: يعمل فقط لو الصنف لا يملك صورة (يحمي الموجودة)
        if (mode === "add" && hasImage) {
          summary.failed.push({
            row: index + 1,
            product_number: productNumber,
            message: "هذا الصنف يملك صورة بالفعل ومحمية — استخدم زر «استبدال صور (لها صورة)»",
          });
          return;
        }

        // اجتاز الفحص — نرفع الصورة للتخزين ونربطها بالصنف
        const { blob: compressedBlob, ext: fileExtension } = await compressImageForUpload(file);
        const safeProductNumber = productNumber.replace(/[^a-zA-Z0-9_-]/g, "-");
        const fileName = `${safeProductNumber}-${Date.now()}-${index}.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(fileName, compressedBlob, {
            cacheControl: "3600",
            upsert: false,
            contentType: compressedBlob.type || file.type,
          });

        if (uploadError) {
          summary.failed.push({ row: index + 1, product_number: productNumber, message: uploadError.message || "فشل رفع الصورة" });
          return;
        }

        const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(fileName);

        const { data, error } = await supabase.rpc("update_product_image", {
          p_product_number: productNumber,
          p_image_url: publicUrlData.publicUrl,
        });

        /* الصورة القديمة تُجمع هنا وتُحذف دفعة واحدة بعد انتهاء الرفع.
           الحذف الفوري بعد كل صورة كان يضيف 2-4 ثوانٍ لكل واحدة. */
        // معطّل مؤقتاً لعزل سبب البطء
        // if (mode === "replace") {
        //   const oldFile = storageFileNameFromUrl(oldImageUrl);
        //   if (oldFile && oldFile !== fileName) filesToDelete.push(oldFile);
        // }

        if (error || !data?.success) {
          summary.failed.push({
            row: index + 1,
            product_number: productNumber,
            message: data?.message || error?.message || "لم يتم ربط الصورة بأي منتج",
          });
          return;
        }

        summary.success++;
      } catch (err) {
        summary.failed.push({
          row: index + 1,
          product_number: productNumber,
          message: err instanceof Error ? err.message : "خطأ غير معروف",
        });
      } finally {
        doneCount += 1;
        setImageImportProgress({ done: doneCount, total: files.length });
      }
    }

    /* 50 صورة بالتوازي. المتصفح يحدّ الاتصالات المتزامنة فعلياً،
       فالرقم سقف لا ضمان — لكنه يستغل الحد الأقصى المتاح. */
    const CONCURRENCY = 50;
    for (let start = 0; start < files.length; start += CONCURRENCY) {
      const batch = files.slice(start, start + CONCURRENCY);
      await Promise.all(batch.map((file, offset) => processOne(file, start + offset)));
    }

    // حذف كل الصور القديمة بنداء واحد — أسرع بكثير من نداء لكل صورة
    // معطّل مؤقتاً
    // if (filesToDelete.length > 0) await deleteStorageFiles(filesToDelete);

    setLastImageImportMode(mode);
    setImageImportSummary(summary);
    setIsImportingImages(false);
    setImportingImagesMode(null);
    event.target.value = "";
    await refreshAll();
  }

  /* استيراد الإكسل الدفعي: يرسل 200 صنف في الاستدعاء الواحد بدل
     استدعاء لكل صف. قاعدة البيانات تقرر لكل صنف:
       - موجود  → تحديث الاسم الإنجليزي والأرقام والتصنيف فقط
       - جديد   → إنشاء كامل
     والخانة الفاضية في الإكسل لا تمسّ البيانات الموجودة إطلاقاً. */
  /* حذف ملفات من التخزين عبر API على الخادم.
     الحذف لا يتم من المتصفح مباشرة: منح صلاحية الحذف لمفتاح anon
     يعني أن أي زائر يستطيع حذف كل صور المنتجات. */
  async function deleteStorageFiles(names: string[]) {
    if (names.length === 0) return { deleted: 0, failed: 0 };

    try {
      const response = await fetch("/api/admin/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", token: getAdminToken(), names }),
      });

      const result = await response.json();
      return { deleted: Number(result?.deleted || 0), failed: Number(result?.failed || 0) };
    } catch {
      return { deleted: 0, failed: names.length };
    }
  }

  /* تنظيف الصور المهجورة: ملفات في التخزين لا يشير إليها أي صنف.
     تتراكم لأن كل استبدال يرفع ملفاً جديداً ولا يحذف القديم،
     وكثرتها تُبطئ رفع الصور بشكل ملحوظ. */
  /* استيراد المواصفات الفنية (Product details).
     نحفظ ترتيب الظهور في المصدر عبر sort_order داخل كل صنف. */
  async function importProductSpecs(sheet: any) {
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const orderByProduct = new Map<string, number>();

    const payload = rows
      .map((row) => {
        const productNumber = pickColumn(row, "GALTEX No.", "GALTEX No", "رقم الصنف");
        const order = (orderByProduct.get(productNumber) || 0) + 1;
        orderByProduct.set(productNumber, order);

        return {
          product_number: productNumber,
          property: pickColumn(row, "Property", "Properties", "الخاصية"),
          value: pickColumn(row, "Value", "Data", "القيمة"),
          sort_order: order,
        };
      })
      .filter((row) => row.product_number && row.property && row.value);

    setImportProgress({ done: 0, total: payload.length });

    let inserted = 0;
    let existing = 0;
    const failed: { product_number: string; message: string }[] = [];

    for (let start = 0; start < payload.length; start += SPECS_BATCH_SIZE) {
      const chunk = payload.slice(start, start + SPECS_BATCH_SIZE);

      const { data, error } = await supabase.rpc("import_product_specs_batch", { p_rows: chunk });

      if (error) {
        failed.push({
          product_number: `الدفعة ${Math.floor(start / SPECS_BATCH_SIZE) + 1}`,
          message: error.message || "فشلت الدفعة كاملة",
        });
      } else {
        inserted += Number(data?.inserted || 0);
        existing += Number(data?.existing || 0);
      }

      setImportProgress({ done: Math.min(start + chunk.length, payload.length), total: payload.length });
    }

    setImportSummary({ total: rows.length, success: inserted + existing, created: inserted, updated: existing, failed });
  }

  /* استيراد قيم IIS — مواصفة منتج مستقلة تصل في ملف خاص بها.
     تُحفظ داخل جدول المواصفات نفسه باسم خاصية ثابت "IIS"،
     فتظهر تلقائياً في جدول المواصفات الفنية بلا أي تغيير في قاعدة البيانات.
     sort_order = 0 يضعها أول الجدول قبل بقية المواصفات. */
  async function importProductIis(sheet: any) {
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const payload = rows
      .map((row) => ({
        product_number: pickColumn(row, "GALTEX No.", "GALTEX No", "رقم الصنف"),
        property: "IIS",
        value: pickColumn(row, "IIS"),
        sort_order: 0,
      }))
      .filter((row) => row.product_number && row.value);

    setImportProgress({ done: 0, total: payload.length });

    let inserted = 0;
    let existing = 0;
    const failed: { product_number: string; message: string }[] = [];

    for (let start = 0; start < payload.length; start += SPECS_BATCH_SIZE) {
      const chunk = payload.slice(start, start + SPECS_BATCH_SIZE);

      const { data, error } = await supabase.rpc("import_product_specs_batch", { p_rows: chunk });

      if (error) {
        failed.push({
          product_number: `الدفعة ${Math.floor(start / SPECS_BATCH_SIZE) + 1}`,
          message: error.message || "فشلت الدفعة كاملة",
        });
      } else {
        inserted += Number(data?.inserted || 0);
        existing += Number(data?.existing || 0);
      }

      setImportProgress({ done: Math.min(start + chunk.length, payload.length), total: payload.length });
    }

    setImportSummary({ total: rows.length, success: inserted + existing, created: inserted, updated: existing, failed });
  }

  /* استيراد ملاحظات الأصناف — أوصاف يضعها المورّد حين لا يوجد رقم مرجعي.
     تُعرض في النافذة ولا تدخل البحث حتى لا تُربك النتائج. */
  async function importProductNotes(sheet: any) {
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const payload = rows
      .map((row) => ({
        product_number: pickColumn(row, "GALTEX No.", "GALTEX No", "رقم الصنف"),
        note: pickColumn(row, "Note", "الملاحظة"),
        note_type: pickColumn(row, "Note Type", "نوع الملاحظة"),
      }))
      .filter((row) => row.product_number && row.note);

    setImportProgress({ done: 0, total: payload.length });

    let inserted = 0;
    let existing = 0;
    const failed: { product_number: string; message: string }[] = [];

    for (let start = 0; start < payload.length; start += NOTES_BATCH_SIZE) {
      const chunk = payload.slice(start, start + NOTES_BATCH_SIZE);

      const { data, error } = await supabase.rpc("import_product_notes_batch", { p_rows: chunk });

      if (error) {
        failed.push({
          product_number: `الدفعة ${Math.floor(start / NOTES_BATCH_SIZE) + 1}`,
          message: error.message || "فشلت الدفعة كاملة",
        });
      } else {
        inserted += Number(data?.inserted || 0);
        existing += Number(data?.existing || 0);
      }

      setImportProgress({ done: Math.min(start + chunk.length, payload.length), total: payload.length });
    }

    setImportSummary({ total: rows.length, success: inserted + existing, created: inserted, updated: existing, failed });
  }

  /* استيراد الأرقام المرجعية مربوطة بماركاتها (جدول Comparison numbers).
     الربط بـ GALTEX No. فقط، والإدراج upsert.
     الأرقام تُحفظ كما هي بمسافاتها ونقاطها — لا تنسيق ولا تجريد. */
  async function importProductReferences(sheet: any) {
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const payload = rows
      .map((row) => ({
        product_number: pickColumn(row, "GALTEX No.", "GALTEX No", "رقم الصنف"),
        brand: pickColumn(row, "Brand", "Replaces", "الماركة"),
        reference_number: pickColumn(row, "Reference Number", "Reference number", "الرقم المرجعي"),
      }))
      .filter((row) => row.product_number && row.brand && row.reference_number);

    setImportProgress({ done: 0, total: payload.length });

    let inserted = 0;
    let existing = 0;
    const failed: { product_number: string; message: string }[] = [];

    for (let start = 0; start < payload.length; start += REFERENCES_BATCH_SIZE) {
      const chunk = payload.slice(start, start + REFERENCES_BATCH_SIZE);

      const { data, error } = await supabase.rpc("import_product_references_batch", {
        p_rows: chunk,
      });

      if (error) {
        failed.push({
          product_number: `الدفعة ${Math.floor(start / REFERENCES_BATCH_SIZE) + 1}`,
          message: error.message || "فشلت الدفعة كاملة",
        });
      } else {
        inserted += Number(data?.inserted || 0);
        existing += Number(data?.existing || 0);
      }

      setImportProgress({ done: Math.min(start + chunk.length, payload.length), total: payload.length });
    }

    setImportSummary({
      total: rows.length,
      success: inserted + existing,
      created: inserted,
      updated: existing,
      failed,
    });
  }

  /* استيراد موديلات الشاحنات من شيت Flat.
     الربط بـ GALTEX No. فقط، والإدراج upsert — إعادة الملف لا تُكرّر شيئاً. */
  async function importVehicleApplications(sheet: any) {
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    /* لاحقة السنوات في المصدر تأتي بنمطين مختلفين حسب الكتالوج:

       (أ) فولفو — الاسم يحمل سنواته أصلاً ثم تُلحق مكررة، فنحذف اللاحقة:
           "FH (4) 2012- 2012 - 0"        =>  "FH (4) 2012-"
           "B12B 2001-2011 2001 - 2011"   =>  "B12B 2001-2011"

       (ب) أكتروس/مان — الاسم مجرّد رمز، واللاحقة هي مصدر السنوات الوحيد
           فحذفها يمحو المعلومة كاملة، فنُبقيها بصيغة مرتّبة:
           "930 2003 - 2008"  =>  "930 2003-2008"
           "TGA 2000 - 0"     =>  "TGA 2000-"      (صفر = وما بعدها)

       الفارق بينهما: هل سنة البداية مكرّرة داخل الاسم أم لا.
       لا نكتفي بالسؤال «هل في الاسم رقم من أربع خانات؟» لأن موديلات مان
       مثل "F 2000" و "L 2000" تحمل 2000 كاسم لا كسنة. */
    const cleanModelName = (value: string) => {
      const raw = String(value || "").trim();
      const match = raw.match(/^(.*?)\s+(\d{4})\s-\s(\d{1,4})$/);
      if (!match) return raw;

      const base = match[1].trim();
      const from = match[2];
      const to = match[3];

      if (base.includes(from)) return base;

      return to === "0" ? `${base} ${from}-` : `${base} ${from}-${to}`;
    };

    const payload = rows
      .map((row) => ({
        product_number: pickColumn(row, "GALTEX No.", "GALTEX No", "رقم الصنف"),
        vehicle_brand: pickColumn(row, "Vehicle Brand", "Brand", "الماركة"),
        model: cleanModelName(pickColumn(row, "Model", "الموديل")),
      }))
      .filter((row) => row.product_number && row.vehicle_brand && row.model);

    setImportProgress({ done: 0, total: payload.length });

    let inserted = 0;
    let existing = 0;
    const failed: { product_number: string; message: string }[] = [];

    for (let start = 0; start < payload.length; start += APPLICATIONS_BATCH_SIZE) {
      const chunk = payload.slice(start, start + APPLICATIONS_BATCH_SIZE);

      const { data, error } = await supabase.rpc("import_product_applications_batch", {
        p_rows: chunk,
      });

      if (error) {
        failed.push({
          product_number: `الدفعة ${Math.floor(start / APPLICATIONS_BATCH_SIZE) + 1}`,
          message: error.message || "فشلت الدفعة كاملة",
        });
      } else {
        inserted += Number(data?.inserted || 0);
        existing += Number(data?.existing || 0);
      }

      setImportProgress({ done: Math.min(start + chunk.length, payload.length), total: payload.length });
    }

    setImportSummary({
      total: rows.length,
      success: inserted + existing,
      created: inserted,
      updated: existing,
      failed,
    });
  }

  async function handleImportExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportSummary(null);
    setImportProgress({ done: 0, total: 0 });
    setMessage("");
    setMessageType("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });

      /* اكتشاف نوع الملف تلقائياً:
         لو فيه شيت اسمه Flat أو أعمدة (Vehicle Brand + Model) => ملف موديلات شاحنات
         غير ذلك => ملف منتجات عادي */
      const flatSheetName =
        workbook.SheetNames.find((name) => name.trim().toLowerCase() === "flat") ||
        workbook.SheetNames.find((name) => {
          const head: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, range: 0 });
          const cells = (head[0] || []).map((c: any) => String(c).trim().toLowerCase());
          return cells.includes("model") && (cells.includes("vehicle brand") || cells.includes("brand"));
        });

      /* ملف المواصفات الفنية: أعمدة (Property + Value) */
      const specsSheetName = workbook.SheetNames.find((name) => {
        const head: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, range: 0 });
        const cells = (head[0] || []).map((c: any) => String(c).trim().toLowerCase());
        return cells.includes("property") && cells.includes("value");
      });

      if (specsSheetName) {
        setLastImportKind("specs");
        await importProductSpecs(workbook.Sheets[specsSheetName]);
        return;
      }

      /* ملف الملاحظات: أعمدة (Note) */
      const notesSheetName = workbook.SheetNames.find((name) => {
        const head: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, range: 0 });
        const cells = (head[0] || []).map((c: any) => String(c).trim().toLowerCase());
        return cells.includes("note") || cells.includes("note type");
      });

      if (notesSheetName) {
        setLastImportKind("notes");
        await importProductNotes(workbook.Sheets[notesSheetName]);
        return;
      }

      /* ملف الأرقام المرجعية: أعمدة (Brand + Reference Number) */
      const refsSheetName = workbook.SheetNames.find((name) => {
        const head: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, range: 0 });
        const cells = (head[0] || []).map((c: any) => String(c).trim().toLowerCase());
        return cells.includes("reference number") && (cells.includes("brand") || cells.includes("replaces"));
      });

      if (refsSheetName) {
        setLastImportKind("references");
        await importProductReferences(workbook.Sheets[refsSheetName]);
        return;
      }

      /* ملف IIS: عمود اسمه IIS.
         يُفحص قبل شيت Flat لأن شيت ملف IIS اسمه "Flat" أيضاً،
         فلولا هذا الترتيب لذهب لمستورد الموديلات ورجع بصفر صف بلا سبب واضح. */
      const iisSheetName = workbook.SheetNames.find((name) => {
        const head: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, range: 0 });
        const cells = (head[0] || []).map((c: any) => String(c).trim().toLowerCase());
        return cells.includes("iis");
      });

      if (iisSheetName) {
        setLastImportKind("iis");
        await importProductIis(workbook.Sheets[iisSheetName]);
        return;
      }

      if (flatSheetName) {
        setLastImportKind("applications");
        await importVehicleApplications(workbook.Sheets[flatSheetName]);
        return;
      }

      setLastImportKind("products");

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const summary: ImportSummary = { total: rows.length, success: 0, created: 0, updated: 0, failed: [] };
      setImportProgress({ done: 0, total: rows.length });

      // تحويل صفوف الإكسل إلى صيغة موحّدة تقبل العناوين العربية والإنجليزية
      const payload = rows.map((row) => ({
        product_number: pickColumn(row, "رقم الصنف", "GALTEX No.", "GALTEX No", "Product Number"),
        name_ar: pickColumn(row, "اسم المنتج بالعربية"),
        name_en: pickColumn(row, "اسم المنتج بالإنجليزية", "Name", "Product Name"),
        reference_number: pickColumn(row, "رقم المرجع", "Main OE"),
        all_references: normalizeReferences(
          pickColumn(
            row,
            "كل الأرقام المرجعية",
            "الأرقام المرجعية",
            "All Reference Numbers",
            "ALL reference",
            "Cross Reference Numbers"
          )
        ),
        category_group: pickColumn(row, "مجموعة التصنيف", "Category Group"),
        category: pickColumn(row, "التصنيف", "Category"),
        category_breadcrumb: pickColumn(row, "مسار التصنيف", "Category Breadcrumb"),
        manufacturer: pickColumn(row, "الشركة الصانعة", "Manufacturer"),
        application: pickColumn(row, "التطبيق", "Application"),
        replaces_brands: pickColumn(row, "يحل محل", "Replaces Brands"),
        product_details: pickColumn(row, "تفاصيل المنتج", "Product Details"),
        packing_qty: parsePackingQty(row["كمية التعبئة"] ?? row["Packing Qty"]),
        points: Math.max(0, Math.floor(Number(row["النقاط"] ?? row["Points"] ?? 0) || 0)),
        image_url: pickColumn(row, "رابط الصورة", "Image"),
      }));

      for (let start = 0; start < payload.length; start += IMPORT_BATCH_SIZE) {
        const chunk = payload.slice(start, start + IMPORT_BATCH_SIZE);

        const { data, error } = await supabase.rpc("import_products_batch", {
          p_rows: chunk,
        });

        if (error) {
          summary.failed.push({
            product_number: `الدفعة ${Math.floor(start / IMPORT_BATCH_SIZE) + 1}`,
            message: error.message || "فشلت الدفعة كاملة",
          });
        } else {
          summary.created = (summary.created || 0) + Number(data?.created || 0);
          summary.updated = (summary.updated || 0) + Number(data?.updated || 0);
          summary.success += Number(data?.created || 0) + Number(data?.updated || 0);

          const failedRows = (data?.failed || []) as { product_number: string; message: string }[];
          failedRows.forEach((item) => summary.failed.push(item));
        }

        setImportProgress({ done: Math.min(start + chunk.length, payload.length), total: payload.length });
      }

      setImportSummary(summary);
      await refreshAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر قراءة ملف الإكسل، تأكد من الصيغة");
      setMessageType("error");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  if (isAuthorized !== true) return null;

  const shownCount = products.length;

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
              <h1 style={{ fontSize: "clamp(24px,2.6vw,32px)", fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#0E2C5C" }}>إدارة المنتجات</h1>
            </div>
            <p style={{ fontSize: 15.5, color: "#586377", margin: 0 }}>إضافة، تعديل، حذف، وإنشاء QR مع طباعة الليبل مباشرة</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => router.push("/admin/label-templates/new/edit")} style={{ background: "#C4952E", border: "none", color: "#0E2C5C", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px 22px", borderRadius: 12, cursor: "pointer" }}>
              إدارة قوالب الليبل
            </button>
          </div>
        </div>

        {message && (
          <div style={{ borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 700, marginBottom: 22, background: messageType === "success" ? "rgba(31,138,91,0.1)" : "rgba(192,57,43,0.08)", border: messageType === "success" ? "1px solid rgba(31,138,91,0.3)" : "1px solid rgba(192,57,43,0.25)", color: messageType === "success" ? "#1F8A5B" : "#C0392B" }}>
            {message}
            {inactiveDuplicateId && (
              <div style={{ marginTop: 12 }}>
                <button type="button" onClick={handleActivateDuplicate} disabled={isActivatingDuplicate} style={{ background: isActivatingDuplicate ? "#9AA3B5" : "#1F8A5B", color: "#fff", border: "none", fontFamily: "inherit", fontWeight: 700, padding: "10px 20px", borderRadius: 11, cursor: isActivatingDuplicate ? "not-allowed" : "pointer" }}>
                  {isActivatingDuplicate ? "جاري التفعيل..." : "فعّل المنتج الموقوف بدل إنشاء جديد"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============== نموذج إضافة/تعديل ============== */}
        <button type="button" onClick={() => setShowProductModal(true)} style={{ background: "#16407F", color: "#FFFDF8", border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: "13px 26px", borderRadius: 12, cursor: "pointer", marginBottom: 20 }}>
          + إضافة منتج جديد
        </button>

        {showProductModal && (
        <div onClick={() => resetForm()} style={{ position: "fixed", inset: 0, background: "rgba(14,44,92,0.45)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "min(900px, 100%)", position: "relative" }}>
          <button type="button" onClick={() => resetForm()} aria-label="إغلاق" style={{ position: "absolute", top: 14, left: 14, zIndex: 5, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(18,44,92,0.08)", color: "#0E2C5C", fontSize: 22, fontWeight: 700, lineHeight: 1, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "26px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: "#0E2C5C" }}>{editingProductId ? "تعديل المنتج" : "إضافة منتج جديد"}</h2>
              <p style={{ fontSize: 14.5, color: "#586377", margin: "4px 0 0" }}>أدخل بيانات المنتج واختر صورة المنتج</p>
            </div>
            {editingProductId && (
              <button type="button" onClick={resetForm} style={{ background: "rgba(18,44,92,0.06)", color: "#586377", border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, padding: "9px 18px", borderRadius: 11, cursor: "pointer" }}>
                إلغاء التعديل
              </button>
            )}
          </div>

          <form onSubmit={handleSaveProduct} style={{ marginTop: 22 }}>
            <div className="gx-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              <InputField label="اسم المنتج بالعربية" value={form.product_name_ar} onChange={(value) => updateForm("product_name_ar", value)} placeholder="مثال: قماشات فرامل" />
              <InputField label="اسم المنتج بالإنجليزية" value={form.product_name_en} onChange={(value) => updateForm("product_name_en", value)} placeholder="Brake Pads" ltr />
              <InputField label="رقم الصنف" value={form.product_number} onChange={(value) => updateForm("product_number", value)} placeholder="مثال: 123456" ltr required />
              <InputField label="رقم المرجع" value={form.reference_number} onChange={(value) => updateForm("reference_number", value)} placeholder="مثال: REF-1001" ltr />
              <InputField label="كمية التعبئة" value={form.packing_qty} onChange={(value) => updateForm("packing_qty", value)} placeholder="1" type="number" ltr />
              <InputField label="إجمالي نقاط المنتج" value={form.points} onChange={(value) => updateForm("points", value)} placeholder="100" type="number" ltr />
            </div>

            {/* ===== الأرقام المرجعية بماركاتها ===== */}
            <div style={{ marginTop: 18, borderTop: "1px solid rgba(18,44,92,0.1)", paddingTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13.5, fontWeight: 700, color: "#33405A" }}>الأرقام المرجعية بماركاتها</label>
                {formReferences.length > 0 && (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#8F6819", background: "rgba(196,149,46,0.16)", borderRadius: 99, padding: "3px 12px" }}>
                    {formReferences.filter((r) => r.brand.trim() && r.reference.trim()).length} رقم
                  </span>
                )}
              </div>

              {formReferences.length > 0 && (
                <div style={{ maxHeight: 260, overflowY: "auto", borderRadius: 12, border: "1px solid rgba(18,44,92,0.12)", background: "#F5F2EC", padding: 10, marginBottom: 10 }}>
                  {formReferences.map((row, index) => (
                    <div key={index} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <input
                        list="gx-ref-brands"
                        value={row.brand}
                        onChange={(event) => {
                          const next = [...formReferences];
                          next[index] = { ...next[index], brand: event.target.value };
                          setFormReferences(next);
                        }}
                        placeholder="الماركة"
                        dir="ltr"
                        className="gx-in"
                        style={{ flex: "0 0 36%", minWidth: 0, fontFamily: "inherit", fontSize: 13.5, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 10, padding: "9px 12px", background: "#FFFFFF", color: "#0E2C5C" }}
                      />
                      <input
                        value={row.reference}
                        onChange={(event) => {
                          const next = [...formReferences];
                          next[index] = { ...next[index], reference: event.target.value };
                          setFormReferences(next);
                        }}
                        placeholder="الرقم المرجعي"
                        dir="ltr"
                        className="gx-in"
                        style={{ flex: 1, minWidth: 0, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 10, padding: "9px 12px", background: "#FFFFFF", color: "#16407F" }}
                      />
                      <button
                        type="button"
                        onClick={() => setFormReferences(formReferences.filter((_, i) => i !== index))}
                        aria-label="حذف الرقم"
                        style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, border: "none", background: "rgba(192,57,43,0.1)", color: "#C0392B", fontSize: 17, fontWeight: 700, lineHeight: 1, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <datalist id="gx-ref-brands">
                {referenceBrands.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>

              {editingProductId && !referencesLoaded && !isLoadingApplications && (
                <p style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 700, color: "#C0392B" }}>
                  تعذّر تحميل الأرقام المرجعية — لن تُحفظ أي تعديلات عليها. أغلق النافذة وأعد المحاولة.
                </p>
              )}

              <button
                type="button"
                disabled={editingProductId !== null && !referencesLoaded}
                onClick={() => setFormReferences([...formReferences, { brand: "", reference: "" }])}
                style={{ background: "rgba(22,64,127,0.08)", color: "#16407F", border: "1px solid rgba(22,64,127,0.25)", fontFamily: "inherit", fontWeight: 700, fontSize: 13, borderRadius: 10, padding: "9px 18px", cursor: "pointer" }}
              >
                + إضافة رقم مرجعي
              </button>

              <p style={{ marginTop: 8, fontSize: 12.5, color: "#586377" }}>
                اكتب الماركة أو اخترها من القائمة. هذه الأرقام تُضاف تلقائياً لخانة البحث فوق.
              </p>
            </div>

            {/* ===== التصنيف ===== */}
            <div style={{ marginTop: 18, borderTop: "1px solid rgba(18,44,92,0.1)", paddingTop: 18 }}>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 12 }}>التصنيف</label>
              <div className="gx-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
                <SelectOrNewField
                  label="مجموعة التصنيف"
                  value={form.category_group}
                  options={categoryGroups}
                  onChange={(value) => {
                    updateForm("category_group", value);
                    updateForm("category", "");
                    updateForm("category_breadcrumb", "");
                  }}
                />
                <SelectOrNewField
                  label="التصنيف"
                  value={form.category}
                  options={formCategories}
                  onChange={(value) => {
                    updateForm("category", value);
                    updateForm("category_breadcrumb", "");
                  }}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <SelectOrNewField
                  label="مسار التصنيف الكامل"
                  value={form.category_breadcrumb}
                  options={formBreadcrumbs}
                  onChange={(value) => updateForm("category_breadcrumb", value)}
                />
              </div>

              <div className="gx-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16, marginTop: 16 }}>
                <SelectOrNewField label="الشركة الصانعة" value={form.manufacturer} options={manufacturers} onChange={(value) => updateForm("manufacturer", value)} />
                <SelectOrNewField label="التطبيق" value={form.application} options={applications} onChange={(value) => updateForm("application", value)} />
              </div>

              {/* يحل محل ماركات: قيمة متعددة — ماركة في كل سطر */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13.5, fontWeight: 700, color: "#33405A" }}>يحل محل ماركات</label>
                  <select
                    value=""
                    onChange={(event) => {
                      const picked = event.target.value;
                      if (!picked) return;
                      const current = splitReferences(form.replaces_brands);
                      if (!current.some((b) => b.toLowerCase() === picked.toLowerCase())) {
                        updateForm("replaces_brands", [...current, picked].join("\n"));
                      }
                      event.target.value = "";
                    }}
                    className="gx-in"
                    style={{ minWidth: 190, borderRadius: 10, border: "1px solid rgba(18,44,92,0.18)", background: "#FBF3DC", padding: "8px 12px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#8F6819" }}
                  >
                    <option value="">＋ أضف ماركة من القائمة</option>
                    {brands.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>

                {splitReferences(form.replaces_brands).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {splitReferences(form.replaces_brands).map((brand, index) => (
                      <span key={`${brand}-${index}`} dir="ltr" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#0E2C5C", background: "rgba(196,149,46,0.14)", border: "1px solid rgba(196,149,46,0.3)", borderRadius: 99, padding: "4px 10px" }}>
                        {brand}
                        <button
                          type="button"
                          onClick={() => {
                            const rest = splitReferences(form.replaces_brands).filter((_, i) => i !== index);
                            updateForm("replaces_brands", rest.join("\n"));
                          }}
                          aria-label="حذف الماركة"
                          style={{ border: "none", background: "none", color: "#C0392B", fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: "pointer", padding: 0 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <textarea
                  value={form.replaces_brands}
                  onChange={(event) => updateForm("replaces_brands", event.target.value)}
                  placeholder={"Renault\nVolvo"}
                  dir="ltr"
                  rows={3}
                  className="gx-in"
                  style={{ width: "100%", fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "10px 14px", background: "#FFFFFF", color: "#0E2C5C", resize: "vertical" }}
                />
                <p style={{ marginTop: 6, fontSize: 12.5, color: "#586377" }}>ماركة في كل سطر — لا تكتبها متلاصقة.</p>
              </div>

              <div style={{ marginTop: 16 }}>
                <InputField label="تفاصيل المنتج" value={form.product_details} onChange={(value) => updateForm("product_details", value)} placeholder="تفاصيل إضافية" ltr />
              </div>
            </div>

            {/* ===== موديلات الشاحنات (قابلة للتحرير) ===== */}
            <div style={{ marginTop: 18, borderTop: "1px solid rgba(18,44,92,0.1)", paddingTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13.5, fontWeight: 700, color: "#33405A" }}>موديلات الشاحنات</label>
                {formApplications.length > 0 && (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#16407F", background: "rgba(22,64,127,0.1)", borderRadius: 99, padding: "3px 12px" }}>
                    {formApplications.filter((r) => r.brand.trim() && r.model.trim()).length} موديل
                  </span>
                )}
              </div>

              {editingProductId && isLoadingApplications && (
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#7A8498" }}>جاري تحميل الموديلات...</p>
              )}

              {editingProductId && !applicationsLoaded && !isLoadingApplications && (
                <p style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 700, color: "#C0392B" }}>
                  تعذّر تحميل الموديلات — لن تُحفظ أي تعديلات عليها. أغلق النافذة وأعد المحاولة.
                </p>
              )}

              {formApplications.length > 0 && (
                <div style={{ maxHeight: 260, overflowY: "auto", borderRadius: 12, border: "1px solid rgba(18,44,92,0.12)", background: "#F5F2EC", padding: 10, marginBottom: 10 }}>
                  {formApplications.map((row, index) => (
                    <div key={index} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <input
                        list="gx-vehicle-brands"
                        value={row.brand}
                        onChange={(event) => {
                          const next = [...formApplications];
                          next[index] = { ...next[index], brand: event.target.value };
                          setFormApplications(next);
                        }}
                        placeholder="الماركة"
                        dir="ltr"
                        className="gx-in"
                        style={{ flex: "0 0 36%", minWidth: 0, fontFamily: "inherit", fontSize: 13.5, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 10, padding: "9px 12px", background: "#FFFFFF", color: "#0E2C5C" }}
                      />
                      <input
                        value={row.model}
                        onChange={(event) => {
                          const next = [...formApplications];
                          next[index] = { ...next[index], model: event.target.value };
                          setFormApplications(next);
                        }}
                        placeholder="الموديل والسنوات"
                        dir="ltr"
                        className="gx-in"
                        style={{ flex: 1, minWidth: 0, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 10, padding: "9px 12px", background: "#FFFFFF", color: "#16407F" }}
                      />
                      <button
                        type="button"
                        onClick={() => setFormApplications(formApplications.filter((_, i) => i !== index))}
                        aria-label="حذف الموديل"
                        style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, border: "none", background: "rgba(192,57,43,0.1)", color: "#C0392B", fontSize: 17, fontWeight: 700, lineHeight: 1, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <datalist id="gx-vehicle-brands">
                {vehicleBrands.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>

              <button
                type="button"
                disabled={editingProductId !== null && !applicationsLoaded}
                onClick={() => setFormApplications([...formApplications, { brand: "", model: "" }])}
                style={{ background: "rgba(22,64,127,0.08)", color: "#16407F", border: "1px solid rgba(22,64,127,0.25)", fontFamily: "inherit", fontWeight: 700, fontSize: 13, borderRadius: 10, padding: "9px 18px", cursor: "pointer" }}
              >
                + إضافة موديل
              </button>

              <p style={{ marginTop: 8, fontSize: 12.5, color: "#586377" }}>
                مثال: الماركة <span dir="ltr" style={{ fontWeight: 700 }}>Volvo FH</span> والموديل <span dir="ltr" style={{ fontWeight: 700 }}>FH12 1998-2001</span>
              </p>
            </div>

            {editingProductId ? (
              <p style={{ marginTop: 16, fontSize: 13.5, color: "#586377" }}>
                الباركود التلقائي لهذا المنتج: <span style={{ fontWeight: 700, color: "#16407F" }} dir="ltr">{products.find((p) => p.id === editingProductId)?.barcode || "-"}</span>
                {" "}(لا يمكن تعديله)
              </p>
            ) : (
              <p style={{ marginTop: 16, fontSize: 13.5, color: "#586377" }}>
                💡 الباركود سيتولد تلقائياً بعد إنشاء المنتج، ولا حاجة لإدخاله يدوياً.
              </p>
            )}

            <div style={{ marginTop: 22 }}>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 12 }}>صورة المنتج</label>
              {!productImagePreview ? (
                <label style={{ display: "flex", minHeight: 170, width: "100%", cursor: "pointer", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 18, border: "2px dashed #C4952E", background: "#FBF3DC" }}>
                  <div style={{ padding: 24, textAlign: "center" }}>
                    <div style={{ margin: "0 auto", display: "flex", height: 52, width: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, fontSize: 28, fontWeight: 700, color: "#fff", background: "#16407F" }}>+</div>
                    <p style={{ marginTop: 14, fontWeight: 700, color: "#0E2C5C" }}>اختر صورة المنتج</p>
                    <p style={{ marginTop: 6, fontSize: 13.5, color: "#586377" }}>JPG أو PNG وبحجم أقصى 5 ميجابايت</p>
                  </div>
                  <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
                </label>
              ) : (
                <div style={{ borderRadius: 18, border: "1px solid rgba(18,44,92,0.1)", background: "#F5F2EC", padding: 20 }}>
                  <div className="gx-imgrow" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 20 }}>
                    <div style={{ height: 150, width: 150, overflow: "hidden", borderRadius: 16, border: "1px solid rgba(18,44,92,0.15)", background: "#fff", flexShrink: 0 }}>
                      <img src={productImagePreview} alt="معاينة صورة المنتج" style={{ height: "100%", width: "100%", objectFit: "contain" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, color: "#0E2C5C", margin: 0 }}>تم اختيار الصورة</p>
                      <p style={{ marginTop: 8, wordBreak: "break-all", color: "#586377" }} dir="ltr">{productImage?.name || keepOldImageUrl || ""}</p>
                      <button type="button" onClick={removeSelectedImage} style={{ marginTop: 14, background: "#C0392B", color: "#fff", border: "none", fontFamily: "inherit", fontWeight: 700, padding: "10px 18px", borderRadius: 12, cursor: "pointer" }}>
                        حذف الصورة واختيار غيرها
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button type="submit" disabled={isSaving} style={{ marginTop: 22, background: isSaving ? "#9AA3B5" : "#1F8A5B", color: "#fff", border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: "14px 40px", borderRadius: 12, cursor: isSaving ? "not-allowed" : "pointer" }}>
              {isSaving ? "جاري الحفظ..." : editingProductId ? "حفظ التعديل" : "إضافة المنتج"}
            </button>
          </form>
        </section>
        </div>
        </div>
        )}

        {/* ============== قسم المنتجات (الجدول) ============== */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "26px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: "#0E2C5C" }}>المنتجات</h2>
                <p style={{ fontSize: 14.5, color: "#586377", margin: "4px 0 0" }}>
                  {appliedSearch || hasActiveFilters ? (
                    <>عرض {shownCount} من {totalCount} نتيجة{totalCount > PAGE_SIZE ? " — ضيّق البحث لرؤية الباقي" : ""}</>
                  ) : (
                    <>آخر {shownCount} صنف مستخدم من {totalCount} — ابحث للوصول لأي صنف آخر</>
                  )}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "stretch" }}>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو رقم الصنف أو الباركود أو أي رقم مرجعي" className="gx-in" style={{ flex: "1 1 240px", minWidth: 220, borderRadius: 12, border: "1px solid rgba(18,44,92,0.18)", background: "#FFFFFF", padding: "11px 14px", fontFamily: "inherit", fontSize: 14.5, color: "#0E2C5C" }} />

              <label title="يرفع صوراً للأصناف التي لا تملك صورة فقط. الأصناف التي لها صورة محمية ولن تُستبدل." style={{ cursor: "pointer", borderRadius: 12, background: isImportingImages ? "#9AA3B5" : "rgba(31,138,91,0.12)", color: isImportingImages ? "#fff" : "#1F8A5B", border: "1px solid rgba(31,138,91,0.3)", padding: "11px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, textAlign: "center" }}>
                {isImportingImages && importingImagesMode === "add" ? `جاري الرفع... (${imageImportProgress.done}/${imageImportProgress.total})` : "رفع صور (بدون صورة)"}
                <input type="file" accept="image/*" multiple onChange={(e) => handleBulkImageImport(e, "add")} disabled={isImportingImages} style={{ display: "none" }} />
              </label>

              <label title="يستبدل صور الأصناف التي تملك صورة بالفعل. الأصناف بدون صورة تُتخطّى ولا تتغيّر." style={{ cursor: "pointer", borderRadius: 12, background: isImportingImages ? "#9AA3B5" : "rgba(122,64,158,0.12)", color: isImportingImages ? "#fff" : "#7A409E", border: "1px solid rgba(122,64,158,0.3)", padding: "11px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, textAlign: "center" }}>
                {isImportingImages && importingImagesMode === "replace" ? `جاري الاستبدال... (${imageImportProgress.done}/${imageImportProgress.total})` : "استبدال صور (لها صورة)"}
                <input type="file" accept="image/*" multiple onChange={(e) => handleBulkImageImport(e, "replace")} disabled={isImportingImages} style={{ display: "none" }} />
              </label>

              <label style={{ cursor: "pointer", borderRadius: 12, background: isImporting ? "#9AA3B5" : "rgba(196,149,46,0.16)", color: isImporting ? "#fff" : "#8F6819", border: "1px solid rgba(196,149,46,0.35)", padding: "11px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, textAlign: "center" }}>
                {isImporting ? `جاري الاستيراد... (${importProgress.done}/${importProgress.total})` : "استيراد من إكسل"}
                <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} disabled={isImporting} style={{ display: "none" }} />
              </label>

              <button type="button" onClick={refreshAll} disabled={isLoading} style={{ borderRadius: 12, background: isLoading ? "#9AA3B5" : "#16407F", color: "#fff", border: "none", padding: "11px 20px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, cursor: isLoading ? "not-allowed" : "pointer" }}>
                {isLoading ? "جاري التحديث..." : "استعلام المنتجات"}
              </button>
            </div>

            {/* ===== صف الفلاتر ===== */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "rgba(18,44,92,0.03)", borderRadius: 14, padding: "12px 14px" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#586377" }}>فلترة:</span>

              <select value={categoryGroupFilter} onChange={(event) => { setCategoryGroupFilter(event.target.value); setCategoryFilter(""); }} className="gx-in gx-filter">
                <option value="">كل المجموعات</option>
                {categoryGroups.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); }} className="gx-in gx-filter">
                <option value="">كل التصنيفات</option>
                {visibleCategories.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={applicationFilter} onChange={(event) => { setApplicationFilter(event.target.value); }} className="gx-in gx-filter">
                <option value="">كل التطبيقات</option>
                {applications.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={manufacturerFilter} onChange={(event) => { setManufacturerFilter(event.target.value); }} className="gx-in gx-filter">
                <option value="">كل الشركات الصانعة</option>
                {manufacturers.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={brandFilter} onChange={(event) => { setBrandFilter(event.target.value); }} className="gx-in gx-filter">
                <option value="">يحل محل — كل الماركات</option>
                {brands.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); }} className="gx-in gx-filter">
                <option value="">كل الحالات</option>
                <option value="active">فعّال فقط</option>
                <option value="inactive">موقوف فقط</option>
              </select>

              {hasActiveFilters && (
                <button type="button" onClick={clearAllFilters} style={{ borderRadius: 10, background: "rgba(192,57,43,0.1)", color: "#C0392B", border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "9px 16px", cursor: "pointer" }}>
                  مسح الفلاتر
                </button>
              )}
            </div>
          </div>

          {imageImportSummary && (
            <div style={{ marginTop: 20, borderRadius: 16, border: "1px solid rgba(122,64,158,0.25)", background: "rgba(122,64,158,0.06)", padding: 20 }}>
              <p style={{ fontWeight: 700, color: "#7A409E", margin: 0 }}>
                {lastImageImportMode === "add" ? "نتيجة رفع الصور الجديدة" : "نتيجة استبدال الصور"}: {imageImportSummary.success} من {imageImportSummary.total} تم بنجاح
              </p>
              {imageImportSummary.failed.length > 0 && (
                <div style={{ marginTop: 12, maxHeight: 240, overflowY: "auto" }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "#C0392B", margin: "0 0 4px" }}>صور لم تنجح:</p>
                  {imageImportSummary.failed.map((f, idx) => (
                    <p key={`${f.product_number}-${idx}`} style={{ fontSize: 13.5, color: "#C0392B", margin: 0 }}>رقم الصنف: {f.product_number} — {f.message}</p>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setImageImportSummary(null)} style={{ marginTop: 12, background: "none", border: "none", fontSize: 13.5, fontWeight: 700, color: "#7A409E", cursor: "pointer" }}>إغلاق</button>
            </div>
          )}

          {importSummary && (
            <div style={{ marginTop: 20, borderRadius: 16, border: "1px solid #dfe6f2", background: "rgba(22,64,127,0.05)", padding: 20 }}>
              <p style={{ fontWeight: 700, color: "#16407F", margin: 0 }}>
                {lastImportKind === "iis" ? (
                  <>
                    نتيجة استيراد قيم IIS: {importSummary.success} من {importSummary.total} صف
                    {" — "}قيم جديدة: {importSummary.created || 0} · موجودة مسبقاً: {importSummary.updated || 0}
                  </>
                ) : lastImportKind === "specs" ? (
                  <>
                    نتيجة استيراد المواصفات: {importSummary.success} من {importSummary.total} صف
                    {" — "}مواصفات جديدة: {importSummary.created || 0} · موجودة مسبقاً: {importSummary.updated || 0}
                  </>
                ) : lastImportKind === "notes" ? (
                  <>
                    نتيجة استيراد الملاحظات: {importSummary.success} من {importSummary.total} صف
                    {" — "}ملاحظات جديدة: {importSummary.created || 0} · موجودة مسبقاً: {importSummary.updated || 0}
                  </>
                ) : lastImportKind === "references" ? (
                  <>
                    نتيجة استيراد الأرقام المرجعية: {importSummary.success} من {importSummary.total} صف
                    {" — "}أرقام جديدة: {importSummary.created || 0} · موجودة مسبقاً: {importSummary.updated || 0}
                  </>
                ) : lastImportKind === "applications" ? (
                  <>
                    نتيجة استيراد الموديلات: {importSummary.success} من {importSummary.total} صف
                    {" — "}موديلات جديدة: {importSummary.created || 0} · موجودة مسبقاً: {importSummary.updated || 0}
                  </>
                ) : (
                  <>
                    نتيجة الاستيراد: {importSummary.success} من {importSummary.total} تم بنجاح
                    {" — "}أصناف جديدة: {importSummary.created || 0} · أصناف محدَّثة: {importSummary.updated || 0}
                  </>
                )}
              </p>
              {importSummary.failed.length > 0 && (
                <div style={{ marginTop: 12, maxHeight: 260, overflowY: "auto" }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "#C0392B", margin: "0 0 4px" }}>
                    أصناف لم تنجح ({importSummary.failed.length}):
                  </p>
                  {importSummary.failed.map((f, idx) => (
                    <p key={`${f.product_number}-${idx}`} style={{ fontSize: 13.5, color: "#C0392B", margin: 0 }}>
                      رقم الصنف: {f.product_number} — {f.message}
                    </p>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setImportSummary(null)} style={{ marginTop: 12, background: "none", border: "none", fontSize: 13.5, fontWeight: 700, color: "#16407F", cursor: "pointer" }}>إغلاق</button>
            </div>
          )}

          {isLoading ? (
            <div style={{ padding: "64px 0", textAlign: "center", color: "#7A8498" }}>
              <div className="gx-spin" style={{ margin: "0 auto 16px", height: 40, width: 40, borderRadius: "50%", border: "4px solid #dfe6f2", borderTopColor: "#16407F" }} />
              جاري تحميل المنتجات...
            </div>
          ) : products.length === 0 ? (
            <div style={{ marginTop: 26, borderRadius: 18, background: "rgba(18,44,92,0.03)", padding: 48, textAlign: "center", color: "#7A8498" }}>
              <div style={{ margin: "0 auto 16px", display: "flex", height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 16, background: "rgba(18,44,92,0.06)", fontSize: 28 }}>📦</div>
              {appliedSearch || hasActiveFilters
                ? "لا توجد منتجات تطابق البحث أو الفلتر"
                : "لا توجد منتجات بعد — أضف أول منتج من النموذج فوق"}
            </div>
          ) : (
            <>
            <div className="gx-tablewrap" style={{ marginTop: 26, overflowX: "auto", borderRadius: 16, border: "1px solid rgba(18,44,92,0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ fontSize: 13, color: "#586377", background: "rgba(18,44,92,0.04)" }}>
                    <th style={{ padding: "12px 8px", width: 70, fontWeight: 600 }}>الصورة</th>
                    <th style={{ padding: "12px 8px", width: 85, fontWeight: 600 }}>رقم الصنف</th>
                    <th style={{ padding: "12px 8px", width: 85, fontWeight: 600 }}>رقم المرجع</th>
                    <th style={{ padding: "12px 8px", width: 215, fontWeight: 600, color: "#8F6819", background: "rgba(196,149,46,0.14)" }}>كل الأرقام المرجعية</th>
                    <th style={{ padding: "12px 8px", width: 205, fontWeight: 600 }}>اسم المنتج</th>
                    <th style={{ padding: "12px 8px", width: 120, fontWeight: 600 }}>الباركود الثابت</th>
                    <th style={{ padding: "12px 8px", width: 55, fontWeight: 600, textAlign: "center" }}>التعبئة</th>
                    <th style={{ padding: "12px 8px", width: 55, fontWeight: 600, textAlign: "center" }}>النقاط</th>
                    <th style={{ padding: "12px 8px", width: 70, fontWeight: 600, textAlign: "center" }}>الحالة</th>
                    <th style={{ padding: "12px 6px", width: 100, fontWeight: 600, textAlign: "center" }}>إنشاء وطباعة</th>
                    <th style={{ padding: "12px 6px", width: 62, fontWeight: 600, textAlign: "center" }}>تحكم</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    return (
                      <tr key={product.id} className="gx-row" style={{ background: "#FFFFFF" }}>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                          {product.product_image_url ? (
                            <button type="button" onClick={() => setZoomedImage(product.product_image_url)} title="اضغط لتكبير الصورة" style={{ height: 48, width: 48, overflow: "hidden", borderRadius: 12, border: "1px solid rgba(18,44,92,0.15)", background: "#fff", cursor: "pointer", padding: 0 }}>
                              <img src={product.product_image_url} alt={product.product_name_ar || product.product_number} style={{ height: "100%", width: "100%", objectFit: "contain" }} />
                            </button>
                          ) : (
                            <div style={{ display: "flex", height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, background: "rgba(18,44,92,0.06)", fontSize: 18 }}>🖼️</div>
                          )}
                        </td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", fontSize: 13, fontWeight: 700, color: "#16407F", wordBreak: "break-word" }}>
                          <span dir="ltr">{product.product_number}</span>
                          {isNewProduct(product.created_at) && (
                            <span title="صنف مضاف حديثاً" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 5, width: 16, height: 16, fontSize: 10, fontWeight: 700, color: "#FFFFFF", background: "#C4952E", borderRadius: 99, verticalAlign: "middle" }}>N</span>
                          )}
                        </td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", fontSize: 13, color: "#586377", wordBreak: "break-word" }} dir="ltr">{product.reference_number || "-"}</td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", background: "rgba(196,149,46,0.07)" }}>
                          {(() => {
                            const rowReferences = productReferences(product);

                            if (rowReferences.length === 0) {
                              return <span style={{ fontSize: 12.5, color: "#9AA3B5" }}>لا توجد أرقام</span>;
                            }

                            // نعرض 3 أرقام فقط عشان كل الصفوف تبقى بنفس الارتفاع،
                            // والباقي يُعرض بالكامل في نافذة منفصلة
                            const visibleReferences = rowReferences.slice(0, 3);
                            const hiddenCount = rowReferences.length - visibleReferences.length;

                            return (
                              <>
                                <span dir="ltr" title={rowReferences.join(", ")} style={{ display: "block", fontSize: 12, color: "#0E2C5C", lineHeight: 1.65, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {visibleReferences.join(" · ")}
                                </span>
                                <button type="button" onClick={() => setRefsModalProduct(product)} style={{ marginTop: 5, background: "rgba(196,149,46,0.18)", color: "#8F6819", border: "none", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, borderRadius: 99, padding: "3px 10px", cursor: "pointer" }}>
                                  {hiddenCount > 0 ? `+${hiddenCount} أخرى · عرض الكل` : `${rowReferences.length} رقم · عرض الكل`}
                                </button>
                              </>
                            );
                          })()}
                        </td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                          <span dir="ltr" style={{ display: "block", fontSize: 12.5, color: "#586377", lineHeight: 1.5, wordBreak: "break-word" }}>{product.product_name_en || "-"}</span>
                          <span style={{ display: "block", height: 1, background: "rgba(18,44,92,0.12)", margin: "6px 0" }} />
                          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0E2C5C", lineHeight: 1.5, wordBreak: "break-word" }}>{product.product_name_ar || "-"}</span>
                          {(product.category || product.application) && (
                            <span dir="ltr" style={{ display: "block", marginTop: 6, fontSize: 11, color: "#8F6819" }}>
                              {[product.application, product.category].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", fontSize: 13, fontWeight: 700, color: "#16407F", wordBreak: "break-word" }} dir="ltr">
                          {product.ean13_barcode || <span style={{ fontWeight: 400, color: "#9AA3B5" }}>لم يُولَّد بعد</span>}
                        </td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center", fontSize: 13 }}>{product.packing_qty}</td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", textAlign: "center", fontSize: 13 }}><span style={{ fontWeight: 700, color: "#16407F" }}>{product.points}</span></td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                          <span style={{ display: "inline-block", whiteSpace: "nowrap", borderRadius: 100, border: "1px solid", padding: "3px 10px", fontSize: 11.5, fontWeight: 700, background: product.is_active ? "rgba(31,138,91,0.1)" : "rgba(192,57,43,0.08)", color: product.is_active ? "#1F8A5B" : "#C0392B", borderColor: product.is_active ? "rgba(31,138,91,0.3)" : "rgba(192,57,43,0.25)" }}>
                            {product.is_active ? "فعال" : "موقوف"}
                          </span>
                        </td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            <button type="button" disabled={isPrintingJob || !product.is_active} onClick={() => openPrintModal(product)} style={{ width: "100%", whiteSpace: "nowrap", borderRadius: 8, padding: "5px 4px", fontSize: 11.5, fontWeight: 700, color: "#fff", border: "none", background: (isPrintingJob || !product.is_active) ? "#C6CAD3" : "#1F8A5B", cursor: (isPrintingJob || !product.is_active) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                              إنشاء وطباعة
                            </button>
                            <button type="button" onClick={() => openViewProduct(product)} style={{ width: "100%", whiteSpace: "nowrap", borderRadius: 8, padding: "5px 4px", fontSize: 11.5, fontWeight: 700, color: "#16407F", border: "1px solid rgba(22,64,127,0.25)", background: "rgba(22,64,127,0.08)", cursor: "pointer", fontFamily: "inherit" }}>
                              عرض
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: 6, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            <button type="button" onClick={() => handleEditProduct(product)} title="تعديل" style={{ width: 26, height: 26, borderRadius: 7, padding: 0, fontSize: 13, lineHeight: 1, color: "#8F6819", background: "rgba(196,149,46,0.16)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                              ✎
                            </button>
                            {product.is_active ? (
                              <button type="button" onClick={() => handleDeleteProduct(product)} title="حذف" style={{ width: 26, height: 26, borderRadius: 7, padding: 0, fontSize: 13, lineHeight: 1, color: "#C0392B", background: "rgba(192,57,43,0.1)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                                ✕
                              </button>
                            ) : (
                              <button type="button" onClick={() => handleRestoreProduct(product)} title="تفعيل" style={{ width: 26, height: 26, borderRadius: 7, padding: 0, fontSize: 13, lineHeight: 1, color: "#1F8A5B", background: "rgba(31,138,91,0.12)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                                ✓
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            </>
          )}
        </section>
      </main>

      {/* ============== نافذة إنشاء QR وطباعة ============== */}
      {printJob && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,44,92,0.55)", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 520, borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)" }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0E2C5C", margin: 0 }}>إنشاء QR وطباعة الليبل</h2>
            <p style={{ marginTop: 8, color: "#586377" }}>المنتج: {printJob.product.product_number}</p>
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>كمية الليبلات / QR</label>
                <input type="number" min="1" value={printJob.quantity} onChange={(event) => setPrintJob((previous) => (previous ? { ...previous, quantity: event.target.value } : previous))} dir="ltr" className="gx-in" style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(18,44,92,0.18)", background: "#FBF3DC", padding: "12px 14px", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: "#0E2C5C" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>قالب الليبل</label>
                <select value={printJob.templateId} onChange={(event) => setPrintJob((previous) => (previous ? { ...previous, templateId: event.target.value } : previous))} className="gx-in" style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(18,44,92,0.18)", background: "#F5F2EC", padding: "12px 14px", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: "#0E2C5C" }}>
                  <option value="">اختر قالب الليبل</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.template_name} — {template.width_mm}×{template.height_mm} mm
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button type="button" onClick={handleGenerateAndPrint} disabled={isPrintingJob} style={{ flex: 1, borderRadius: 12, background: isPrintingJob ? "#9AA3B5" : "#1F8A5B", padding: "14px", fontFamily: "inherit", fontWeight: 700, color: "#fff", border: "none", cursor: isPrintingJob ? "not-allowed" : "pointer" }}>
                {isPrintingJob ? "جاري الإنشاء..." : "إنشاء وفتح الطباعة"}
              </button>
              <button type="button" onClick={() => setPrintJob(null)} disabled={isPrintingJob} style={{ borderRadius: 12, background: "#E4E1DA", padding: "14px 26px", fontFamily: "inherit", fontWeight: 700, color: "#586377", border: "none", cursor: isPrintingJob ? "not-allowed" : "pointer" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== نافذة عرض المنتج (قراءة فقط) ============== */}
      {viewProduct && (
        <div onClick={() => setViewProduct(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", backgroundColor: "rgba(14,44,92,0.55)", padding: "40px 16px", overflowY: "auto" }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: "min(900px, 100%)", borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)", position: "relative" }}>

            <button type="button" onClick={() => setViewProduct(null)} aria-label="إغلاق" style={{ position: "absolute", top: 16, left: 16, width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(18,44,92,0.08)", color: "#0E2C5C", fontSize: 20, fontWeight: 700, lineHeight: 1, cursor: "pointer", fontFamily: "inherit" }}>×</button>

            {/* رأس النافذة: الصورة + الاسم + الحالة */}
            <div className="gx-imgrow" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <div style={{ height: 120, width: 120, flexShrink: 0, overflow: "hidden", borderRadius: 16, border: "1px solid rgba(18,44,92,0.15)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {viewProduct.product_image_url ? (
                  <img src={viewProduct.product_image_url} alt={viewProduct.product_number} style={{ height: "100%", width: "100%", objectFit: "contain", cursor: "zoom-in" }} onClick={() => setZoomedImage(viewProduct.product_image_url)} />
                ) : (
                  <span style={{ fontSize: 28 }}>🖼️</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <span dir="ltr" style={{ fontSize: 22, fontWeight: 800, color: "#16407F" }}>{viewProduct.product_number}</span>
                  {isNewProduct(viewProduct.created_at) && (
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, fontSize: 11, fontWeight: 700, color: "#fff", background: "#C4952E", borderRadius: 99 }}>N</span>
                  )}
                  <span style={{ borderRadius: 100, border: "1px solid", padding: "3px 12px", fontSize: 12, fontWeight: 700, background: viewProduct.is_active ? "rgba(31,138,91,0.1)" : "rgba(192,57,43,0.08)", color: viewProduct.is_active ? "#1F8A5B" : "#C0392B", borderColor: viewProduct.is_active ? "rgba(31,138,91,0.3)" : "rgba(192,57,43,0.25)" }}>
                    {viewProduct.is_active ? "فعال" : "موقوف"}
                  </span>
                </div>
                <p dir="ltr" style={{ margin: 0, fontSize: 15, color: "#586377", textAlign: "left" }}>{viewProduct.product_name_en || "-"}</p>
                <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, color: "#0E2C5C" }}>{viewProduct.product_name_ar || "-"}</p>
              </div>
            </div>

            {/* البيانات الأساسية */}
            <div className="gx-viewgrid" style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              <ViewField label="رقم المرجع" value={viewProduct.reference_number} ltr />
              <ViewField label="الباركود الثابت" value={viewProduct.ean13_barcode} ltr />
              <ViewField label="الباركود الداخلي" value={viewProduct.barcode} ltr />
              <ViewField label="كمية التعبئة" value={String(viewProduct.packing_qty ?? "")} ltr />
              <ViewField label="النقاط" value={String(viewProduct.points ?? "")} ltr />
              <ViewField label="الشركة الصانعة" value={viewProduct.manufacturer} ltr />
              <ViewField label="التطبيق" value={viewProduct.application} ltr />
              <ViewField label="مجموعة التصنيف" value={viewProduct.category_group} ltr />
              <ViewField label="التصنيف" value={viewProduct.category} ltr />
            </div>

            <div style={{ marginTop: 12 }}>
              <ViewField label="مسار التصنيف الكامل" value={viewProduct.category_breadcrumb} ltr />
            </div>

            {viewProduct.product_details && (
              <div style={{ marginTop: 12 }}>
                <ViewField label="تفاصيل المنتج" value={viewProduct.product_details} ltr />
              </div>
            )}

            {/* يحل محل ماركات */}
            <div style={{ marginTop: 18 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>يحل محل ماركات</label>
              {splitReferences(viewProduct.replaces_brands).length === 0 ? (
                <span style={{ fontSize: 13, color: "#9AA3B5" }}>غير محدّد</span>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {splitReferences(viewProduct.replaces_brands).map((brand, index) => (
                    <span key={`${brand}-${index}`} dir="ltr" style={{ fontSize: 12.5, fontWeight: 700, color: "#0E2C5C", background: "rgba(196,149,46,0.14)", border: "1px solid rgba(196,149,46,0.3)", borderRadius: 99, padding: "4px 12px" }}>{brand}</span>
                  ))}
                </div>
              )}
            </div>

            {/* المواصفات الفنية — مثل جدول Product details في المصدر */}
            {viewSpecs.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: "#33405A" }}>المواصفات الفنية</label>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1F8A5B", background: "rgba(31,138,91,0.1)", borderRadius: 99, padding: "3px 12px" }}>
                    {viewSpecs.length}
                  </span>
                </div>

                <div style={{ maxHeight: 300, overflowY: "auto", borderRadius: 12, border: "1px solid rgba(18,44,92,0.12)" }}>
                  <table dir="ltr" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ background: "#FFFFFF" }}>
                        <th style={{ width: "52%", padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "#0E2C5C", borderBottom: "1px solid rgba(18,44,92,0.15)" }}>Properties</th>
                        <th style={{ padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "#0E2C5C", borderBottom: "1px solid rgba(18,44,92,0.15)" }}>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewSpecs.map((item, index) => (
                        <tr key={`${item.property}-${item.value}-${index}`} style={{ background: index % 2 === 0 ? "#F0EEE9" : "#FFFFFF" }}>
                          <td style={{ padding: "9px 12px", fontSize: 12.5, color: "#33405A", wordBreak: "break-word" }}>{item.property}</td>
                          <td style={{ padding: "9px 12px", fontSize: 12.5, color: "#16407F", fontWeight: 600, wordBreak: "break-word" }}>{item.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* الأرقام المرجعية مربوطة بماركاتها — مثل جدول Comparison numbers */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#33405A" }}>الأرقام المرجعية</label>
                {!isLoadingViewReferences && viewReferences.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#8F6819", background: "rgba(196,149,46,0.16)", borderRadius: 99, padding: "3px 12px" }}>
                    {viewReferences.length} رقم
                  </span>
                )}
              </div>

              {isLoadingViewReferences ? (
                <p style={{ fontSize: 13, color: "#7A8498", margin: 0 }}>جاري تحميل الأرقام...</p>
              ) : viewReferences.length > 0 ? (
                <div style={{ maxHeight: 280, overflowY: "auto", borderRadius: 12, border: "1px solid rgba(18,44,92,0.12)" }}>
                  <table dir="ltr" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ background: "#FFFFFF" }}>
                        <th style={{ width: "38%", padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "#0E2C5C", borderBottom: "1px solid rgba(18,44,92,0.15)" }}>Replaces</th>
                        <th style={{ padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "#0E2C5C", borderBottom: "1px solid rgba(18,44,92,0.15)" }}>Reference number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewReferences.map((item, index) => (
                        <tr key={`${item.brand}-${item.reference}-${index}`} style={{ background: index % 2 === 0 ? "#F0EEE9" : "#FFFFFF" }}>
                          <td style={{ padding: "9px 12px", fontSize: 12.5, color: "#33405A", wordBreak: "break-word" }}>{item.brand}</td>
                          <td style={{ padding: "9px 12px", fontSize: 12.5, color: "#16407F", fontWeight: 600, wordBreak: "break-word" }}>{item.reference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : splitReferences(viewProduct.all_references).length > 0 ? (
                /* لا توجد أرقام مربوطة بماركات — نعرض القائمة العامة بدلاً منها */
                <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 6, borderRadius: 12, border: "1px solid rgba(18,44,92,0.1)", background: "#F5F2EC", padding: 12 }}>
                  {splitReferences(viewProduct.all_references).map((reference, index) => (
                    <span key={`${reference}-${index}`} dir="ltr" style={{ fontSize: 12.5, color: "#0E2C5C", background: "#fff", border: "1px solid rgba(18,44,92,0.12)", borderRadius: 8, padding: "4px 10px" }}>{reference}</span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "#9AA3B5", margin: 0 }}>لا توجد أرقام مرجعية</p>
              )}
            </div>

            {/* ملاحظات المورّد — أوصاف لا تدخل البحث */}
            {viewNotes.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: "#33405A" }}>ملاحظات</label>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#586377", background: "rgba(18,44,92,0.06)", borderRadius: 99, padding: "3px 12px" }}>
                    {viewNotes.length}
                  </span>
                </div>

                <div style={{ borderRadius: 12, border: "1px solid rgba(18,44,92,0.1)", background: "#F5F2EC", padding: 12 }}>
                  {viewNotes.map((item, index) => (
                    <div key={`${item.note}-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: index === viewNotes.length - 1 ? 0 : 8, flexWrap: "wrap" }}>
                      {item.type && (
                        <span
                          title={item.type === "DT Reference" ? "مرجع داخلي — لا يُعرض للعميل" : undefined}
                          style={{
                            flexShrink: 0,
                            fontSize: 11,
                            fontWeight: 700,
                            borderRadius: 99,
                            padding: "2px 9px",
                            color: item.type === "DT Reference" ? "#C0392B" : "#7A409E",
                            background: item.type === "DT Reference" ? "rgba(192,57,43,0.1)" : "rgba(122,64,158,0.12)",
                            border: item.type === "DT Reference" ? "1px solid rgba(192,57,43,0.25)" : "1px solid rgba(122,64,158,0.25)",
                          }}
                        >
                          {item.type === "DT Reference" ? "داخلي" : item.type}
                        </span>
                      )}
                      <span dir="ltr" style={{ fontSize: 13, color: "#0E2C5C", wordBreak: "break-word" }}>{item.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* موديلات الشاحنات */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#33405A" }}>موديلات الشاحنات</label>
                {!isLoadingViewApplications && viewApplications.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#16407F", background: "rgba(22,64,127,0.1)", borderRadius: 99, padding: "3px 12px" }}>
                    {viewApplications.length} موديل
                  </span>
                )}
              </div>

              {isLoadingViewApplications ? (
                <p style={{ fontSize: 13, color: "#7A8498", margin: 0 }}>جاري تحميل الموديلات...</p>
              ) : viewApplications.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9AA3B5", margin: 0 }}>لا توجد موديلات مسجّلة لهذا الصنف</p>
              ) : (
                <div style={{ maxHeight: 280, overflowY: "auto", borderRadius: 12, border: "1px solid rgba(18,44,92,0.12)" }}>
                  <table dir="ltr" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ background: "#FFFFFF" }}>
                        <th style={{ width: "34%", padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "#0E2C5C", borderBottom: "1px solid rgba(18,44,92,0.15)" }}>Vehicle make</th>
                        <th style={{ padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "#0E2C5C", borderBottom: "1px solid rgba(18,44,92,0.15)" }}>Model, engine, gearbox, axle, cabin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(
                        viewApplications.reduce((acc: Record<string, string[]>, item) => {
                          (acc[item.brand] = acc[item.brand] || []).push(item.model);
                          return acc;
                        }, {})
                      ).map(([brand, models], rowIndex) => (
                        <tr key={brand} style={{ background: rowIndex % 2 === 0 ? "#F0EEE9" : "#FFFFFF" }}>
                          <td style={{ padding: "10px 12px", fontSize: 12.5, color: "#33405A", verticalAlign: "top", wordBreak: "break-word" }}>{brand}</td>
                          <td style={{ padding: "10px 12px", fontSize: 12.5, color: "#16407F", lineHeight: 1.7, verticalAlign: "top", wordBreak: "break-word" }}>{models.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* أزرار الإجراءات */}
            <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button type="button" onClick={() => { const p = viewProduct; setViewProduct(null); handleEditProduct(p); }} style={{ flex: 1, minWidth: 140, borderRadius: 12, background: "#C4952E", padding: "13px", fontFamily: "inherit", fontWeight: 700, color: "#0E2C5C", border: "none", cursor: "pointer" }}>
                تعديل هذا المنتج
              </button>
              <button type="button" onClick={() => setViewProduct(null)} style={{ borderRadius: 12, background: "#E4E1DA", padding: "13px 30px", fontFamily: "inherit", fontWeight: 700, color: "#586377", border: "none", cursor: "pointer" }}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== نافذة كل الأرقام المرجعية ============== */}
      {refsModalProduct && (
        <div onClick={() => setRefsModalProduct(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,44,92,0.55)", padding: 16 }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: "100%", maxWidth: 540, borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)", maxHeight: "80vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0E2C5C", margin: 0 }}>كل الأرقام المرجعية</h2>
            <p style={{ marginTop: 6, color: "#586377", fontSize: 14 }}>
              الصنف <span dir="ltr" style={{ fontWeight: 700, color: "#16407F" }}>{refsModalProduct.product_number}</span>
              {" — "}
              {productReferences(refsModalProduct).length} رقم
            </p>

            {refsModalProduct.category_breadcrumb && (
              <p dir="ltr" style={{ marginTop: 4, color: "#8F6819", fontSize: 12.5, textAlign: "left" }}>
                {refsModalProduct.category_breadcrumb}
              </p>
            )}

            <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {productReferences(refsModalProduct).map((reference, index) => (
                <span key={`${reference}-${index}`} dir="ltr" style={{ fontSize: 13, fontWeight: 700, color: "#0E2C5C", background: "rgba(196,149,46,0.14)", border: "1px solid rgba(196,149,46,0.3)", borderRadius: 10, padding: "6px 12px" }}>
                  {reference}
                </span>
              ))}
            </div>

            <div style={{ marginTop: 22, display: "flex", gap: 12 }}>
              <button type="button" onClick={() => navigator.clipboard?.writeText(productReferences(refsModalProduct).join(", "))} style={{ flex: 1, borderRadius: 12, background: "#16407F", padding: "12px", fontFamily: "inherit", fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}>
                نسخ كل الأرقام
              </button>
              <button type="button" onClick={() => setRefsModalProduct(null)} style={{ borderRadius: 12, background: "#E4E1DA", padding: "12px 26px", fontFamily: "inherit", fontWeight: 700, color: "#586377", border: "none", cursor: "pointer" }}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== نافذة تكبير الصورة ============== */}
      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.8)", padding: 24, cursor: "zoom-out" }}>
          <img src={zoomedImage} alt="صورة المنتج مكبّرة" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 16, backgroundColor: "#fff", padding: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
          <button type="button" onClick={() => setZoomedImage(null)} aria-label="إغلاق" style={{ position: "fixed", top: 20, left: 20, width: 44, height: 44, borderRadius: 9999, backgroundColor: "#fff", color: "#0E2C5C", fontSize: 22, fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>✕</button>
        </div>
      )}

      {/* ============== نافذة تأكيد الحذف ============== */}
      {deleteConfirmProduct && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,44,92,0.55)", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 440, borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ margin: "0 auto", display: "flex", height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 16, background: "rgba(192,57,43,0.1)", fontSize: 28 }}>🗑️</div>
            <h2 style={{ marginTop: 20, fontSize: 20, fontWeight: 800, color: "#0E2C5C" }}>تأكيد الحذف</h2>
            <p style={{ marginTop: 12, color: "#586377" }}>
              هل تريد فعلاً حذف/إيقاف المنتج رقم{" "}
              <span style={{ fontWeight: 700, color: "#0E2C5C" }} dir="ltr">{deleteConfirmProduct.product_number}</span>
              {" "}({deleteConfirmProduct.product_name_ar || deleteConfirmProduct.product_name_en})؟
            </p>
            <div style={{ marginTop: 22, display: "flex", gap: 12 }}>
              <button type="button" onClick={confirmDeleteProduct} disabled={isDeleting} style={{ flex: 1, borderRadius: 12, background: isDeleting ? "#9AA3B5" : "#C0392B", padding: "13px", fontFamily: "inherit", fontWeight: 700, color: "#fff", border: "none", cursor: isDeleting ? "not-allowed" : "pointer" }}>
                {isDeleting ? "جاري الحذف..." : "نعم، احذف"}
              </button>
              <button type="button" onClick={() => setDeleteConfirmProduct(null)} disabled={isDeleting} style={{ flex: 1, borderRadius: 12, background: "#E4E1DA", padding: "13px", fontFamily: "inherit", fontWeight: 700, color: "#586377", border: "none", cursor: isDeleting ? "not-allowed" : "pointer" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .gx-in:focus { outline: none; border-color: #16407F; box-shadow: 0 0 0 3px rgba(22,64,127,0.12); }
        .gx-in::placeholder { color: #9AA3B5; }
        .gx-filter { flex: 1 1 155px; min-width: 140px; max-width: 230px; border-radius: 10px; border: 1px solid rgba(18,44,92,0.18); background: #FFFFFF; padding: 9px 12px; font-family: inherit; font-size: 13.5px; font-weight: 600; color: #0E2C5C; }
        .gx-row:hover { background: rgba(18,44,92,0.02) !important; }
        .gx-spin { animation: gxSpin 0.8s linear infinite; }
        @keyframes gxSpin { to { transform: rotate(360deg); } }
        @media (max-width:980px){
          .gx-kpis { grid-template-columns:1fr 1fr !important; }
          .gx-form-grid { grid-template-columns:1fr 1fr !important; }
          .gx-viewgrid { grid-template-columns:1fr 1fr !important; }
          .gx-titlerow { flex-direction:column; }
        }
        @media (max-width:640px){
          .gx-form-grid { grid-template-columns:1fr !important; }
          .gx-viewgrid { grid-template-columns:1fr !important; }
          .gx-imgrow { flex-direction:column !important; align-items:flex-start !important; }
        }
      `}</style>
    </div>
  );
}

/* قائمة اختيار من القيم الموجودة، مع خيار إدخال قيمة جديدة عند الحاجة.
   الهدف: منع الأخطاء الإملائية التي تُنشئ تصنيفات مكررة بلا داعٍ. */
function SelectOrNewField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [isTyping, setIsTyping] = useState(false);
  const isKnown = value === "" || options.includes(value);
  const showInput = isTyping || !isKnown;

  return (
    <div>
      <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>{label}</label>

      {showInput ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="اكتب قيمة جديدة"
            dir="ltr"
            className="gx-in"
            style={{ flex: 1, minWidth: 0, fontFamily: "inherit", fontSize: 15, border: "1px solid #C4952E", borderRadius: 12, padding: "12px 14px", background: "#FFFDF8", color: "#0E2C5C" }}
          />
          <button
            type="button"
            onClick={() => { setIsTyping(false); onChange(""); }}
            title="الرجوع للقائمة"
            style={{ borderRadius: 12, border: "none", background: "rgba(18,44,92,0.06)", color: "#586377", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "0 14px", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            القائمة
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={(event) => {
            if (event.target.value === "__new__") {
              setIsTyping(true);
              onChange("");
              return;
            }
            onChange(event.target.value);
          }}
          dir="ltr"
          className="gx-in"
          style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C" }}
        >
          <option value="">— اختر —</option>
          {options.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
          <option value="__new__">＋ إدخال قيمة جديدة</option>
        </select>
      )}
    </div>
  );
}

// حقل عرض للقراءة فقط داخل نافذة عرض المنتج
function ViewField({ label, value, ltr = false }: { label: string; value: string | null | undefined; ltr?: boolean }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#7A8498", marginBottom: 5 }}>{label}</label>
      <div dir={ltr ? "ltr" : "rtl"} style={{ fontSize: 14, fontWeight: 600, color: value ? "#0E2C5C" : "#9AA3B5", background: "#F5F2EC", border: "1px solid rgba(18,44,92,0.08)", borderRadius: 10, padding: "9px 12px", wordBreak: "break-word", minHeight: 38 }}>
        {value || "-"}
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  ltr = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  ltr?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#33405A", marginBottom: 8 }}>{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        dir={ltr ? "ltr" : "rtl"}
        className="gx-in"
        style={{ width: "100%", fontFamily: "inherit", fontSize: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C" }}
      />
    </div>
  );
}
