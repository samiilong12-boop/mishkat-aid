import {
  DropdownListRecord,
  AppSettings,
  UserAccount,
  TrustedDevice,
  DonorRecord,
  ProjectRecord,
  DonationRecord,
  InventoryItemRecord,
  ImpactStoryRecord,
  ComplaintRecord,
} from '../types/models';

export const FIXED_CASE_STATUSES = [
  { value: 'قيد الدراسة', label_ar: 'قيد الدراسة', colorToken: 'warning', hex: '#F2A900', icon: '⏰' },
  { value: 'مقبول', label_ar: 'مقبول', colorToken: 'approved', hex: '#3B82C4', icon: '✓' },
  { value: 'تم الصرف', label_ar: 'تم الصرف', colorToken: 'success', hex: '#2E9E6B', icon: '✓' },
  { value: 'مرفوض', label_ar: 'مرفوض', colorToken: 'danger', hex: '#D64545', icon: '✕' },
] as const;

export const FOLLOWUP_TYPES = [
  'زيارة منزلية',
  'زيارة ميدانية',
  'اتصال هاتفي',
  'مقابلة بالمركز',
] as const;

export const CASE_FIELD_LABELS_AR: Record<string, string> = {
  reg_date: 'تاريخ التسجيل',
  name: 'اسم المستفيد (رب الأسرة)',
  national_id: 'رقم الهوية / الجواز',
  nationality: 'الجنسية',
  referral: 'جهة الإحالة',
  phone: 'الهاتف الأساسي',
  phone2: 'هاتف إضافي / واتساب',
  general_area: 'المنطقة العامة',
  address: 'العنوان بالتفصيل',
  marital: 'الحالة والتصنيف الاجتماعي (أرملة، مطلقة، يتيم...)',
  breadwinner: 'اسم المعيل',
  breadwinner_rel: 'صلة قرابة المعيل',
  family_count: 'عدد أفراد الأسرة',
  family_names: 'أسماء أفراد الأسرة',
  housing_type: 'نوع السكن',
  income_status: 'حالة الدخل',
  health: 'الحالة الصحية',
  health_desc: 'وصف الحالة الصحية والتشخيص',
  aid_cat: 'فئة المساعدة الرئيسية',
  aid_types: 'نوع المساعدة المحددة',
  need_desc: 'وصف حالة الأسرة والاحتياج',
  status: 'حالة الطلب',
  disb_date: 'تاريخ الصرف',
  proof_method: 'طريقة إثبات الاستلام',
  notes: 'ملاحظات الباحث/مسؤول الحالة',
  workflow_stage: 'مرحلة سير العمل والاعتماد',
};

const toItems = (values: string[]) =>
  values.map((v, idx) => ({
    value: v,
    label_ar: v,
    active: true,
    sort_order: idx + 1,
  }));

export const DEFAULT_NATIONALITIES = [
  'مصري',
  'سوري',
  'سوداني',
  'فلسطيني',
  'يمني',
  'ليبي',
  'عراقي',
  'لبناني',
  'أخرى',
];

export const DEFAULT_REFERRALS = [
  'تقديم مباشر',
  'إحالة منظمة',
  'زيارة ميدانية',
  'مبادرة مجتمعية',
  'معارف',
];

export const DEFAULT_MARITAL_STATUSES = [
  'أرملة (تعيل أيتام)',
  'مطلقة (تعيل أطفال)',
  'يتيم / أسرة أيتام',
  'متزوج (أسرة مستورة)',
  'مهجورة / فاقد العائل',
  'أسرة سجين',
  'مسن / عاجز بلا معيل',
  'أرمل',
  'أرملة',
  'مطلق',
  'مطلقة',
  'أعزب',
  'غير ذلك',
];

export const DEFAULT_HEALTH_STATUSES = ['سليم', 'مرض مزمن', 'إعاقة', 'احتياج خاص'];

export const DEFAULT_AID_CATEGORIES = ['عينية', 'مساعدات شتوية', 'مادية', 'طبية'];

export const DEFAULT_WINTER_AID_ITEMS = [
  'بطاطين / ألحفة',
  'فرش ومفارش (مراتب / جرايات)',
  'ملابس شتوية (أطفال / كبار)',
  'أحذية شتوية / جزم',
  'دفايات / مستلزمات تدفئة',
  'عزل سقف / مشمعات حماية من الأمطار',
  'حطب / وقود تدفئة',
];

