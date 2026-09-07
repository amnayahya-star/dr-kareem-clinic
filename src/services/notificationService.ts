import { isSupabaseConfigured } from "@/lib/supabase/client";

export type NotificationType = "visit_approved_needs_rx" | "new_patient_arrived";

export interface ClinicNotification {
  id: string;
  type: NotificationType;
  visitId?: string;
  patientId: string;
  childName: string;
  diagnosisText?: string;
  weightKg?: number;
  temperatureC?: number;
  labPhotosCount?: number;
  timestamp: string;
  isRead: boolean;
  isSnapped?: boolean;
}

const STORAGE_KEY = "dr_kareem_clinic_notifications";
const BROADCAST_CHANNEL_NAME = "dr_kareem_clinic_realtime";

export const MOCK_PATIENT_NAMES = [
  "يوسف أحمد العلي",
  "مريم حسن الجابري",
  "علي حسين الصدر",
  "زينب كاظم الموسوي",
  "عمر عبد الله السعدي",
];

/**
 * Checks if a notification record contains mock or demo patient data
 */
export function isMockNotification(notif?: Partial<ClinicNotification> | null): boolean {
  if (!notif) return true;
  if (
    notif.patientId &&
    (notif.patientId.startsWith("p-00") ||
      notif.patientId === "p-001" ||
      notif.patientId === "p-002" ||
      notif.patientId === "p-003" ||
      notif.patientId === "p-004" ||
      notif.patientId === "p-005" ||
      notif.patientId === "p-test-1" ||
      notif.patientId === "p-test-2")
  ) {
    return true;
  }
  if (notif.childName && MOCK_PATIENT_NAMES.includes(notif.childName.trim())) {
    return true;
  }
  return false;
}

/**
 * Safely cleans legacy mock notifications and recycle bin data from localStorage in production
 * NEVER touches user session tokens (sb-*) or general preferences (dr_kareem_lang)
 */
export function cleanLegacyMockStorage() {
  if (typeof window === "undefined") return;
  try {
    // 1. Clean notifications storage
    const notifRaw = localStorage.getItem(STORAGE_KEY);
    if (notifRaw) {
      const parsed = JSON.parse(notifRaw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((n) => !isMockNotification(n));
        if (filtered.length !== parsed.length) {
          if (filtered.length === 0) {
            localStorage.removeItem(STORAGE_KEY);
          } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
          }
        }
      }
    }

    // 2. Clean deleted patients storage
    const deletedRaw = localStorage.getItem("dr_kareem_deleted_patients");
    if (deletedRaw) {
      const parsedDeleted = JSON.parse(deletedRaw);
      if (Array.isArray(parsedDeleted)) {
        const filteredDeleted = parsedDeleted.filter(
          (p) =>
            p &&
            p.id &&
            !p.id.startsWith("p-00") &&
            !MOCK_PATIENT_NAMES.includes(p.fullName?.trim())
        );
        if (filteredDeleted.length !== parsedDeleted.length) {
          if (filteredDeleted.length === 0) {
            localStorage.removeItem("dr_kareem_deleted_patients");
          } else {
            localStorage.setItem("dr_kareem_deleted_patients", JSON.stringify(filteredDeleted));
          }
        }
      }
    }
  } catch (e) {
    console.warn("Error cleaning legacy mock storage:", e);
  }
}

// Play a pleasant synthesizer chime via Web Audio API
export function playNotificationChime(pitch: "high" | "normal" = "normal") {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const freq1 = pitch === "high" ? 659.25 : 587.33; // E5 or D5
    const freq2 = pitch === "high" ? 1046.5 : 880; // C6 or A5

    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq1, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2 (higher harmony)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq2, now + 0.15);
    gain2.gain.setValueAtTime(0.2, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.warn("Audio chime error:", e);
  }
}

