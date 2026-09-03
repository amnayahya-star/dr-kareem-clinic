"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "ar" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  isRTL: boolean;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  ar: {
    // Header & Brand
    clinicName: "عيادة الدكتور عبد الكريم عليوي",
    doctorCredentials: "بورد عربي في طب الأطفال وحديثي الولادة • زميل كلية الأطباء الملكية البريطانية (إدنبرة) FRCP (Edin)",
    doctorConsultantBadge: "الاستشاري والعيادة التخصصية",
    boardCert: "بورد عربي في طب الأطفال وحديثي الولادة",
    royalCollegeFellow: "زميل كلية الأطباء الملكية البريطانية (إدنبرة) FRCP (Edin)",
    doctorPortal: "شاشة الطبيب",
    secretaryPortal: "شاشة السكرتير",
    logout: "تسجيل الخروج",
    connectedDb: "متصل بقاعدة البيانات",
    localPreview: "وضع المعاينة المحلي",

    // Sidebar
    sidebarMedicalMenu: "القائمة الطبية",
    sidebarReceptionMenu: "قائمة الاستقبال",
    navDoctorWorkstation: "شاشة الكشف وسجل الأطفال",
    navChildrenArchive: "أرشيف ملفات الأطفال",
    navAuditLogs: "سجل العمليات",
    navReceptionBoard: "لوحة الاستقبال والبحث",
    navAddNewChild: "إضافة طفل جديد",
    navNewVisitVitals: "فتح زيارة وقياسات",
    sidebarFooterTitle: "عيادة د. عبد الكريم عليوي",
    sidebarFooterSubtitle: "طب الأطفال وحديثي الولادة",

    // Common & Actions
    search: "بحث...",
    cancel: "إلغاء",
    save: "حفظ",
    close: "إغلاق",
    delete: "حذف",
    preview: "معاينة",
    edit: "تعديل",
    back: "رجوع",
    kg: "كغم",
    cm: "سم",
    celsius: "°C",
    age: "العمر",
    gender: "الجنس",
    male: "ذكر",
    female: "أنثى",
    guardian: "ولي الأمر",
    phone: "الهاتف",
    address: "العنوان",
    fileNumber: "رقم الملف",
    visitsCount: "زيارات",
    allergyWarning: "تحذير حساسية مسجلة",
    chronicWarning: "أمراض مزمنة",
    lastVisitDate: "تاريخ آخر زيارة",
    labTestsAndRx: "التحاليل والوصفات",
    action: "الإجراء",
    openFile: "فتح الملف",
    startExam: "بدء الفحص",

    // Date Filters
    filterByDay: "عرض الأطفال حسب اليوم:",
    allPatients: "جميع الأطفال المسجلين",
    todayVisitors: "📅 مراجعين اليوم",
    yesterdayVisitors: "مراجعين يوم أمس",
    pickCustomDay: "أو اختر يوماً محدداً:",

    // Secretary Screen
    receptionScreen: "شاشة الاستقبال",
    receptionDesc: "البحث عن الأطفال، تقسيم المراجعين حسب الأيام، وإدارة ملفات الزيارات",
    addNewChild: "إضافة طفل جديد",
    searchPlaceholderSecretary: "ابحث باسم الطفل، رقم الهاتف، أو رقم الملف (مثال: يوسف، مريم، 0770)...",
    registeredChildrenList: "الأطفال المسجلون في العيادة",
    clickChildToOpen: "اضغط على اسم أي طفل لفتح ملفه وزياراته",
    noChildrenFound: "لا يوجد أطفال يطابقون البحث",
    backToChildrenTable: "العودة لجدول الأطفال",
    addNewVisitBtn: "إضافة زيارة جديدة للطفل",
    visitsHistory: "سجل زيارات الطفل",
    clickToExpandVisit: "انقر على أي زيارة لاستعراض قياساتها وصورها",
    noVisitsRecorded: "لا توجد زيارات سابقة مسجلة لهذا الطفل.",
    visitDay: "زيارة يوم",
    latestVisitBadge: "أحدث زيارة",
    snapDoctorRx: "📸 تصوير وإرفاق وصفة الطبيب بعد خروج الطفل",
    rxSnappedSuccess: "تم التقاط صورة الوصفة (معاينة)",
    addExtraLabPhoto: "+ إضافة / التقاط تحليل إضافي لهذه الزيارة",
    weight: "الوزن",
    temperature: "درجة الحرارة",
    height: "الطول",
    labPhotosTitle: "صور التحاليل المرفقة",
    noLabPhotos: "لا توجد صور تحاليل مرفقة في هذه الزيارة.",
    rxPhotoTitle: "صورة وصفة هذه الزيارة",
    doctorDiagnosisTitle: "تشخيص الطبيب:",
    recommendationsTitle: "توصيات:",

    // New Patient Modal
    addPatientModalTitle: "إضافة طفل جديد إلى العيادة",
    addPatientModalDesc: "تسجيل البيانات الأساسية للطفل وولي الأمر لإنشاء ملف طبي فوري",
    childFullName: "الاسم الكامل للطفل",
    childBirthDate: "تاريخ الميلاد",
    guardianName: "اسم ولي الأمر",
    phoneInput: "رقم الهاتف",
    addressInput: "العنوان / السكن",
    allergiesInput: "الحساسية الدوائية / الغذائية (إن وجدت)",
    chronicInput: "الأمراض المزمنة (إن وجدت)",
    saveAndCreateFile: "حفظ وإنشاء الملف",

    // Snap Rx Modal
    snapRxModalTitle: "تصوير وإرفاق وصفة الطبيب بعد خروج المريض",
    snapRxModalDesc: "التقاط صورة للروشتة الورقية التي كتبها الطبيب لحفظها وأرشفتها في الزيارة",
    snapRxPrompt: "انقر لالتقاط صورة الوصفة بكاميرا التابلت أو اختيارها من الجهاز",
    rxNoteOptional: "ملاحظة على الوصفة (اختياري)",
    saveRxPhotoBtn: "حفظ صورة الوصفة في السجل",
    reSnapPhoto: "إعادة التقاط / اختيار صورة أخرى",

    // Add Extra Lab Modal
    addExtraLabModalTitle: "إضافة تحليل إضافي لهذه الزيارة",
    addExtraLabModalDesc: "التقاط أو رفع صورة تحليل جديدة وإضافتها إلى قائمة تحاليل هذه الزيارة",
    testNameOrType: "اسم أو نوع التحليل",
    saveLabPhotoBtn: "حفظ التحليل في الزيارة",

    // Doctor Screen
    doctorSearchTitle: "البحث السريري وتقسيم المراجعين حسب الأيام",
    searchPlaceholderDoctor: "ابحث باسم الطفل، رقم الهاتف، أو رقم الملف (مثال: يوسف، مريم، 0770)...",
    doctorChildrenList: "سلسلة الأطفال المسجلين في العيادة",
    clickChildToExamine: "انقر على اسم الطفل لبدء الفحص السريري وعرض التحاليل",
    backToDoctorList: "العودة لجدول وسلسلة الأطفال",
    tabClinicalExam: "الفحص والتشخيص",
    tabVisitPhotos: "صور التحاليل والوصفات (حسب الزيارات)",
    tabHistory: "سجل الزيارات",
    vitalsMeasuredBySecretary: "القياسات الحيوية للزيارة الحالية (من السكرتير)",
    clinicalDocTitle: "توثيق الفحص السريري والتشخيص الطبي",
    todayVisitBadge: "زيارة اليوم:",
    symptomsLabel: "الأعراض السريرية وشكوى الأهل",
    clinicalExamLabel: "نتائج الفحص السريري (الأذن، الحنجرة، الصدر، البطن)",
    finalDiagnosisLabel: "التشخيص الطبي النهائي (Final Diagnosis)",
    recommendationsLabel: "التوصيات والتعليمات للأهل",
    doctorNotesLabel: "ملاحظات الطبيب الخاصة",
    approveVisitBtn: "اعتماد وتوثيق الزيارة في السجل",
    approvingBtn: "جاري التوثيق...",
    visitApprovedSuccessTitle: "تم توثيق واعتماد الكشف والتشخيص الطبي للطفل",
    visitApprovedSuccessDesc: "تم حفظ التشخيص، وسيقوم السكرتير بتصوير الوصفة الورقية بعد خروج المريض لأرشفتها في هذه الزيارة.",
    photosArchiveTitle: "أرشيف صور التحاليل والوصفات (مصنفة بالاعتماد على الزيارات)",
    photosArchiveDesc: "يتم تصنيف كل تحليل وصورة وصفة تحت تاريخ الزيارة وقياسات الطفل الخاصة بها لسهولة المتابعة والمقارنة",
    totalVisits: "إجمالي الزيارات:",
    noVisitsOrPhotos: "لا توجد زيارات أو صور تحاليل مسجلة لهذا الطفل.",
    latestVisitText: "الزيارة الأحدث",
    attachedLabTestsCount: "صور التحاليل والأشعة المرفقة",
    noLabsForThisVisit: "لا توجد تحاليل مرفقة لهذه الزيارة",
    noRxForThisVisit: "لم يتم تصوير وصفة هذه الزيارة بعد",
    viewRxPhotoBtn: "معاينة صورة الوصفة",

    // New Visit Page
    backToReception: "العودة لشاشة الاستقبال",
    visitRegisteredSuccess: "تم تسجيل زيارة الطفل بنجاح",
    visitRegisteredSuccessDesc: "تم حفظ القياسات وإرفاق التحاليل في هذه الجلسة، وأصبحت متاحة فوراً للطبيب.",
    addAnotherVisitBtn: "إضافة زيارة أخرى",
    backToChildFile: "العودة لملف الطفل",
    switchChild: "تبديل الطفل المحدد:",
    vitalsSectionTitle: "1. قياسات الطفل للزيارة الحالية",
    weightInputLabel: "الوزن (كيلوغرام)",
    tempInputLabel: "درجة الحرارة (°C)",
    heightInputLabel: "الطول (سنتيمتر - اختياري)",
    multiLabSectionTitle: "2. صور تحاليل وأشعة الزيارة (يمكنك إضافة أكثر من تحليل)",
    multiLabSectionDesc: "التقط أو ارفع صورة لكل تحليل بشكل منفصل (مثلاً: صورة CBC + صورة CRP + صورة أشعة)",
    testsAttachedInSession: "تحاليل مرفقة في هذه الجلسة",
    chooseOrTypeName: "اختر نوع أو اسم التحليل قبل التصوير/الرفع (اختياري):",
    customTestPlaceholder: "أو اكتب اسم تحليل مخصص هنا (مثال: فحص كالسيوم، صورة رنين...)",
    snapLabPrompt: "انقر لالتقاط صورة التحليل بالكاميرا أو اختيار صورة من المعرض",
    snapLabBtn: "+ التقاط / إضافة صورة تحليل الآن",
    attachedLabsList: "قائمة التحاليل المرفقة للطفل في هذه الجلسة",
    snapAnotherLabBtn: "+ التقاط تحليل آخر إضافي للطفل",
    saveVisitAndSendToDoctor: "حفظ الزيارة وإتاحتها للطبيب",
  },
  en: {
    // Header & Brand
    clinicName: "Dr. Abdul Karim Aliwi Clinic",
    doctorCredentials: "Arab Board in Pediatrics & Neonatology • FRCP (Edin) Fellow",
    doctorConsultantBadge: "Consultant & Specialized Pediatric Clinic",
    boardCert: "Arab Board in Pediatrics & Neonatology",
    royalCollegeFellow: "Fellow of the Royal College of Physicians (Edinburgh) FRCP (Edin)",
    doctorPortal: "Doctor Portal",
    secretaryPortal: "Reception Portal",
    logout: "Logout",
    connectedDb: "Connected to Database",
    localPreview: "Local Preview Mode",

    // Sidebar
    sidebarMedicalMenu: "Medical Menu",
    sidebarReceptionMenu: "Reception Menu",
    navDoctorWorkstation: "Doctor Workstation & Directory",
    navChildrenArchive: "Children Medical Archive",
    navAuditLogs: "Audit Activity Logs",
    navReceptionBoard: "Reception & Live Search",
    navAddNewChild: "Add New Child",
    navNewVisitVitals: "New Visit & Vitals",
    sidebarFooterTitle: "Dr. Abdul Karim Aliwi Clinic",
    sidebarFooterSubtitle: "Pediatrics & Neonatology",

    // Common & Actions
    search: "Search...",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    delete: "Delete",
    preview: "Preview",
    edit: "Edit",
    back: "Back",
    kg: "kg",
    cm: "cm",
    celsius: "°C",
    age: "Age",
    gender: "Gender",
    male: "Male",
    female: "Female",
    guardian: "Guardian",
    phone: "Phone",
    address: "Address",
    fileNumber: "File No.",
    visitsCount: "visits",
    allergyWarning: "Documented Allergy Warning",
    chronicWarning: "Chronic Diseases",
    lastVisitDate: "Last Visit Date",
    labTestsAndRx: "Lab Tests & Rx",
    action: "Action",
    openFile: "Open File",
    startExam: "Start Exam",

    // Date Filters
    filterByDay: "Filter Children by Day:",
    allPatients: "All Registered Children",
    todayVisitors: "📅 Today's Visitors",
    yesterdayVisitors: "Yesterday's Visitors",
    pickCustomDay: "Or select a specific date:",

    // Secretary Screen
    receptionScreen: "Reception Workstation",
    receptionDesc: "Search children, filter daily clinic visitors, and manage visit files",
    addNewChild: "Add New Child",
    searchPlaceholderSecretary: "Search by child name, phone, or file number (e.g. Youssef, Maryam, 0770)...",
    registeredChildrenList: "Children Registered in the Clinic",
    clickChildToOpen: "Click on any child to open their file and visit history",
    noChildrenFound: "No children match the search query",
    backToChildrenTable: "Back to Children Table",
    addNewVisitBtn: "Add New Visit for Child",
    visitsHistory: "Child's Visit History",
    clickToExpandVisit: "Click any visit to expand vitals and medical photos",
    noVisitsRecorded: "No previous visits recorded for this child.",
    visitDay: "Visit on",
    latestVisitBadge: "Latest Visit",
    snapDoctorRx: "📸 Snap & Attach Doctor Prescription after visit",
    rxSnappedSuccess: "Prescription Photo Attached (Preview)",
    addExtraLabPhoto: "+ Add / Snap Extra Lab Test for this Visit",
    weight: "Weight",
    temperature: "Temperature",
    height: "Height",
    labPhotosTitle: "Attached Lab Test Photos",
    noLabPhotos: "No lab test photos attached to this visit.",
    rxPhotoTitle: "Prescription Photo for this Visit",
    doctorDiagnosisTitle: "Doctor Diagnosis:",
    recommendationsTitle: "Recommendations:",

    // New Patient Modal
    addPatientModalTitle: "Register New Child to Clinic",
    addPatientModalDesc: "Enter child and guardian details to instantly create a medical file",
    childFullName: "Child's Full Name",
    childBirthDate: "Date of Birth",
    guardianName: "Guardian Name",
    phoneInput: "Phone Number",
    addressInput: "Address / City",
    allergiesInput: "Drug / Food Allergies (if any)",
    chronicInput: "Chronic Illnesses (if any)",
    saveAndCreateFile: "Save & Create Medical File",

    // Snap Rx Modal
    snapRxModalTitle: "Snap & Attach Doctor Prescription",
    snapRxModalDesc: "Capture photo of written prescription to archive under this visit",
    snapRxPrompt: "Click to take photo with tablet camera or choose from device",
    rxNoteOptional: "Prescription Note (Optional)",
    saveRxPhotoBtn: "Save Prescription Photo to Record",
    reSnapPhoto: "Retake / Choose Another Photo",

    // Add Extra Lab Modal
    addExtraLabModalTitle: "Add Extra Lab Test to this Visit",
    addExtraLabModalDesc: "Capture or upload a new lab test photo and attach it to this visit",
    testNameOrType: "Test Name or Type",
    saveLabPhotoBtn: "Save Lab Test to Visit",

    // Doctor Screen
    doctorSearchTitle: "Clinical Search & Daily Visitors",
    searchPlaceholderDoctor: "Search by child name, phone, or file number (e.g. Youssef, Maryam, 0770)...",
    doctorChildrenList: "Clinic Registered Children Directory",
    clickChildToExamine: "Click child name to start clinical examination and view lab photos",
    backToDoctorList: "Back to Children Directory",
    tabClinicalExam: "Clinical Exam & Diagnosis",
    tabVisitPhotos: "Lab Photos & Rx (By Visit)",
    tabHistory: "Visit History",
    vitalsMeasuredBySecretary: "Current Visit Vitals (from Reception)",
    clinicalDocTitle: "Document Clinical Exam & Diagnosis",
    todayVisitBadge: "Today's Visit:",
    symptomsLabel: "Clinical Symptoms & Parental Complaint",
    clinicalExamLabel: "Clinical Examination Findings (ENT, Chest, Abdomen)",
    finalDiagnosisLabel: "Final Medical Diagnosis",
    recommendationsLabel: "Recommendations & Instructions for Parents",
    doctorNotesLabel: "Doctor's Private Notes",
    approveVisitBtn: "Approve & Document Visit in Record",
    approvingBtn: "Documenting...",
    visitApprovedSuccessTitle: "Clinical Diagnosis Documented & Approved Successfully",
    visitApprovedSuccessDesc: "Diagnosis is saved. Receptionist will snapshot the paper prescription after patient exit.",
    photosArchiveTitle: "Lab Tests & Prescriptions Archive (Grouped by Visits)",
    photosArchiveDesc: "Each test and prescription photo is categorized under its specific visit date and vitals",
    totalVisits: "Total Visits:",
    noVisitsOrPhotos: "No visits or lab test photos recorded for this child.",
    latestVisitText: "Latest Visit",
    attachedLabTestsCount: "Attached Lab & Imaging Photos",
    noLabsForThisVisit: "No lab tests attached to this visit",
    noRxForThisVisit: "Prescription for this visit has not been snapped yet",
    viewRxPhotoBtn: "Preview Prescription Photo",

    // New Visit Page
    backToReception: "Back to Reception Screen",
    visitRegisteredSuccess: "Child Visit Registered Successfully",
    visitRegisteredSuccessDesc: "Vitals and lab tests saved for this session and are immediately accessible to the Doctor.",
    addAnotherVisitBtn: "Add Another Visit",
    backToChildFile: "Back to Child File",
    switchChild: "Switch Selected Child:",
    vitalsSectionTitle: "1. Child Vitals for Current Visit",
    weightInputLabel: "Weight (kg)",
    tempInputLabel: "Temperature (°C)",
    heightInputLabel: "Height (cm - optional)",
    multiLabSectionTitle: "2. Lab & Imaging Photos (You can add multiple tests)",
    multiLabSectionDesc: "Capture or upload separate photos for each lab test (e.g. CBC photo + CRP photo + X-Ray)",
    testsAttachedInSession: "tests attached in this session",
    chooseOrTypeName: "Select test type/name before capture (Optional):",
    customTestPlaceholder: "Or type a custom test name (e.g. Serum Calcium, MRI...)",
    snapLabPrompt: "Click to capture lab photo with camera or select from gallery",
    snapLabBtn: "+ Capture / Add Lab Test Photo Now",
    attachedLabsList: "Attached Lab Tests for Child in this Session",
    snapAnotherLabBtn: "+ Capture Another Additional Lab Test",
    saveVisitAndSendToDoctor: "Save Visit & Make Available to Doctor",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>("ar");

  useEffect(() => {
    const savedLang = localStorage.getItem("dr_kareem_lang") as Language;
    if (savedLang === "ar" || savedLang === "en") {
      setLanguageState(savedLang);
      document.documentElement.dir = savedLang === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = savedLang;
    } else {
      document.documentElement.dir = "rtl";
      document.documentElement.lang = "ar";
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("dr_kareem_lang", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  };

  const toggleLanguage = () => {
    setLanguage(language === "ar" ? "en" : "ar");
  };

  const isRTL = language === "ar";

  const t = (key: string): string => {
    return translations[language][key] || translations["ar"][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, isRTL, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