export const DEFAULT_GENERAL_AID_ITEMS = [
  'سهم جاهز',
  'طرد / سلة مواد غذائية',
  'مساعدات مادية',
  'أدوية وعلاج طبي شهري',
  'عمليات جراحية / فحوصات طبية',
  'أجهزة تعويضية / مستلزمات إعاقة',
];

export const DEFAULT_PROOF_METHODS = [
  'كشف توقيع المستفيد',
  'فاتورة شراء',
  'إيصال استلام نقدية',
  'صورة استلام',
];

export const DEFAULT_HOUSING_TYPES = [
  'إيجار',
  'تمليك متواضع',
  'إيواء / غرفة مشتركة',
  'سكن غير ملائم / سقف بحاجة لعزل',
];

export const DEFAULT_INCOME_STATUSES = [
  'بلا دخل (منقطع)',
  'دخل غير منتظم (يومية)',
  'معاش ضعيف',
  'دخل ثابت محدود',
];

export interface SectorHierarchy {
  sector: string;
  subDistricts: string[];
}

export const EGYPT_SECTORS_HIERARCHY: SectorHierarchy[] = [
  {
    sector: 'مدينة 6 أكتوبر والشيخ زايد',
    subDistricts: [
      'الحي الأول',
      'الحي الثاني',
      'الحي الثالث',
      'الحي الرابع',
      'الحي الخامس والسادس',
      'الحي السابع والثامن',
      'الحي العاشر والحادي عشر',
      'الحي الثاني عشر',
      'بيت العيلة',
      'مساكن أبناء الجيزة',
      'مساكن عثمان',
      'ابني بيتك',
      'حدائق أكتوبر',
      'جنوب الأحياء',
      'الشيخ زايد والحي السادس عشر',
      'المنطقة الصناعية والتوسعات الشمالية',
    ],
  },
  {
    sector: 'فيصل والجيزة',
    subDistricts: [
      'شارع فيصل الرئيسي',
      'شارع العشرين',
      'شارع حسن محمد',
      'الطالبية فيصل',
      'التعاون / العريش',
      'المطبعة ومحطة مدكور',
      'كفر طهرمس والمساكن',
      'بولاق الدكرور',
      'العمرانية (الغربية والشرقية)',
      'المنيب والكونيسة',
      'ميدان الجيزة وشارع مراد',
      'الحوامدية والبدرشين',
    ],
  },
  {
    sector: 'الهرم وحدائق الأهرام',
    subDistricts: [
      'شارع الهرم الرئيسي',
      'هضبة الأهرام (حدائق الأهرام - البوابات)',
      'المريوطية هرم',
      'اللبيني هرم',
      'منشأة البكاري',
      'نزلة السمان ومشعل',
      'كوم الأخضر وكفر الجبل',
    ],
  },
  {
    sector: 'القاهرة الكبرى والقطاعات الشعبية',
    subDistricts: [
      'عين شمس والمطرية',
      'عزبة الهجانة (مدينة الأمل)',
      'منشأة ناصر والدويقة',
      'المرج والسلام',
      'حلوان والتبين والمعصرة',
      'دار السلام والبساتين',
      'الزاوية الحمراء والشرابية',
      'شبرا مصر وروض الفرج',
      'مصر القديمة وعزبة خير الله',
    ],
  },
  {
    sector: 'القليوبية وشبرا الخيمة',
    subDistricts: [
      'شبرا الخيمة (شرق وغرب)',
      'بهتيم ومسطرد',
      'الخصوص والخانكة',
      'القناطر الخيرية',
      'قليوب وطوخ',
      'بنها وقراها',
    ],
  },
  {
    sector: 'محافظات الصعيد (الفيوم / بني سويف / المنيا / أسيوط)',
    subDistricts: [
      'الفيوم — مركز ومدينة الفيوم',
      'الفيوم — ريف إطسا ويوسف الصديق وطامية',
      'بني سويف — ريف ببا والفشن وناصر',
      'المنيا — ريف ملوي وسمالوط ومغاغة',
      'أسيوط وسوهاج وقنا والأقصر وأسوان',
    ],
  },
  {
    sector: 'محافظات الوجه البحري والدلتا والقناة',
    subDistricts: [
      'الشرقية — بلبيس والزقازيق والعاشر من رمضان',
      'الدقهلية — المنصورة والسنبلاوين وميت غمر',
      'البحيرة — كفر الدوار ودمنهور',
      'الغربية والمنوفية وكفر الشيخ',
      'مدن القناة (الإسماعيلية / بورسعيد / السويس)',
      'الإسكندرية والمناطق الشعبية',
    ],
  },
  {
    sector: 'محافظات ومناطق حدودية وأخرى',
    subDistricts: [
      'شمال وجنوب سيناء',
      'مطروح والساحل الشمالي',
      'البحر الأحمر والوادي الجديد',
      'منطقة المركز وضواحيها',
      'قرى وأطراف نائية',
    ],
  },
];