// Get all pending notifications (filters out mock records in production)
export function getClinicNotifications(): ClinicNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const list: ClinicNotification[] = JSON.parse(data);
    if (!Array.isArray(list)) return [];

    if (isSupabaseConfigured()) {
      return list.filter((n) => !isMockNotification(n));
    }

    return list;
  } catch {
    return [];
  }
}

// Save notifications
export function saveClinicNotifications(notifications: ClinicNotification[]) {
  if (typeof window === "undefined") return;
  try {
    const listToSave = isSupabaseConfigured()
      ? notifications.filter((n) => !isMockNotification(n))
      : notifications;
    if (listToSave.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(listToSave));
    }
  } catch (e) {
    console.warn("Error saving notifications:", e);
  }
}

// 1. Dispatch alert to Secretary when Doctor approves a visit
export function notifyDoctorApprovedVisit(params: {
  visitId: string;
  patientId: string;
  childName: string;
  diagnosisText?: string;
}) {
  const newNotif: ClinicNotification = {
    id: `notif-doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: "visit_approved_needs_rx",
    visitId: params.visitId,
    patientId: params.patientId,
    childName: params.childName,
    diagnosisText: params.diagnosisText,
    timestamp: new Date().toISOString(),
    isRead: false,
    isSnapped: false,
  };

  const current = getClinicNotifications();
  const updated = [newNotif, ...current.filter((n) => n.visitId !== params.visitId)];
  saveClinicNotifications(updated);
  broadcastNotification(newNotif);
}

// 2. Dispatch alert to Doctor when Secretary enters a child / new visit vitals
export function notifySecretarySavedVisit(params: {
  visitId?: string;
  patientId: string;
  childName: string;
  weightKg?: number;
  temperatureC?: number;
  labPhotosCount?: number;
}) {
  const newNotif: ClinicNotification = {
    id: `notif-sec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: "new_patient_arrived",
    visitId: params.visitId,
    patientId: params.patientId,
    childName: params.childName,
    weightKg: params.weightKg,
    temperatureC: params.temperatureC,
    labPhotosCount: params.labPhotosCount,
    timestamp: new Date().toISOString(),
    isRead: false,
  };

  const current = getClinicNotifications();
  const updated = [newNotif, ...current.filter((n) => n.patientId !== params.patientId)];
  saveClinicNotifications(updated);
  broadcastNotification(newNotif);
}

// Broadcast helper
function broadcastNotification(notif: ClinicNotification) {
  try {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage({ type: "NEW_NOTIFICATION", notification: notif });
      channel.close();
    }
  } catch (e) {
    console.warn("BroadcastChannel error:", e);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("clinic:notification", { detail: notif }));
  }
}

// Mark notification as snapped or read
export function markNotificationSnapped(visitId: string) {
  const current = getClinicNotifications();
  const updated = current.map((n) =>
    n.visitId === visitId ? { ...n, isSnapped: true, isRead: true } : n
  );
  saveClinicNotifications(updated);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("clinic:notification_updated"));
  }
}

export function markPatientNotificationRead(patientId: string) {
  const current = getClinicNotifications();
  const updated = current.map((n) =>
    n.patientId === patientId ? { ...n, isRead: true } : n
  );
  saveClinicNotifications(updated);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("clinic:notification_updated"));
  }
}

// Universal subscriber for both roles
export function subscribeToClinicNotifications(
  onNewNotification: (notif: ClinicNotification) => void
) {
  if (typeof window === "undefined") return () => {};

  let channel: BroadcastChannel | null = null;
  try {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === "NEW_NOTIFICATION" && event.data?.notification) {
          onNewNotification(event.data.notification);
        }
      };
    }
  } catch (e) {
    console.warn("BroadcastChannel error:", e);
  }

  const handleCustomEvent = (e: any) => {
    if (e.detail) {
      onNewNotification(e.detail);
    }
  };

  window.addEventListener("clinic:notification", handleCustomEvent);

  return () => {
    if (channel) channel.close();
    window.removeEventListener("clinic:notification", handleCustomEvent);
  };
}
