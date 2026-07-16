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
  ean13_barcode: string | null;
  packing_qty: number;
  points: number;
  product_image_url: string | null;
  is_active: boolean;
  created_at: string;
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
  packing_qty: string;
  points: string;
};

type ImportSummary = {
  total: number;
  success: number;
  failed: { row: number; product_number: string; message: string }[];
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
  packing_qty: "1",
  points: "0",
};

export default function AdminProductsPage() {
  const router = useRouter();

  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [keepOldImageUrl, setKeepOldImageUrl] = useState<string | null>(null);

  const [qrQuantities, setQrQuantities] = useState<Record<string, string>>({});
  const [generatingProductId, setGeneratingProductId] = useState<string | null>(null);

  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [isPrintingJob, setIsPrintingJob] = useState(false);

  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");
  // لو رقم الصنف يخص منتج موقوف، نحفظ معرّفه هنا عشان نعرض زر "تفعيل بدل إنشاء جديد"
  const [inactiveDuplicateId, setInactiveDuplicateId] = useState<string | null>(null);
  const [isActivatingDuplicate, setIsActivatingDuplicate] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

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

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;

    return products.filter((product) => {
      return (
        product.product_number?.toLowerCase().includes(q) ||
        product.product_name_ar?.toLowerCase().includes(q) ||
        product.product_name_en?.toLowerCase().includes(q) ||
        product.barcode?.toLowerCase().includes(q) ||
        product.reference_number?.toLowerCase().includes(q) ||
        product.ean13_barcode?.toLowerCase().includes(q)
      );
    });
  }, [products, search]);

  const stats = useMemo(() => {
    return {
      total: products.length,
      active: products.filter((p) => p.is_active).length,
      inactive: products.filter((p) => !p.is_active).length,
      totalPoints: products.reduce((sum, p) => sum + Number(p.points || 0), 0),
    };
  }, [products]);

  const defaultTemplateId = useMemo(() => {
    return templates.find((template) => template.is_default)?.id || templates[0]?.id || "";
  }, [templates]);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("get_admin_products");

    if (error) {
      setMessage(error.message || "حدث خطأ أثناء تحميل المنتجات");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    setProducts(data || []);
    setIsLoading(false);
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

  useEffect(() => {
    loadProducts();
    loadTemplates();

    return () => {
      if (productImagePreview && !keepOldImageUrl) {
        URL.revokeObjectURL(productImagePreview);
      }
    };
  }, [loadProducts, loadTemplates, productImagePreview, keepOldImageUrl]);

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
        });

        setIsSaving(false);

        if (error || !data?.success) {
          setMessage(data?.message || error?.message || "تعذر تعديل المنتج");
          setMessageType("error");
          return;
        }

        setMessage(data.message || "تم تعديل المنتج بنجاح");
        setMessageType("success");
        resetForm();
        await loadProducts();
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

      setMessage(`تم إنشاء المنتج بنجاح — الباركود التلقائي: ${data.barcode || "-"}`);
      setMessageType("success");
      resetForm();
      await loadProducts();
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
    await loadProducts();
  }

  function handleEditProduct(product: Product) {
    setEditingProductId(product.id);
    setForm({
      product_name_ar: product.product_name_ar || "",
      product_name_en: product.product_name_en || "",
      product_number: product.product_number || "",
      reference_number: product.reference_number || "",
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
    await loadProducts();
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
    await loadProducts();
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
console.log("1");
  const { data, error } = await supabase.rpc("generate_qr_batch", {

    p_product_id: printJob.product.id,
    p_quantity: quantity,
    
  });
console.log("2", data, error);
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

  setPrintJob(null);
  setIsPrintingJob(false);
console.log("3", ids);
  router.push(`/admin/labels/print?${params.toString()}`);
}

  /* استيراد الصور بالجملة — بزرّين منفصلين حسب الوضع (mode):
       "replace" = يستبدل صورة الصنف الذي يملك صورة بالفعل فقط.
                   الصنف بدون صورة → يُتخطّى مع رسالة توجّه للزر الثاني.
       "add"     = يرفع صورة للصنف الذي لا يملك صورة فقط.
                   الصنف الذي يملك صورة → محمي ولا يُستبدل أبداً.
     الفحص يتم محلياً من قائمة المنتجات المحمّلة (product_image_url)،
     فلا نرفع أي صورة للتخزين إلا بعد اجتياز فحص الوضع. */
  async function handleBulkImageImport(
    event: ChangeEvent<HTMLInputElement>,
    mode: ImageImportMode
  ) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // نحتاج قائمة المنتجات محمّلة عشان نعرف مين عنده صورة ومين لا
    if (products.length === 0) {
      setMessage("يرجى الانتظار حتى تُحمَّل المنتجات ثم إعادة المحاولة");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    // جدول بحث سريع: رقم الصنف => المنتج (المطابقة زي اسم الملف تماماً)
    const productByNumber = new Map<string, Product>();
    for (const p of products) {
      if (p.product_number) {
        productByNumber.set(p.product_number.trim(), p);
      }
    }

    setIsImportingImages(true);
    setImportingImagesMode(mode);
    setImageImportSummary(null);
    setImageImportProgress({ done: 0, total: files.length });
    setMessage("");
    setMessageType("");

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
    await loadProducts();
  }

  async function handleImportExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportSummary(null);
    setMessage("");
    setMessageType("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const summary: ImportSummary = { total: rows.length, success: 0, failed: [] };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const productNumber = String(row["رقم الصنف"] ?? "").trim();
        const nameAr = String(row["اسم المنتج بالعربية"] ?? "").trim();
        const nameEn = String(row["اسم المنتج بالإنجليزية"] ?? "").trim();
        const referenceNumber = String(row["رقم المرجع"] ?? "").trim();
        const packingQty = Number(row["كمية التعبئة"] ?? 1) || 1;
        const points = Number(row["النقاط"] ?? 0) || 0;
        const imageUrl = String(row["رابط الصورة"] ?? "").trim();

        if (!productNumber || (!nameAr && !nameEn)) {
          summary.failed.push({
            row: i + 2,
            product_number: productNumber || "-",
            message: "بيانات ناقصة (رقم الصنف أو اسم المنتج)",
          });
          continue;
        }

        const { data, error } = await supabase.rpc("create_product", {
          p_product_name_ar: nameAr || null,
          p_product_name_en: nameEn || null,
          p_product_number: productNumber,
          p_packing_qty: packingQty > 0 ? Math.floor(packingQty) : 1,
          p_points: points >= 0 ? Math.floor(points) : 0,
          p_product_image_url: imageUrl || null,
          p_reference_number: referenceNumber || null,
        });

        if (error || !data?.success) {
          summary.failed.push({
            row: i + 2,
            product_number: productNumber,
            message: data?.message || error?.message || "خطأ غير معروف",
          });
          continue;
        }

        summary.success++;
      }

      setImportSummary(summary);
      await loadProducts();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر قراءة ملف الإكسل، تأكد من الصيغة");
      setMessageType("error");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  if (isAuthorized !== true) return null;
  const star = "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";

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

        {/* الإحصائيات */}
        <div className="gx-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 26 }}>
          <div style={{ borderRadius: 18, padding: "20px 22px", background: "linear-gradient(140deg,#16407F,#0E2C5C)", border: "none" }}>
            <div style={{ fontSize: 13, color: "#C6D2EA", marginBottom: 8 }}>إجمالي نقاط المنتجات</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 36, lineHeight: 1, color: "#F5F2EC" }}>{stats.totalPoints}</div>
          </div>
          <div style={{ borderRadius: 18, padding: "20px 22px", background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)" }}>
            <div style={{ fontSize: 13, color: "#7A8498", marginBottom: 8 }}>موقوفة</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 36, lineHeight: 1, color: "#C0392B" }}>{stats.inactive}</div>
          </div>
          <div style={{ borderRadius: 18, padding: "20px 22px", background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)" }}>
            <div style={{ fontSize: 13, color: "#7A8498", marginBottom: 8 }}>فعّالة</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 36, lineHeight: 1, color: "#1F8A5B" }}>{stats.active}</div>
          </div>
          <div style={{ borderRadius: 18, padding: "20px 22px", background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)" }}>
            <div style={{ fontSize: 13, color: "#7A8498", marginBottom: 8 }}>إجمالي المنتجات</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 36, lineHeight: 1, color: "#0E2C5C" }}>{stats.total}</div>
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

        {/* ============== قسم المنتجات (الجدول) ============== */}
        <section style={{ background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "26px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: "#0E2C5C" }}>المنتجات</h2>
                <p style={{ fontSize: 14.5, color: "#586377", margin: "4px 0 0" }}>عدد المنتجات: {filteredProducts.length} من {products.length}</p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "stretch" }}>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو رقم الصنف أو الباركود أو رقم المرجع" className="gx-in" style={{ flex: "1 1 260px", minWidth: 240, borderRadius: 12, border: "1px solid rgba(18,44,92,0.18)", background: "#FFFFFF", padding: "11px 14px", fontFamily: "inherit", fontSize: 14.5, color: "#0E2C5C" }} />

              <label title="يرفع صوراً للأصناف التي لا تملك صورة فقط. الأصناف التي لها صورة محمية ولن تُستبدل." style={{ cursor: "pointer", borderRadius: 12, background: isImportingImages ? "#9AA3B5" : "rgba(31,138,91,0.12)", color: isImportingImages ? "#fff" : "#1F8A5B", border: "1px solid rgba(31,138,91,0.3)", padding: "11px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, textAlign: "center" }}>
                {isImportingImages && importingImagesMode === "add" ? `جاري الرفع... (${imageImportProgress.done}/${imageImportProgress.total})` : "رفع صور (بدون صورة)"}
                <input type="file" accept="image/*" multiple onChange={(e) => handleBulkImageImport(e, "add")} disabled={isImportingImages} style={{ display: "none" }} />
              </label>

              <label title="يستبدل صور الأصناف التي تملك صورة بالفعل. الأصناف بدون صورة تُتخطّى ولا تتغيّر." style={{ cursor: "pointer", borderRadius: 12, background: isImportingImages ? "#9AA3B5" : "rgba(122,64,158,0.12)", color: isImportingImages ? "#fff" : "#7A409E", border: "1px solid rgba(122,64,158,0.3)", padding: "11px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, textAlign: "center" }}>
                {isImportingImages && importingImagesMode === "replace" ? `جاري الاستبدال... (${imageImportProgress.done}/${imageImportProgress.total})` : "استبدال صور (لها صورة)"}
                <input type="file" accept="image/*" multiple onChange={(e) => handleBulkImageImport(e, "replace")} disabled={isImportingImages} style={{ display: "none" }} />
              </label>

              <label style={{ cursor: "pointer", borderRadius: 12, background: isImporting ? "#9AA3B5" : "rgba(196,149,46,0.16)", color: isImporting ? "#fff" : "#8F6819", border: "1px solid rgba(196,149,46,0.35)", padding: "11px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, textAlign: "center" }}>
                {isImporting ? "جاري الاستيراد..." : "استيراد من إكسل"}
                <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} disabled={isImporting} style={{ display: "none" }} />
              </label>

              <button type="button" onClick={loadProducts} disabled={isLoading} style={{ borderRadius: 12, background: isLoading ? "#9AA3B5" : "#16407F", color: "#fff", border: "none", padding: "11px 20px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, cursor: isLoading ? "not-allowed" : "pointer" }}>
                {isLoading ? "جاري التحديث..." : "استعلام المنتجات"}
              </button>
            </div>
          </div>

          {imageImportSummary && (
            <div style={{ marginTop: 20, borderRadius: 16, border: "1px solid rgba(122,64,158,0.25)", background: "rgba(122,64,158,0.06)", padding: 20 }}>
              <p style={{ fontWeight: 700, color: "#7A409E", margin: 0 }}>
                {lastImageImportMode === "add" ? "نتيجة رفع الصور الجديدة" : "نتيجة استبدال الصور"}: {imageImportSummary.success} من {imageImportSummary.total} تم بنجاح
              </p>
              {imageImportSummary.failed.length > 0 && (
                <div style={{ marginTop: 12 }}>
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
              <p style={{ fontWeight: 700, color: "#16407F", margin: 0 }}>نتيجة الاستيراد: {importSummary.success} من {importSummary.total} تم بنجاح</p>
              {importSummary.failed.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "#C0392B", margin: "0 0 4px" }}>صفوف لم تنجح:</p>
                  {importSummary.failed.map((f) => (
                    <p key={f.row} style={{ fontSize: 13.5, color: "#C0392B", margin: 0 }}>صف {f.row} (رقم الصنف: {f.product_number}) — {f.message}</p>
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
          ) : filteredProducts.length === 0 ? (
            <div style={{ marginTop: 26, borderRadius: 18, background: "rgba(18,44,92,0.03)", padding: 48, textAlign: "center", color: "#7A8498" }}>
              <div style={{ margin: "0 auto 16px", display: "flex", height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 16, background: "rgba(18,44,92,0.06)", fontSize: 28 }}>📦</div>
              {search ? "لا توجد منتجات تطابق البحث" : "لا توجد منتجات بعد — أضف أول منتج من النموذج فوق"}
            </div>
          ) : (
            <div className="gx-tablewrap" style={{ marginTop: 26, overflowX: "auto", borderRadius: 16, border: "1px solid rgba(18,44,92,0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ fontSize: 13, color: "#586377", background: "rgba(18,44,92,0.04)" }}>
                    <th style={{ padding: "12px 8px", width: 70, fontWeight: 600 }}>الصورة</th>
                    <th style={{ padding: "12px 8px", width: 85, fontWeight: 600 }}>رقم الصنف</th>
                    <th style={{ padding: "12px 8px", width: 95, fontWeight: 600 }}>رقم المرجع</th>
                    <th style={{ padding: "12px 8px", width: 150, fontWeight: 600 }}>اسم المنتج</th>
                    <th style={{ padding: "12px 8px", width: 120, fontWeight: 600 }}>الاسم الإنجليزي</th>
                    <th style={{ padding: "12px 8px", width: 120, fontWeight: 600 }}>الباركود الثابت</th>
                    <th style={{ padding: "12px 8px", width: 55, fontWeight: 600, textAlign: "center" }}>التعبئة</th>
                    <th style={{ padding: "12px 8px", width: 55, fontWeight: 600, textAlign: "center" }}>النقاط</th>
                    <th style={{ padding: "12px 8px", width: 70, fontWeight: 600, textAlign: "center" }}>الحالة</th>
                    <th style={{ padding: "12px 8px", width: 160, fontWeight: 600, textAlign: "center" }}>إنشاء وطباعة</th>
                    <th style={{ padding: "12px 8px", width: 130, fontWeight: 600, textAlign: "center" }}>تحكم</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const isGenerating = generatingProductId === product.id;
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
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", fontSize: 13, fontWeight: 700, color: "#16407F", wordBreak: "break-word" }} dir="ltr">{product.product_number}</td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", fontSize: 13, color: "#586377", wordBreak: "break-word" }} dir="ltr">{product.reference_number || "-"}</td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", fontSize: 13, fontWeight: 700, color: "#33405A", wordBreak: "break-word" }}>{product.product_name_ar || "-"}</td>
                        <td style={{ padding: 8, verticalAlign: "top", borderBottom: "1px solid rgba(18,44,92,0.07)", fontSize: 13, color: "#586377", wordBreak: "break-word" }} dir="ltr">{product.product_name_en || "-"}</td>
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