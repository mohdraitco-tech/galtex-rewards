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

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] bg-gradient-to-r from-blue-900 to-blue-700 p-7 text-white shadow-xl md:p-9">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-blue-200">GALTEX Rewards</p>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">إدارة المنتجات</h1>
              <p className="mt-3 text-blue-100">إضافة، تعديل، حذف، وإنشاء QR مع طباعة الليبل مباشرة</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/admin/label-templates/new/edit")}
                style={{ backgroundColor: "#eab308" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ca8a04")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#eab308")}
                className="rounded-2xl px-6 py-3 font-bold text-white shadow-lg"
              >
                إدارة قوالب الليبل
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin")}
                style={{ backgroundColor: "#334155" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1e293b")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#334155")}
                className="rounded-2xl px-6 py-3 font-bold text-white shadow-lg"
              >
                العودة إلى لوحة الإدارة
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs md:text-sm text-gray-500">إجمالي المنتجات</p>
            <p className="text-2xl md:text-4xl font-bold mt-1 text-blue-900">{stats.total}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs md:text-sm text-gray-500">فعّالة</p>
            <p className="text-2xl md:text-4xl font-bold mt-1 text-green-700">{stats.active}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs md:text-sm text-gray-500">موقوفة</p>
            <p className="text-2xl md:text-4xl font-bold mt-1 text-red-600">{stats.inactive}</p>
          </div>
          <div
            className="rounded-2xl p-4 shadow-sm text-white"
            style={{ background: "linear-gradient(to left, #1e3a8a, #1e40af)" }}
          >
            <p className="text-xs md:text-sm text-blue-100">إجمالي نقاط المنتجات</p>
            <p className="text-2xl md:text-4xl font-bold mt-1">{stats.totalPoints}</p>
          </div>
        </section>

        {message && (
          <div
            className={`rounded-2xl border p-4 text-center font-bold ${
              messageType === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message}

            {inactiveDuplicateId && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleActivateDuplicate}
                  disabled={isActivatingDuplicate}
                  style={{ backgroundColor: isActivatingDuplicate ? "#9ca3af" : "#16a34a" }}
                  onMouseEnter={(e) => {
                    if (!isActivatingDuplicate) e.currentTarget.style.backgroundColor = "#15803d";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActivatingDuplicate) e.currentTarget.style.backgroundColor = "#16a34a";
                  }}
                  className="rounded-xl px-5 py-2.5 font-bold text-white shadow-lg"
                >
                  {isActivatingDuplicate ? "جاري التفعيل..." : "فعّل المنتج الموقوف بدل إنشاء جديد"}
                </button>
              </div>
            )}
          </div>
        )}

        <section className="rounded-[2rem] bg-white p-6 shadow-xl md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{editingProductId ? "تعديل المنتج" : "إضافة منتج جديد"}</h2>
              <p className="mt-2 text-gray-500">أدخل بيانات المنتج واختر صورة المنتج</p>
            </div>

            {editingProductId && (
              <button
                type="button"
                onClick={resetForm}
                style={{ backgroundColor: "#9333ea" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#7e22ce")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#9333ea")}
                className="rounded-2xl px-6 py-3 font-bold text-white shadow-lg"
              >
                إلغاء التعديل
              </button>
            )}
          </div>

          <form onSubmit={handleSaveProduct} className="mt-7">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <InputField label="اسم المنتج بالعربية" value={form.product_name_ar} onChange={(value) => updateForm("product_name_ar", value)} placeholder="مثال: قماشات فرامل" />
              <InputField label="اسم المنتج بالإنجليزية" value={form.product_name_en} onChange={(value) => updateForm("product_name_en", value)} placeholder="Brake Pads" ltr />
              <InputField label="رقم الصنف" value={form.product_number} onChange={(value) => updateForm("product_number", value)} placeholder="مثال: 123456" ltr required />
              <InputField label="رقم المرجع" value={form.reference_number} onChange={(value) => updateForm("reference_number", value)} placeholder="مثال: REF-1001" ltr />
              <InputField label="كمية التعبئة" value={form.packing_qty} onChange={(value) => updateForm("packing_qty", value)} placeholder="1" type="number" ltr />
              <InputField label="إجمالي نقاط المنتج" value={form.points} onChange={(value) => updateForm("points", value)} placeholder="100" type="number" ltr />
            </div>

            {editingProductId ? (
              <p className="mt-4 text-sm text-gray-500">
                الباركود التلقائي لهذا المنتج: <span className="font-bold text-blue-900" dir="ltr">{products.find((p) => p.id === editingProductId)?.barcode || "-"}</span>
                {" "}(لا يمكن تعديله)
              </p>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                💡 الباركود سيتولد تلقائياً بعد إنشاء المنتج، ولا حاجة لإدخاله يدوياً.
              </p>
            )}

            <div className="mt-6">
              <label className="mb-3 block text-sm font-bold text-gray-700">صورة المنتج</label>

              {!productImagePreview ? (
                <label className="flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-blue-300 bg-blue-50 transition hover:bg-blue-100">
                  <div className="p-6 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-bold text-white" style={{ backgroundColor: "#1d4ed8" }}>+</div>
                    <p className="mt-4 font-bold text-blue-900">اختر صورة المنتج</p>
                    <p className="mt-2 text-sm text-gray-500">JPG أو PNG وبحجم أقصى 5 ميجابايت</p>
                  </div>

                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              ) : (
                <div className="rounded-3xl border border-blue-100 bg-slate-50 p-5">
                  <div className="flex flex-col items-center gap-5 md:flex-row">
                    <div className="h-40 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <img src={productImagePreview} alt="معاينة صورة المنتج" className="h-full w-full object-contain" />
                    </div>

                    <div className="flex-1">
                      <p className="font-bold text-blue-900">تم اختيار الصورة</p>
                      <p className="mt-2 break-all text-gray-500" dir="ltr">{productImage?.name || keepOldImageUrl || ""}</p>
                      <button
                        type="button"
                        onClick={removeSelectedImage}
                        style={{ backgroundColor: "#dc2626" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#b91c1c")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#dc2626")}
                        className="mt-4 rounded-2xl px-5 py-3 font-bold text-white shadow-lg"
                      >
                        حذف الصورة واختيار غيرها
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              style={{ backgroundColor: isSaving ? "#9ca3af" : "#16a34a" }}
              onMouseEnter={(e) => {
                if (!isSaving) e.currentTarget.style.backgroundColor = "#15803d";
              }}
              onMouseLeave={(e) => {
                if (!isSaving) e.currentTarget.style.backgroundColor = "#16a34a";
              }}
              className="mt-6 w-full rounded-2xl px-10 py-4 font-bold text-white shadow-lg md:w-auto"
            >
              {isSaving ? "جاري الحفظ..." : editingProductId ? "حفظ التعديل" : "إضافة المنتج"}
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-xl md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">المنتجات</h2>
              <p className="mt-2 text-gray-500">عدد المنتجات: {filteredProducts.length} من {products.length}</p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="بحث بالاسم أو رقم الصنف أو الباركود أو رقم المرجع"
                className="min-w-[280px] rounded-2xl border border-gray-300 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-600"
              />

              <label
                style={{ backgroundColor: isImporting ? "#9ca3af" : "#0891b2" }}
                onMouseEnter={(e) => {
                  if (!isImporting) e.currentTarget.style.backgroundColor = "#0e7490";
                }}
                onMouseLeave={(e) => {
                  if (!isImporting) e.currentTarget.style.backgroundColor = "#0891b2";
                }}
                className="cursor-pointer rounded-2xl px-6 py-3 font-bold text-white shadow-lg text-center"
              >
                {isImporting ? "جاري الاستيراد..." : "استيراد من إكسل"}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  disabled={isImporting}
                  className="hidden"
                />
              </label>

              {/* زر (1) الاستبدال: يعمل فقط للأصناف التي تملك صورة سابقة */}
              <label
                title="يستبدل صور الأصناف التي تملك صورة بالفعل. الأصناف بدون صورة تُتخطّى ولا تتغيّر."
                style={{ backgroundColor: isImportingImages ? "#9ca3af" : "#7c3aed" }}
                onMouseEnter={(e) => {
                  if (!isImportingImages) e.currentTarget.style.backgroundColor = "#6d28d9";
                }}
                onMouseLeave={(e) => {
                  if (!isImportingImages) e.currentTarget.style.backgroundColor = "#7c3aed";
                }}
                className="cursor-pointer rounded-2xl px-6 py-3 font-bold text-white shadow-lg text-center"
              >
                {isImportingImages && importingImagesMode === "replace"
                  ? `جاري الاستبدال... (${imageImportProgress.done}/${imageImportProgress.total})`
                  : "استبدال صور (لها صورة)"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleBulkImageImport(e, "replace")}
                  disabled={isImportingImages}
                  className="hidden"
                />
              </label>

              {/* زر (2) رفع الجديد: يعمل فقط للأصناف التي لا تملك صورة (يحمي الموجودة) */}
              <label
                title="يرفع صوراً للأصناف التي لا تملك صورة فقط. الأصناف التي لها صورة محمية ولن تُستبدل."
                style={{ backgroundColor: isImportingImages ? "#9ca3af" : "#0d9488" }}
                onMouseEnter={(e) => {
                  if (!isImportingImages) e.currentTarget.style.backgroundColor = "#0f766e";
                }}
                onMouseLeave={(e) => {
                  if (!isImportingImages) e.currentTarget.style.backgroundColor = "#0d9488";
                }}
                className="cursor-pointer rounded-2xl px-6 py-3 font-bold text-white shadow-lg text-center"
              >
                {isImportingImages && importingImagesMode === "add"
                  ? `جاري الرفع... (${imageImportProgress.done}/${imageImportProgress.total})`
                  : "رفع صور (بدون صورة)"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleBulkImageImport(e, "add")}
                  disabled={isImportingImages}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={loadProducts}
                disabled={isLoading}
                style={{ backgroundColor: isLoading ? "#9ca3af" : "#1d4ed8" }}
                onMouseEnter={(e) => {
                  if (!isLoading) e.currentTarget.style.backgroundColor = "#1e40af";
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) e.currentTarget.style.backgroundColor = "#1d4ed8";
                }}
                className="rounded-2xl px-6 py-3 font-bold text-white shadow-lg"
              >
                {isLoading ? "جاري التحديث..." : "استعلام المنتجات"}
              </button>
            </div>
          </div>

          {imageImportSummary && (
            <div className="mt-5 rounded-2xl border border-purple-100 bg-purple-50 p-5">
              <p className="font-bold text-purple-900">
                {lastImageImportMode === "add" ? "نتيجة رفع الصور الجديدة" : "نتيجة استبدال الصور"}: {imageImportSummary.success} من {imageImportSummary.total} تم بنجاح
              </p>

              {imageImportSummary.failed.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-bold text-red-700">صور لم تنجح:</p>
                  {imageImportSummary.failed.map((f, idx) => (
                    <p key={`${f.product_number}-${idx}`} className="text-sm text-red-600">
                      رقم الصنف: {f.product_number} — {f.message}
                    </p>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setImageImportSummary(null)}
                className="mt-3 text-sm font-bold text-purple-700 hover:underline"
              >
                إغلاق
              </button>
            </div>
          )}

          {importSummary && (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <p className="font-bold text-blue-900">
                نتيجة الاستيراد: {importSummary.success} من {importSummary.total} تم بنجاح
              </p>

              {importSummary.failed.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-bold text-red-700">صفوف لم تنجح:</p>
                  {importSummary.failed.map((f) => (
                    <p key={f.row} className="text-sm text-red-600">
                      صف {f.row} (رقم الصنف: {f.product_number}) — {f.message}
                    </p>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setImportSummary(null)}
                className="mt-3 text-sm font-bold text-blue-700 hover:underline"
              >
                إغلاق
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-gray-500">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700" />
              جاري تحميل المنتجات...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="mt-7 rounded-3xl bg-slate-50 p-12 text-center text-gray-500">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-3xl">📦</div>
              {search ? "لا توجد منتجات تطابق البحث" : "لا توجد منتجات بعد — أضف أول منتج من النموذج فوق"}
            </div>
          ) : (
            <div className="mt-7 overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full border-separate border-spacing-y-3 text-right" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="text-sm text-blue-900 sticky top-0">
                    <th className="px-2" style={{ width: "70px" }}>الصورة</th>
                    <th className="px-2" style={{ width: "85px" }}>رقم الصنف</th>
                    <th className="px-2" style={{ width: "95px" }}>رقم المرجع</th>
                    <th className="px-2" style={{ width: "150px" }}>اسم المنتج</th>
                    <th className="px-2" style={{ width: "120px" }}>الاسم الإنجليزي</th>
                    <th className="px-2" style={{ width: "120px" }}>الباركود الثابت</th>
                    <th className="px-2" style={{ width: "55px" }}>التعبئة</th>
                    <th className="px-2" style={{ width: "55px" }}>النقاط</th>
                    <th className="px-2" style={{ width: "70px" }}>الحالة</th>
                    <th className="px-2" style={{ width: "175px" }}>إنشاء وطباعة</th>
                    <th className="px-2" style={{ width: "150px" }}>تحكم</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProducts.map((product) => {
                    const isGenerating = generatingProductId === product.id;

                    return (
                      <tr key={product.id} className="bg-slate-50 transition hover:bg-blue-50">
                        <td className="rounded-r-2xl p-2 align-top">
                          {product.product_image_url ? (
                            <button
                              type="button"
                              onClick={() => setZoomedImage(product.product_image_url)}
                              className="h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:ring-2 hover:ring-blue-500"
                              title="اضغط لتكبير الصورة"
                            >
                              <img src={product.product_image_url} alt={product.product_name_ar || product.product_number} className="h-full w-full object-contain" />
                            </button>
                          ) : (
                            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-slate-200 text-center text-gray-500">
                              <span className="text-lg">🖼️</span>
                            </div>
                          )}
                        </td>

                        <td className="p-2 align-top text-sm font-bold text-blue-900 break-words" dir="ltr">{product.product_number}</td>
                        <td className="p-2 align-top text-sm text-gray-600 break-words" dir="ltr">{product.reference_number || "-"}</td>
                        <td className="p-2 align-top text-sm font-bold text-gray-800 break-words">{product.product_name_ar || "-"}</td>
                        <td className="p-2 align-top text-sm text-gray-600 break-words" dir="ltr">{product.product_name_en || "-"}</td>
                        <td className="p-2 align-top text-sm font-bold text-blue-900 break-words" dir="ltr">
                          {product.ean13_barcode || <span className="font-normal text-gray-400">لم يُولَّد بعد</span>}
                        </td>
                        <td className="p-2 align-top text-center text-sm">{product.packing_qty}</td>
                        <td className="p-2 align-top text-center text-sm"><span className="font-bold text-blue-800">{product.points}</span></td>

                        <td className="p-2 align-top">
                          <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-1 text-xs font-bold ${product.is_active ? "border-green-100 bg-green-50 text-green-700" : "border-red-100 bg-red-50 text-red-700"}`}>
                            {product.is_active ? "فعال" : "موقوف"}
                          </span>
                        </td>

                        <td className="p-2 align-top">
                          <button
                            type="button"
                            disabled={isPrintingJob || !product.is_active}
                            onClick={() => openPrintModal(product)}
                            style={{ backgroundColor: "#15803d" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#166534")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#15803d")}
                            className="w-full whitespace-nowrap rounded-xl px-2 py-2 text-xs font-bold text-white shadow-lg disabled:bg-gray-500"
                          >
                            إنشاء وطباعة
                          </button>
                        </td>

                        <td className="rounded-l-2xl p-2 align-top">
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditProduct(product)}
                              style={{ backgroundColor: "#f97316" }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ea580c")}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#f97316")}
                              className="rounded-xl px-2 py-1.5 text-xs font-bold text-white shadow-lg"
                            >
                              تعديل
                            </button>

                            {product.is_active ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(product)}
                                style={{ backgroundColor: "#dc2626" }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#b91c1c")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#dc2626")}
                                className="rounded-xl px-2 py-1.5 text-xs font-bold text-white shadow-lg"
                              >
                                حذف
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRestoreProduct(product)}
                                style={{ backgroundColor: "#16a34a" }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#15803d")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#16a34a")}
                                className="rounded-xl px-2 py-1.5 text-xs font-bold text-white shadow-lg"
                              >
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
      </div>

      {printJob && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.6)",
            padding: "16px",
          }}
        >
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-blue-950">إنشاء QR وطباعة الليبل</h2>
            <p className="mt-2 text-gray-500">المنتج: {printJob.product.product_number}</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">كمية الليبلات / QR</label>
                <input
                  type="number"
                  min="1"
                  value={printJob.quantity}
                  onChange={(event) => setPrintJob((previous) => (previous ? { ...previous, quantity: event.target.value } : previous))}
                  className="w-full rounded-2xl border border-gray-300 bg-yellow-50 px-4 py-3 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">قالب الليبل</label>
                <select
                  value={printJob.templateId}
                  onChange={(event) => setPrintJob((previous) => (previous ? { ...previous, templateId: event.target.value } : previous))}
                  className="w-full rounded-2xl border border-gray-300 bg-blue-50 px-4 py-3 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">اختر قالب الليبل</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.template_name} — {template.width_mm}×{template.height_mm} mm
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleGenerateAndPrint}
                disabled={isPrintingJob}
                style={{ backgroundColor: isPrintingJob ? "#9ca3af" : "#16a34a" }}
                onMouseEnter={(e) => {
                  if (!isPrintingJob) e.currentTarget.style.backgroundColor = "#15803d";
                }}
                onMouseLeave={(e) => {
                  if (!isPrintingJob) e.currentTarget.style.backgroundColor = "#16a34a";
                }}
                className="flex-1 rounded-2xl px-6 py-4 font-bold text-white shadow-lg"
              >
                {isPrintingJob ? "جاري الإنشاء..." : "إنشاء وفتح الطباعة"}
              </button>

              <button
                type="button"
                onClick={() => setPrintJob(null)}
                disabled={isPrintingJob}
                style={{ backgroundColor: "#dc2626" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#b91c1c")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#dc2626")}
                className="rounded-2xl px-6 py-4 font-bold text-white shadow-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.8)",
            padding: "24px",
            cursor: "zoom-out",
          }}
        >
          <img
            src={zoomedImage}
            alt="صورة المنتج مكبّرة"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: "16px",
              backgroundColor: "#fff",
              padding: "12px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          />
          <button
            type="button"
            onClick={() => setZoomedImage(null)}
            style={{
              position: "fixed",
              top: "20px",
              left: "20px",
              width: "44px",
              height: "44px",
              borderRadius: "9999px",
              backgroundColor: "#fff",
              color: "#0f172a",
              fontSize: "22px",
              fontWeight: "bold",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>
      )}

      {deleteConfirmProduct && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.6)",
            padding: "16px",
          }}
        >
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-3xl">🗑️</div>

            <h2 className="mt-5 text-xl font-black text-slate-900">تأكيد الحذف</h2>

            <p className="mt-3 text-gray-500">
              هل تريد فعلاً حذف/إيقاف المنتج رقم{" "}
              <span className="font-bold text-slate-900" dir="ltr">
                {deleteConfirmProduct.product_number}
              </span>
              {" "}({deleteConfirmProduct.product_name_ar || deleteConfirmProduct.product_name_en})؟
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={confirmDeleteProduct}
                disabled={isDeleting}
                style={{ backgroundColor: isDeleting ? "#9ca3af" : "#dc2626" }}
                onMouseEnter={(e) => {
                  if (!isDeleting) e.currentTarget.style.backgroundColor = "#b91c1c";
                }}
                onMouseLeave={(e) => {
                  if (!isDeleting) e.currentTarget.style.backgroundColor = "#dc2626";
                }}
                className="flex-1 rounded-2xl px-6 py-4 font-bold text-white shadow-lg"
              >
                {isDeleting ? "جاري الحذف..." : "نعم، احذف"}
              </button>

              <button
                type="button"
                onClick={() => setDeleteConfirmProduct(null)}
                disabled={isDeleting}
                style={{ backgroundColor: "#9ca3af" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#6b7280")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#9ca3af")}
                className="flex-1 rounded-2xl px-6 py-4 font-bold text-white shadow-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
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
  placeholder: string;
  type?: string;
  ltr?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-gray-700">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        dir={ltr ? "ltr" : "rtl"}
        className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-600"
      />
    </div>
  );
}