export function getSubDistrictsForSector(sectorName: string): string[] {
  const found = EGYPT_SECTORS_HIERARCHY.find((s) => s.sector === sectorName);
  return found ? found.subDistricts : [];
}

export function detectSectorAndSubDistrict(generalArea: string): { sector: string; subDistrict: string } {
  if (!generalArea) {
    return {
      sector: EGYPT_SECTORS_HIERARCHY[0].sector,
      subDistrict: EGYPT_SECTORS_HIERARCHY[0].subDistricts[0],
    };
  }
  const parts = generalArea.split(' — ');
  if (parts.length >= 2) {
    const rawSector = parts[0].trim();
    const rawSub = parts[1].trim();
    const matchedSector = EGYPT_SECTORS_HIERARCHY.find(
      (s) => s.sector === rawSector || s.sector.includes(rawSector) || rawSector.includes(s.sector)
    );
    if (matchedSector) {
      return { sector: matchedSector.sector, subDistrict: rawSub };
    }
    return { sector: rawSector, subDistrict: rawSub };
  }
  for (const s of EGYPT_SECTORS_HIERARCHY) {
    if (s.sector === generalArea || s.sector.includes(generalArea)) {
      return { sector: s.sector, subDistrict: s.subDistricts[0] };
    }
    const foundSub = s.subDistricts.find((sub) => sub === generalArea || generalArea.includes(sub));
    if (foundSub) {
      return { sector: s.sector, subDistrict: foundSub };
    }
  }
  return { sector: EGYPT_SECTORS_HIERARCHY[0].sector, subDistrict: generalArea };
}

export const DEFAULT_DROPDOWN_LISTS: DropdownListRecord[] = [
  {
    key: 'nationality',
    title_ar: 'الجنسية',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_NATIONALITIES),
  },
  {
    key: 'referral',
    title_ar: 'جهة الإحالة / المصدر',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_REFERRALS),
  },
  {
    key: 'marital',
    title_ar: 'الحالة والتصنيف الاجتماعي (أرملة، مطلقة، يتيم...)',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_MARITAL_STATUSES),
  },
  {
    key: 'health',
    title_ar: 'الحالة الصحية',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_HEALTH_STATUSES),
  },
  {
    key: 'aid_cat',
    title_ar: 'فئة المساعدة الرئيسية',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_AID_CATEGORIES),
  },
  {
    key: 'aid_winter',
    title_ar: 'المساعدات الشتوية (اختيار متعدد)',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_WINTER_AID_ITEMS),
  },
  {
    key: 'aid_general',
    title_ar: 'المساعدات العامة والعينية والطبية (اختيار متعدد)',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_GENERAL_AID_ITEMS),
  },
  {
    key: 'proof_method',
    title_ar: 'طريقة إثبات الاستلام',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_PROOF_METHODS),
  },
  {
    key: 'governorate_sector',
    title_ar: 'المحافظة / القطاع الرئيسي',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(EGYPT_SECTORS_HIERARCHY.map((s) => s.sector)),
  },
  {
    key: 'general_area',
    title_ar: 'المنطقة العامة والحي (لتقارير الداعمين والخريطة)',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems([
      '6 أكتوبر — الحي الثاني',
      '6 أكتوبر — الحي الثالث',
      '6 أكتوبر — بيت العيلة',
      '6 أكتوبر — مساكن أبناء الجيزة',
      '6 أكتوبر — حدائق أكتوبر',
      'فيصل — شارع العشرين',
      'فيصل — الطالبية',
      'فيصل — حسن محمد',
      'فيصل — بولاق الدكرور',
      'الهرم — هضبة الأهرام',
      'القاهرة — عزبة الهجانة',
      'القاهرة — منشأة ناصر',
      'القليوبية — شبرا الخيمة',
      'الفيوم — ريف إطسا ويوسف الصديق',
      'بني سويف — ريف ببا والفشن',
      'القطاع الشمالي',
      'القطاع الجنوبي',
      'القطاع الشرقي',
      'القطاع الغربي',
      'منطقة المركز والقرى المجاورة',
      'القرى والأطراف النائية',
    ]),
  },
  {
    key: 'housing_type',
    title_ar: 'نوع السكن',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_HOUSING_TYPES),
  },
  {
    key: 'income_status',
    title_ar: 'حالة الدخل',
    editable: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    items: toItems(DEFAULT_INCOME_STATUSES),
  },
];

