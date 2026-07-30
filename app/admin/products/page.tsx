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
const PAGE_SIZE = 100;

// عدد الأصناف المرسلة في كل دفعة استيراد
const IMPORT_BATCH_SIZE = 200;

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

  const [page, setPage] = useState(1);
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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
    setPage(1);
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
      p_offset: (page - 1) * PAGE_SIZE,
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

    setProducts((data?.rows || []) as Product[]);
    setTotalCount(Number(data?.total || 0));
    setIsLoading(false);
  }, [appliedSearch, categoryGroupFilter, categoryFilter, applicationFilter, manufacturerFilter, brandFilter, statusFilter, page]);

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
      setPage(1);
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
  }, [isAuthorized, loadCategories, loadTemplates]);

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

  /* ضغط/تصغير الصورة بالمتصفح قبل الرفع — يحوّل صور الكاميرا الكبيرة (عدة
     ميجابايت) لملف أصغر بكثير بدون فرق واضح بجودة العرض، فيصير الرفع أسرع
     بكثير. صور المنتج دائمًا تتحول لـ JPEG (حتى لو رُفعت أصلاً كـ PNG) —
     صور المنتجات فوتوغرافية ما تحتاج شفافية، وPNG لمحتوى فوتوغرافي يبقى
     ضخم حتى بعد تصغير الأبعاد لأنه صيغة غير مضغوطة، وهذا كان سبب البطء. */
  async function compressImageForUpload(source: File): Promise<{ blob: Blob; ext: string }> {
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
      if (!ctx) return { blob: source, ext: source.name.split(".").pop()?.toLowerCase() || "jpg" };

      // خلفية بيضاء أول (JPEG ما يدعم شفافية)، بعدها نرسم الصورة فوقها
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close?.();

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));

      if (blob && blob.size < source.size) {
        return { blob, ext: "jpg" };
      }

      return { blob: source, ext: source.name.split(".").pop()?.toLowerCase() || "jpg" };
    } catch {
      // أي متصفح/ملف ما يدعم الضغط يرفع الأصل بدل ما يفشل كليًا
      return { blob: source, ext: source.name.split(".").pop()?.toLowerCase() || "jpg" };
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

  // تسجيل استخدام الصنف — يرفعه لأعلى القائمة في التحميل التالي
  async function touchProductUsage(productId: string) {
    await supabase.rpc("touch_product_usage", { p_product_id: productId });
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
          p_all_references: normalizeReferences(form.all_references),
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

        resetForm();
        setMessage(data.message || "تم تعديل المنتج بنجاح");
        setMessageType("success");
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
        p_all_references: normalizeReferences(form.all_references),
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

      resetForm();
      setMessage(`تم إنشاء المنتج بنجاح — الباركود التلقائي: ${data.barcode || "-"}`);
      setMessageType("success");
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

    // جلب كل الأصناف مرة واحدة لمعرفة من يملك صورة
    const { data: allData, error: allError } = await supabase.rpc("get_admin_products_page", {
      p_search: null,
      p_category_group: null,
      p_category: null,
      p_limit: 200000,
      p_offset: 0,
      p_application: null,
      p_manufacturer: null,
      p_replaces_brand: null,
      p_status: null,
    });

    if (allError) {
      setMessage(allError.message || "تعذر جلب قائمة الأصناف قبل رفع الصور");
      setMessageType("error");
      setIsImportingImages(false);
      setImportingImagesMode(null);
      event.target.value = "";
      return;
    }

    const allProducts = (allData?.rows || []) as Product[];

    // جدول بحث سريع: رقم الصنف => المنتج (المطابقة زي اسم الملف تماماً)
    const productByNumber = new Map<string, Product>();
    for (const p of allProducts) {
      if (p.product_number) {
        productByNumber.set(p.product_number.trim(), p);
      }
    }

    const summary: ImportSummary = { total: files.length, success: 0, failed: [] };
    let doneCount = 0;

    async function processOne(file: File, index: number) {
      const productNumber = file.name.replace(/\.[^/.]+$/, "").trim();

      try {
        if (!file.type.startsWith("image/")) {
          summary.failed.push({ row: index + 1, product_number: productNumber, message: "الملف ليس صورة" });
          return;
        }

        const matchedProduct = productByNumber.get(productNumber);

        // الصنف غير موجود إطلاقاً بالنظام
        if (!matchedProduct) {
          summary.failed.push({
            row: index + 1,
            product_number: productNumber,
            message: "الصنف غير موجود في النظام",
          });
          return;
        }

        const hasImage = Boolean(matchedProduct.product_image_url);

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

    // رفع 4 صور بالتوازي بدل وحدة وحدة — يسرّع الاستيراد الجماعي بشكل كبير
    const CONCURRENCY = 4;
    for (let start = 0; start < files.length; start += CONCURRENCY) {
      const batch = files.slice(start, start + CONCURRENCY);
      await Promise.all(batch.map((file, offset) => processOne(file, start + offset)));
    }

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
        packing_qty: Math.max(1, Math.floor(Number(row["كمية التعبئة"] ?? row["Packing Qty"] ?? 1) || 1)),
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

  // أرقام الصفحات المعروضة: الأولى، الأخيرة، والصفحات القريبة من الحالية
  function buildPageList() {
    const pages: (number | "gap")[] = [];
    const window = 2;

    for (let i = 1; i <= totalPages; i++) {
      const isEdge = i === 1 || i === totalPages;
      const isNear = Math.abs(i - page) <= window;

      if (isEdge || isNear) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "gap") {
        pages.push("gap");
      }
    }

    return pages;
  }

  if (isAuthorized !== true) return null;

  const firstRow = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, totalCount);

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

            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <label style={{ fontSize: 13.5, fontWeight: 700, color: "#33405A" }}>كل الأرقام المرجعية</label>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#8F6819", background: "rgba(196,149,46,0.16)", borderRadius: 99, padding: "3px 12px" }}>
                  {splitReferences(normalizeReferences(form.all_references)).length} رقم
                </span>
              </div>
              <textarea
                value={form.all_references}
                onChange={(event) => updateForm("all_references", event.target.value)}
                placeholder="22154286, 81508206016, A0006079231"
                dir="ltr"
                rows={4}
                className="gx-in"
                style={{ width: "100%", fontFamily: "inherit", fontSize: 14.5, lineHeight: 1.7, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 12, padding: "12px 14px", background: "#FFFFFF", color: "#0E2C5C", resize: "vertical" }}
              />
              <p style={{ marginTop: 6, fontSize: 12.5, color: "#586377" }}>افصل بين الأرقام بفاصلة أو سطر جديد. البحث في الجدول يشمل هذه الأرقام.</p>
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
                  عرض {firstRow}–{lastRow} من {totalCount}
                  {(appliedSearch || hasActiveFilters) ? " (نتيجة الفلترة)" : ""}
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

              <select value={categoryGroupFilter} onChange={(event) => { setCategoryGroupFilter(event.target.value); setCategoryFilter(""); setPage(1); }} className="gx-in gx-filter">
                <option value="">كل المجموعات</option>
                {categoryGroups.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }} className="gx-in gx-filter">
                <option value="">كل التصنيفات</option>
                {visibleCategories.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={applicationFilter} onChange={(event) => { setApplicationFilter(event.target.value); setPage(1); }} className="gx-in gx-filter">
                <option value="">كل التطبيقات</option>
                {applications.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={manufacturerFilter} onChange={(event) => { setManufacturerFilter(event.target.value); setPage(1); }} className="gx-in gx-filter">
                <option value="">كل الشركات الصانعة</option>
                {manufacturers.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={brandFilter} onChange={(event) => { setBrandFilter(event.target.value); setPage(1); }} className="gx-in gx-filter">
                <option value="">يحل محل — كل الماركات</option>
                {brands.map((item) => (<option key={item} value={item}>{item}</option>))}
              </select>

              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="gx-in gx-filter">
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
                نتيجة الاستيراد: {importSummary.success} من {importSummary.total} تم بنجاح
                {" — "}أصناف جديدة: {importSummary.created || 0} · أصناف محدَّثة: {importSummary.updated || 0}
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
                    <th style={{ padding: "12px 8px", width: 185, fontWeight: 600, color: "#8F6819", background: "rgba(196,149,46,0.14)" }}>كل الأرقام المرجعية</th>
                    <th style={{ padding: "12px 8px", width: 175, fontWeight: 600 }}>اسم المنتج</th>
                    <th style={{ padding: "12px 8px", width: 120, fontWeight: 600 }}>الباركود الثابت</th>
                    <th style={{ padding: "12px 8px", width: 55, fontWeight: 600, textAlign: "center" }}>التعبئة</th>
                    <th style={{ padding: "12px 8px", width: 55, fontWeight: 600, textAlign: "center" }}>النقاط</th>
                    <th style={{ padding: "12px 8px", width: 70, fontWeight: 600, textAlign: "center" }}>الحالة</th>
                    <th style={{ padding: "12px 8px", width: 160, fontWeight: 600, textAlign: "center" }}>إنشاء وطباعة</th>
                    <th style={{ padding: "12px 8px", width: 130, fontWeight: 600, textAlign: "center" }}>تحكم</th>
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
                            const rowReferences = splitReferences(product.all_references);

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
                          <button type="button" disabled={isPrintingJob || !product.is_active} onClick={() => openPrintModal(product)} style={{ width: "100%", whiteSpace: "nowrap", borderRadius: 10, padding: "8px 8px", fontSize: 12, fontWeight: 700, color: "#fff", border: "none", background: (isPrintingJob || !product.is_active) ? "#C6CAD3" : "#1F8A5B", cursor: (isPrintingJob || !product.is_active) ? "not-allowed" : "pointer" }}>
                            إنشاء وطباعة
                          </button>
                        </td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <button type="button" onClick={() => handleEditProduct(product)} style={{ borderRadius: 10, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#8F6819", background: "rgba(196,149,46,0.16)", border: "none", cursor: "pointer" }}>
                              تعديل
                            </button>
                            {product.is_active ? (
                              <button type="button" onClick={() => handleDeleteProduct(product)} style={{ borderRadius: 10, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#C0392B", background: "rgba(192,57,43,0.1)", border: "none", cursor: "pointer" }}>
                                حذف
                              </button>
                            ) : (
                              <button type="button" onClick={() => handleRestoreProduct(product)} style={{ borderRadius: 10, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#1F8A5B", background: "rgba(31,138,91,0.12)", border: "none", cursor: "pointer" }}>
                                تفعيل
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

            {/* ============== أزرار الصفحات ============== */}
            {totalPages > 1 && (
              <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ borderRadius: 10, border: "1px solid rgba(18,44,92,0.15)", background: page === 1 ? "rgba(18,44,92,0.04)" : "#FFFFFF", color: page === 1 ? "#9AA3B5" : "#16407F", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, padding: "9px 16px", cursor: page === 1 ? "not-allowed" : "pointer" }}>
                  السابق
                </button>

                {buildPageList().map((item, index) =>
                  item === "gap" ? (
                    <span key={`gap-${index}`} style={{ color: "#9AA3B5", padding: "0 4px" }}>…</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      style={{
                        minWidth: 40,
                        borderRadius: 10,
                        border: item === page ? "none" : "1px solid rgba(18,44,92,0.15)",
                        background: item === page ? "#16407F" : "#FFFFFF",
                        color: item === page ? "#FFFDF8" : "#16407F",
                        fontFamily: "inherit",
                        fontWeight: 700,
                        fontSize: 13.5,
                        padding: "9px 12px",
                        cursor: "pointer",
                      }}
                    >
                      {item}
                    </button>
                  )
                )}

                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ borderRadius: 10, border: "1px solid rgba(18,44,92,0.15)", background: page === totalPages ? "rgba(18,44,92,0.04)" : "#FFFFFF", color: page === totalPages ? "#9AA3B5" : "#16407F", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, padding: "9px 16px", cursor: page === totalPages ? "not-allowed" : "pointer" }}>
                  التالي
                </button>
              </div>
            )}
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

      {/* ============== نافذة كل الأرقام المرجعية ============== */}
      {refsModalProduct && (
        <div onClick={() => setRefsModalProduct(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,44,92,0.55)", padding: 16 }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: "100%", maxWidth: 540, borderRadius: 24, background: "#FFFDF8", padding: 26, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.5)", maxHeight: "80vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0E2C5C", margin: 0 }}>كل الأرقام المرجعية</h2>
            <p style={{ marginTop: 6, color: "#586377", fontSize: 14 }}>
              الصنف <span dir="ltr" style={{ fontWeight: 700, color: "#16407F" }}>{refsModalProduct.product_number}</span>
              {" — "}
              {splitReferences(refsModalProduct.all_references).length} رقم
            </p>

            {refsModalProduct.category_breadcrumb && (
              <p dir="ltr" style={{ marginTop: 4, color: "#8F6819", fontSize: 12.5, textAlign: "left" }}>
                {refsModalProduct.category_breadcrumb}
              </p>
            )}

            <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {splitReferences(refsModalProduct.all_references).map((reference, index) => (
                <span key={`${reference}-${index}`} dir="ltr" style={{ fontSize: 13, fontWeight: 700, color: "#0E2C5C", background: "rgba(196,149,46,0.14)", border: "1px solid rgba(196,149,46,0.3)", borderRadius: 10, padding: "6px 12px" }}>
                  {reference}
                </span>
              ))}
            </div>

            <div style={{ marginTop: 22, display: "flex", gap: 12 }}>
              <button type="button" onClick={() => navigator.clipboard?.writeText(splitReferences(refsModalProduct.all_references).join(", "))} style={{ flex: 1, borderRadius: 12, background: "#16407F", padding: "12px", fontFamily: "inherit", fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}>
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
          .gx-titlerow { flex-direction:column; }
        }
        @media (max-width:640px){
          .gx-form-grid { grid-template-columns:1fr !important; }
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
