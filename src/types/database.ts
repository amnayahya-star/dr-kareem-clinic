export type UserRole = 'doctor' | 'secretary';
export type Gender = 'male' | 'female';
export type VisitStatus = 'draft' | 'waiting' | 'in_progress' | 'completed' | 'cancelled';

export type DosageForm = 
  | 'syrup'
  | 'tablets'
  | 'capsules'
  | 'drops'
  | 'injections'
  | 'ointment_cream'
  | 'suppository'
  | 'inhaler_spray'
  | 'other';

export type AttachmentType = 
  | 'lab_test'
  | 'xray_imaging'
  | 'medical_report'
  | 'previous_prescription'
  | 'current_visit_prescription'
  | 'other_document';

export type AuditActionType = 
  | 'create_patient'
  | 'update_patient'
  | 'open_visit'
  | 'change_visit_status'
  | 'save_diagnosis'
  | 'create_prescription'
  | 'approve_prescription'
  | 'complete_visit'
  | 'add_attachment'
  | 'delete_attachment'
  | 'unauthorized_attempt'
  | 'other';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Guardian {
  id: string;
  patient_id: string;
  full_name: string;
  relationship: string;
  primary_phone: string;
  secondary_phone?: string | null;
  address?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  file_number: string;
  full_name: string;
  date_of_birth: string;
  gender: Gender;
  blood_type?: string | null;
  allergies?: string | null;
  chronic_diseases?: string | null;
  past_surgeries?: string | null;
  medical_notes?: string | null;
  is_archived: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  guardian?: Guardian;
  guardians?: Guardian[];
}

export interface Measurement {
  id: string;
  visit_id: string;
  patient_id: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  temperature_c?: number | null;
  blood_pressure?: string | null;
  oxygen_saturation?: number | null;
  recorded_by?: string | null;
  created_at: string;
}

export interface Diagnosis {
  id: string;
  visit_id: string;
  patient_id: string;
  doctor_id?: string | null;
  symptoms?: string | null;
  present_illness_history?: string | null;
  clinical_examination?: string | null;
  diagnosis_text: string;
  doctor_notes?: string | null;
  recommendations?: string | null;
  follow_up_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  sort_order: number;
  medication_name: string;
  strength?: string | null;
  dosage_form: DosageForm;
  dose: string;
  frequency: string;
  duration: string;
  route_or_instructions?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface Prescription {
  id: string;
  visit_id: string;
  patient_id: string;
  doctor_id?: string | null;
  prescription_type: 'digital' | 'scanned' | 'both';
  scanned_image_url?: string | null;
  is_approved: boolean;
  approved_at?: string | null;
  general_instructions?: string | null;
  created_at: string;
  updated_at: string;
  items?: PrescriptionItem[];
}

export interface MedicalAttachment {
  id: string;
  patient_id: string;
  visit_id?: string | null;
  attachment_type: AttachmentType;
  title?: string | null;
  notes?: string | null;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  uploaded_by?: string | null;
  is_approved_by_doctor: boolean;
  created_at: string;
}

export interface Visit {
  id: string;
  patient_id: string;
  visit_date: string;
  status: VisitStatus;
  chief_complaint?: string | null;
  secretary_id?: string | null;
  doctor_id?: string | null;
  completed_at?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  patient?: Patient;
  measurements?: Measurement;
  diagnosis?: Diagnosis;
  prescription?: Prescription;
  attachments?: MedicalAttachment[];
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  user_role?: UserRole | null;
  action: AuditActionType;
  target_table: string;
  target_id?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  created_at: string;
  user_name?: string;
}