export const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'user-admin-1',
    name: 'أ. خالد المنشاوي (مدير النظام)',
    email_or_phone: 'admin@mishkat-aid.org',
    role: 'admin',
    role_label_ar: 'مدير النظام',
    status: 'active',
    pin_code: '1234',
    can_view_sensitive_health: true,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-worker-1',
    name: 'أحمد منصور (باحث ميداني أول)',
    email_or_phone: 'ahmed.field@mishkat-aid.org',
    role: 'case_worker',
    role_label_ar: 'باحث اجتماعي / مسؤول حالات',
    status: 'active',
    pin_code: '1111',
    can_view_sensitive_health: true,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-worker-2',
    name: 'سارة عبد العزيز (باحثة ميدانية)',
    email_or_phone: 'sara.field@mishkat-aid.org',
    role: 'case_worker',
    role_label_ar: 'باحث اجتماعي / مسؤول حالات',
    status: 'active',
    pin_code: '2222',
    can_view_sensitive_health: true,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-entry-1',
    name: 'منى طارق (مدخلة بيانات)',
    email_or_phone: 'mona.entry@mishkat-aid.org',
    role: 'data_entry',
    role_label_ar: 'مدخل بيانات',
    status: 'active',
    pin_code: '3333',
    can_view_sensitive_health: false,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-auditor-1',
    name: 'محاسب/ طارق علام (مراجع داخلي)',
    email_or_phone: 'auditor@mishkat-aid.org',
    role: 'internal_auditor',
    role_label_ar: 'مراجع داخلي',
    status: 'active',
    pin_code: '4444',
    can_view_sensitive_health: true,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-donor-1',
    name: 'مؤسسة الخير للتنمية (حساب داعم)',
    email_or_phone: 'donor@alkhair-org.com',
    role: 'donor',
    role_label_ar: 'داعم (Donor)',
    status: 'active',
    pin_code: '5555',
    can_view_sensitive_health: false,
    donor_id: 'donor-1',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_TRUSTED_DEVICES: TrustedDevice[] = [
  {
    id: 'dev-d1',
    device_code: 'D1',
    device_name: 'لابتوب المركز الرئيسي + تابلت القطاع الشمالي (D1)',
    assigned_user_id: 'user-worker-1',
    assigned_user_name: 'أحمد منصور (باحث ميداني أول)',
    status: 'approved',
    last_sync_at: '2026-10-12T20:00:00.000Z',
  },
  {
    id: 'dev-d2',
    device_code: 'D2',
    device_name: 'هاتف المسح الميداني - القطاع الجنوبي (D2)',
    assigned_user_id: 'user-worker-2',
    assigned_user_name: 'سارة عبد العزيز (باحثة ميدانية)',
    status: 'approved',
    last_sync_at: '2026-10-12T18:30:00.000Z',
  },
  {
    id: 'dev-d3',
    device_code: 'D3',
    device_name: 'جهاز إدخال البيانات بالفرع (D3)',
    assigned_user_id: 'user-entry-1',
    assigned_user_name: 'منى طارق (مدخلة بيانات)',
    status: 'approved',
    last_sync_at: '2026-10-11T15:00:00.000Z',
  },
];

export const DEFAULT_DONORS: DonorRecord[] = [
  {
    id: 'donor-1',
    name: 'مؤسسة الخير للتنمية الإنسانية',
    donor_type: 'مؤسسة مانحة',
    contact_info: 'donor@alkhair-org.com | +201001112233',
    notes: 'شريك استراتيجي لحملة الشتاء والأمن الغذائي',
    visibility_level: 'detailed_anonymized',
    allowed_project_ids: ['project-winter-2026', 'project-food-2026'],
    created_at: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'donor-2',
    name: 'صندوق تكافل الأطباء والمانحين الأفراد',
    donor_type: 'متبرع فردي',
    contact_info: 'medical.fund@donors.org | +201223334455',
    notes: 'داعم مخصص للحالات الطبية العاجلة والأجهزة التعويضية',
    visibility_level: 'standard',
    allowed_project_ids: ['project-medical-2026'],
    created_at: '2026-09-05T00:00:00.000Z',
  },
];

