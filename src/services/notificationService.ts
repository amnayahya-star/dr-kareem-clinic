"use client";

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

// Get all pending notifications
export function getClinicNotifications(): ClinicNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Save notifications
export function saveClinicNotifications(notifications: ClinicNotification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
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
