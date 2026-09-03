-- ==============================================================================
-- Seed Data: عيادة الدكتور عبد الكريم عليوي (بيانات تجريبية عربية)
-- ==============================================================================

-- ملاحظة: في بيئة الإنتاج، يتم إنشاء المستخدمين عبر Supabase Auth
-- هذه البيانات التجريبية مخصصة للاختبار والتطوير المحلي فقط

DO $$
DECLARE
    doc_id UUID := '00000000-0000-0000-0000-000000000001';
    sec_id UUID := '00000000-0000-0000-0000-000000000002';
    p1_id UUID := uuid_generate_v4();
    p2_id UUID := uuid_generate_v4();
    p3_id UUID := uuid_generate_v4();
    v1_id UUID := uuid_generate_v4();
    v2_id UUID := uuid_generate_v4();
    v3_id UUID := uuid_generate_v4();
    rx1_id UUID := uuid_generate_v4();
BEGIN
    -- بيانات الأطفال التجريبية
    INSERT INTO patients (id, file_number, full_name, date_of_birth, gender, blood_type, allergies, chronic_diseases, past_surgeries, medical_notes)
    VALUES 
    (p1_id, 'P-1001', 'يوسف أحمد العلي', CURRENT_DATE - INTERVAL '3 years 2 months', 'male', 'O+', 'حساسية من البنسلين (Penicillin)', 'ربو أطفال خفيف', 'لا توجد', 'يحتاج فحص دوري للصدر عند نزلات البرد'),
    (p2_id, 'P-1002', 'مريم خالد المنصور', CURRENT_DATE - INTERVAL '8 months', 'female', 'A+', NULL, NULL, NULL, 'ولادة طبيعية، الرضاعة طبيعية'),
    (p3_id, 'P-1003', 'زين الدين عمر السعدي', CURRENT_DATE - INTERVAL '5 years 6 months', 'male', 'B+', 'حساسية من الفول السوداني', NULL, 'استئصال اللوزتين واللحمية (2025)', 'طفل نشيط وشهيته جيدة')
    ON CONFLICT (id) DO NOTHING;

    -- بيانات أولياء الأمور
    INSERT INTO guardians (patient_id, full_name, relationship, primary_phone, secondary_phone, address)
    VALUES
    (p1_id, 'أحمد العلي', 'الأب', '07701234567', '07801234567', 'بغداد - المنصور - محلة 602'),
    (p2_id, 'خالد المنصور', 'الأب', '07719876543', NULL, 'بغداد - الكرخ - حي الجامعة'),
    (p3_id, 'عمر السعدي', 'الأب', '07725556677', '07901112233', 'بغداد - الكاظمية')
    ON CONFLICT DO NOTHING;

    -- زيارات تجريبية بحالات مختلفة
    -- زيارة 1: مكتملة مع قياسات وتشخيص ووصفة
    INSERT INTO visits (id, patient_id, visit_date, status, chief_complaint, completed_at, approved_at)
    VALUES (v1_id, p1_id, NOW() - INTERVAL '2 days', 'completed', 'ارتفاع حرارة وسعال مستمر منذ يومين', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');

    INSERT INTO measurements (visit_id, patient_id, weight_kg, height_cm, temperature_c, oxygen_saturation)
    VALUES (v1_id, p1_id, 14.5, 95.0, 38.5, 98.0);

    INSERT INTO diagnoses (visit_id, patient_id, symptoms, present_illness_history, clinical_examination, diagnosis_text, doctor_notes, recommendations, follow_up_date)
    VALUES (v1_id, p1_id, 'حرارة 38.5، سعال رطب، رشح', 'بدأت الأعراض قبل 48 ساعة بعد التعرض لتيار هوائي بارد', 'احتقان بالبلعوم، لا يوجد صفير حاد بالصدر', 'التهاب القصبات الهوائية الفيروسي الحاد (Acute Viral Bronchitis)', 'تجنب البنسلين ومشتقاته بسبب الحساسية', 'الإكثار من السوائل الدافئة والراحة التامة وتناول خافض الحرارة عند اللزوم', CURRENT_DATE + INTERVAL '5 days');

    INSERT INTO prescriptions (id, visit_id, patient_id, prescription_type, is_approved, approved_at, general_instructions)
    VALUES (rx1_id, v1_id, p1_id, 'digital', true, NOW() - INTERVAL '2 days', 'يرجى الالتزام بمواعيد الجرعات، ومراجعة العيادة في حال استمرار الحرارة لأكثر من 3 أيام.');

    INSERT INTO prescription_items (prescription_id, sort_order, medication_name, strength, dosage_form, dose, frequency, duration, route_or_instructions)
    VALUES
    (rx1_id, 1, 'Paracetamol Syrup (شراب باراسيتامول)', '120mg / 5ml', 'syrup', '5 مل', 'كل 6 ساعات عند اللزوم', '3 أيام', 'يؤخذ بالفم بعد الرضاعة/الأكل'),
    (rx1_id, 2, 'Prospan Syrup (شراب بلاب)', 'Standard', 'syrup', '2.5 مل', '3 مرات يومياً', '5 أيام', 'يؤخذ بالفم مع ماء دافئ');

    -- زيارة 2: بانتظار الطبيب (Waiting)
    INSERT INTO visits (id, patient_id, visit_date, status, chief_complaint)
    VALUES (v2_id, p2_id, NOW() - INTERVAL '15 minutes', 'waiting', 'مراجعة دورية وتأخر في التسنين مع إسهال خفيف');

    INSERT INTO measurements (visit_id, patient_id, weight_kg, height_cm, temperature_c, oxygen_saturation)
    VALUES (v2_id, p2_id, 8.2, 69.0, 37.1, 99.0);

    -- زيارة 3: قيد الفحص (In Progress)
    INSERT INTO visits (id, patient_id, visit_date, status, chief_complaint)
    VALUES (v3_id, p3_id, NOW() - INTERVAL '5 minutes', 'in_progress', 'ألم في البطن وقيء منذ الصباح');

    INSERT INTO measurements (visit_id, patient_id, weight_kg, height_cm, temperature_c, oxygen_saturation)
    VALUES (v3_id, p3_id, 19.8, 112.0, 37.4, 98.5);

END $$;