export const DEFAULT_PROJECTS: ProjectRecord[] = [
  {
    id: 'project-winter-2026',
    name: 'حملة دفء الشتاء 2026',
    period_label: 'أكتوبر 2026 – فبراير 2027',
    target_budget: 250000,
    currency: 'EGP',
    target_category: 'مساعدات شتوية',
    status: 'نشط',
    created_at: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'project-food-2026',
    name: 'مشروع السلال الغذائية والأمن الغذائي',
    period_label: 'الربع الرابع 2026',
    target_budget: 180000,
    currency: 'EGP',
    target_category: 'عينية',
    status: 'نشط',
    created_at: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'project-medical-2026',
    name: 'صندوق الإغاثة الطبية والأجهزة التعويضية',
    period_label: 'طوال عام 2026',
    target_budget: 150000,
    currency: 'EGP',
    target_category: 'طبية',
    status: 'نشط',
    created_at: '2026-09-05T00:00:00.000Z',
  },
];

export const DEFAULT_DONATIONS: DonationRecord[] = [
  {
    id: 'don-1',
    donor_id: 'donor-1',
    donor_name: 'مؤسسة الخير للتنمية الإنسانية',
    project_id: 'project-winter-2026',
    project_name: 'حملة دفء الشتاء 2026',
    amount: 150000,
    currency: 'EGP',
    date: '2026/09/12',
    collection_method: 'تحويل بنكي',
    is_restricted: true,
    restricted_category: 'مساعدات شتوية',
    notes: 'الدفعة الأولى لتمويل البطاطين والدفايات وعزل الأسقف',
    created_at: '2026-09-12T10:00:00.000Z',
  },
  {
    id: 'don-2',
    donor_id: 'donor-1',
    donor_name: 'مؤسسة الخير للتنمية الإنسانية',
    project_id: 'project-food-2026',
    project_name: 'مشروع السلال الغذائية والأمن الغذائي',
    amount: 90000,
    currency: 'EGP',
    date: '2026/09/20',
    collection_method: 'شيك مصدق',
    is_restricted: true,
    restricted_category: 'عينية',
    notes: 'تمويل 150 طرد مواد غذائية متكامل للأسر الأكثر احتياجاً',
    created_at: '2026-09-20T12:00:00.000Z',
  },
  {
    id: 'don-3',
    donor_id: 'donor-2',
    donor_name: 'صندوق تكافل الأطباء والمانحين الأفراد',
    project_id: 'project-medical-2026',
    project_name: 'صندوق الإغاثة الطبية والأجهزة التعويضية',
    amount: 85000,
    currency: 'EGP',
    date: '2026/09/15',
    collection_method: 'تحويل بنكي',
    is_restricted: true,
    restricted_category: 'طبية',
    notes: 'مخصص للأدوية المزمنة والأجهزة التعويضية',
    created_at: '2026-09-15T09:00:00.000Z',
  },
];

export const DEFAULT_INVENTORY_ITEMS: InventoryItemRecord[] = [
  {
    id: 'inv-blankets',
    name: 'بطاطين / ألحفة شتوية ثقيلة',
    aid_cat: 'مساعدات شتوية',
    unit: 'بطانية',
    qty_in: 400,
    qty_out: 120,
    qty_available: 280,
    min_threshold: 50,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'inv-heaters',
    name: 'دفايات / مستلزمات تدفئة آمنة',
    aid_cat: 'مساعدات شتوية',
    unit: 'دفاية',
    qty_in: 120,
    qty_out: 95,
    qty_available: 25, // Triggers low-stock alert (<= 30)
    min_threshold: 30,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'inv-roof-sheets',
    name: 'عزل سقف / مشمعات حماية من الأمطار',
    aid_cat: 'مساعدات شتوية',
    unit: 'رول عزل',
    qty_in: 80,
    qty_out: 32,
    qty_available: 48,
    min_threshold: 15,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'inv-food-boxes',
    name: 'طرد / سلة مواد غذائية شهرية',
    aid_cat: 'عينية',
    unit: 'طرد غذائي',
    qty_in: 300,
    qty_out: 140,
    qty_available: 160,
    min_threshold: 40,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'inv-medical-kits',
    name: 'حقيبة أدوية وعلاج طبي شهري',
    aid_cat: 'طبية',
    unit: 'حزمة علاجية',
    qty_in: 100,
    qty_out: 35,
    qty_available: 65,
    min_threshold: 20,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
];

export const DEFAULT_IMPACT_STORIES: ImpactStoryRecord[] = [
  {
    id: 'story-1',
    project_id: 'project-winter-2026',
    donor_id: 'donor-1',
    title_ar: 'حماية أسرة مكونة من 6 أفراد من برد وأمطار الشتاء',
    story_ar:
      'بفضل مساهمة حملة دفء الشتاء 2026، تم تزويد أسرة تعيلها أم أرملة (كود مرجعي CS-0001) بـ 4 أطفال أيتام وجدة مسنة بمشمعات عزل لسقف المنزل المتضرر مع بطاطين شتوية وملابس للأطفال، مما وفر لهم بيئة آمنة ودافئة قبل موسم الأمطار دون كشف أي بيانات شخصية للأسرة.',
    title_en: 'Protecting a Family of 6 from Winter Rain and Cold (Case CS-0001)',
    story_en:
      'Through the Winter Warmth 2026 Campaign, a widowed mother supporting 4 orphaned children and an elderly grandmother (Ref: CS-0001) received roof weatherproofing sheets, heavy blankets, and winter clothing, ensuring safe shelter with full beneficiary dignity and zero PII exposure.',
    case_code_ref: 'CS-0001',
    consent_to_share: true,
    is_redacted: true,
    approved_by: 'أ. خالد المنشاوي (مدير النظام)',
    published_date: '2026/09/28',
  },
  {
    id: 'story-2',
    project_id: 'project-food-2026',
    donor_id: 'donor-1',
    title_ar: 'تأمين الاحتياج الغذائي والشتوي لـ 4 أطفال بالقرى النائية',
    story_ar:
      'وصلت فرقنا الميدانية إلى القرى والأطراف النائية لتسليم طرود غذائية متكاملة ومستلزمات تدفئة لأسرة مكونة من 4 أفراد (كود مرجعي CS-0004) تعيلها أم مطلقة وتضم طفلاً من ذوي الاحتياجات الخاصة.',
    title_en: 'Securing Food & Winter Essentials for a Family of 4 in Remote Villages (Case CS-0004)',
    story_en:
      'Our field team delivered comprehensive food parcels and heating supplies to a household of 4 in remote border villages (Ref: CS-0004), supporting a single mother and a child with special rehabilitation needs.',
    case_code_ref: 'CS-0004',
    consent_to_share: true,
    is_redacted: true,
    approved_by: 'أ. خالد المنشاوي (مدير النظام)',
    published_date: '2026/10/06',
  },
];

export const DEFAULT_COMPLAINTS: ComplaintRecord[] = [
  {
    id: 'cmp-1',
    ticket_code: 'CMP-0001',
    case_code: 'CS-0003',
    submitted_date: '2026/10/05',
    channel: 'هاتف الشكاوى',
    category: 'تأخر صرف المساعدة',
    priority: 'عاجلة',
    description:
      'المستفيد يستفسر عن سبب بقاء طلبه قيد الدراسة لأكثر من شهر ويطلب تحديد موعد الزيارة المنزلية.',
    sla_days: 3,
    status: 'قيد المعالجة',
    resolution_notes: 'تم إدراج الحالة في جدول الزيارات العاجلة للباحث الميداني هذا الأسبوع.',
  },
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'default',
  org_name: 'مشكاة للعمل الإنساني',
  org_subtitle: 'نظام إدارة الحالات والمساعدات الإنسانية - هجين يعمل محلياً',
  device_code: 'D1',
  next_case_seq: 1,
  overdue_study_days: 30,
  numeral_system: 'latin',
  dark_mode: false,
  default_currency: 'EGP',
  current_user_id: 'user-admin-1',
  current_user_name: 'أ. خالد المنشاوي (مدير النظام)',
  current_user_role_code: 'admin',
  current_user_role: 'مدير النظام',
  session_timeout_minutes: 15,
  simulated_network_online: true,
  last_synced_at: null,
  financial_approval_limit: 5000,
  small_cell_suppression_min: 5, // Minimum 5 cases per cell for Donor Portal privacy (Section 8.1)
};
