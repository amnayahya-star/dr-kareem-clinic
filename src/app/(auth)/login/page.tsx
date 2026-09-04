"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import {
  User,
  Lock,
  Phone,
  Eye,
  EyeOff,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Globe,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

// Peaceful ambient stars configuration on deep indigo background
const LOGIN_STARS = [
  { top: "8%", left: "10%", size: 9, color: "#0C9A96", isFourPoint: true, animation: "animate-star-slow", delay: "0s", duration: "7s" },
  { top: "18%", left: "22%", size: 3.5, color: "#38BDF8", isFourPoint: false, animation: "animate-star-pulse", delay: "1.2s", duration: "5s" },
  { top: "32%", left: "8%", size: 8, color: "#F59E0B", isFourPoint: true, animation: "animate-star-medium", delay: "2.4s", duration: "8s" },
  { top: "50%", left: "15%", size: 3, color: "#0C9A96", isFourPoint: false, animation: "animate-star-slow", delay: "0.8s", duration: "6s" },
  { top: "72%", left: "12%", size: 8.5, color: "#38BDF8", isFourPoint: true, animation: "animate-star-pulse", delay: "3.1s", duration: "7.5s" },
  { top: "88%", left: "20%", size: 4, color: "#F59E0B", isFourPoint: false, animation: "animate-star-medium", delay: "1.5s", duration: "6.5s" },

  { top: "12%", left: "50%", size: 3.5, color: "#0C9A96", isFourPoint: false, animation: "animate-star-slow", delay: "2s", duration: "8s" },
  { top: "85%", left: "48%", size: 7, color: "#F59E0B", isFourPoint: true, animation: "animate-star-pulse", delay: "0.5s", duration: "6s" },

  { top: "10%", left: "85%", size: 8, color: "#0C9A96", isFourPoint: true, animation: "animate-star-slow", delay: "1s", duration: "9s" },
  { top: "25%", left: "78%", size: 3.5, color: "#38BDF8", isFourPoint: false, animation: "animate-star-pulse", delay: "2.8s", duration: "5.5s" },
  { top: "45%", left: "90%", size: 9, color: "#F59E0B", isFourPoint: true, animation: "animate-star-medium", delay: "0.3s", duration: "8s" },
  { top: "68%", left: "82%", size: 3, color: "#0C9A96", isFourPoint: false, animation: "animate-star-slow", delay: "2.2s", duration: "6.8s" },
  { top: "84%", left: "88%", size: 8, color: "#38BDF8", isFourPoint: true, animation: "animate-star-pulse", delay: "1.9s", duration: "7.2s" },
];

export default function LoginPage() {
  const router = useRouter();
  const { language, toggleLanguage, isRTL } = useLanguage();
  const { login } = useAuth();

  const [selectedRole, setSelectedRole] = useState<"doctor" | "secretary">("doctor");
  const [phoneOrUser, setPhoneOrUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login(selectedRole, phoneOrUser, password);

      if (selectedRole === "doctor") {
        router.replace("/doctor");
      } else {
        router.replace("/secretary");
      }
    } catch (err: any) {
      setError(
        err.message ||
          (language === "ar"
            ? "رقم الهاتف أو كلمة المرور غير صحيحة"
            : "Invalid phone number or password")
      );
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#061524] via-[#0A1E33] to-[#040D17] flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 relative w-full overflow-x-hidden font-sans text-white selection:bg-[#0C9A96] selection:text-white"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Background Radial Glow in the Center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] bg-[#0C7A77]/15 blur-[120px] rounded-full pointer-events-none z-0" />

      {/* Ambient Floating Stars in Deep Indigo Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none">
        {LOGIN_STARS.map((star, idx) => (
          <div
            key={idx}
            className={`absolute ${star.animation}`}
            style={{
              top: star.top,
              left: star.left,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          >
            {star.isFourPoint ? (
              <svg
                width={star.size}
                height={star.size}
                viewBox="0 0 24 24"
                fill={star.color}
                className="opacity-75 drop-shadow-[0_0_8px_rgba(12,154,150,0.6)]"
              >
                <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" />
              </svg>
            ) : (
              <div
                className="rounded-full"
                style={{
                  width: `${star.size}px`,
                  height: `${star.size}px`,
                  backgroundColor: star.color,
                  boxShadow: `0 0 ${star.size * 3}px ${star.color}`,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* 1. Top Bar: Back to Home & Language Switcher */}
      <header className="w-full max-w-4xl flex items-center justify-between z-20 mb-4 sm:mb-6">
        {/* Back to Home Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm font-bold text-slate-200 hover:text-white transition-all shadow-sm backdrop-blur-md group"
        >
          {isRTL ? (
            <ChevronRight className="w-4 h-4 text-[#0C9A96] transition-transform group-hover:translate-x-0.5" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-[#0C9A96] transition-transform group-hover:-translate-x-0.5" />
          )}
          <span>{language === "ar" ? "العودة للرئيسية" : "Back to Home"}</span>
        </Link>

        {/* Language Switcher Pill */}
        <button
          type="button"
          onClick={toggleLanguage}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm font-bold text-slate-200 hover:text-white transition-all shadow-sm backdrop-blur-md cursor-pointer group"
          title={language === "ar" ? "Switch to English" : "التحويل للغة العربية"}
        >
          <Globe className="w-4 h-4 text-[#0C9A96] group-hover:rotate-45 transition-transform duration-300" />
          <span>{language === "ar" ? "English" : "عربي"}</span>
        </button>
      </header>

      {/* 2. Main Centered Login Card Container */}
      <main className="w-full max-w-md my-auto z-20 space-y-4">
        {/* Clinic Brand Header above Card */}
        <div className="text-center space-y-2 select-none">
          <Link href="/" className="inline-flex flex-col items-center gap-2 group cursor-pointer">
            {/* Hexagon Logo */}
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform duration-200">
              <svg
                width="34"
                height="34"
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M24 3.5L42.5 13.8V34.2L24 44.5L5.5 34.2V13.8L24 3.5Z"
                  stroke="#FFFFFF"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5.5 24H15.5L19.5 14.5L24.5 34.5L29.5 18L33.5 24H42.5"
                  stroke="#0C9A96"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
              {language === "ar"
                ? "عيادة الدكتور عبد الكريم عليوي"
                : "Dr. Abdul Karim Aliwi Clinic"}
            </h1>
            <p className="text-xs font-bold text-[#0C9A96]">
              {language === "ar"
                ? "بورد طب الأطفال وحديثي الولادة"
                : "Board Certified in Pediatrics & Neonatology"}
            </p>
          </Link>
        </div>

        {/* Floating White Login Card */}
        <div className="bg-white text-[#0A1E33] rounded-[24px] p-6 sm:p-8 border border-white/20 shadow-2xl space-y-5">
          {/* Card Title */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black text-[#0A1E33] tracking-tight">
              {language === "ar" ? "تسجيل الدخول" : "Account Sign In"}
            </h2>
            <p className="text-xs text-[#697A8D] font-medium">
              {language === "ar"
                ? "أدخل بيانات حسابك للوصول إلى نظام العيادة"
                : "Enter your credentials to access the clinic system"}
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Role Switcher Tabs (Doctor vs Receptionist) */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#F1F5F7] rounded-xl border border-[#E2E8EC]">
            {/* Doctor Tab */}
            <button
              type="button"
              onClick={() => {
                setSelectedRole("doctor");
                setError(null);
                setPhoneOrUser("");
                setPassword("");
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer ${
                selectedRole === "doctor"
                  ? "bg-[#0A1E33] text-white shadow-xs"
                  : "text-[#697A8D] hover:text-[#0A1E33]"
              }`}
            >
              <User className={`w-4 h-4 ${selectedRole === "doctor" ? "text-[#0C9A96]" : "text-slate-400"}`} />
              <span>{language === "ar" ? "حساب الطبيب" : "Doctor Account"}</span>
            </button>

            {/* Receptionist Tab */}
            <button
              type="button"
              onClick={() => {
                setSelectedRole("secretary");
                setError(null);
                setPhoneOrUser("");
                setPassword("");
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer ${
                selectedRole === "secretary"
                  ? "bg-[#0A1E33] text-white shadow-xs"
                  : "text-[#697A8D] hover:text-[#0A1E33]"
              }`}
            >
              <User className={`w-4 h-4 ${selectedRole === "secretary" ? "text-[#0C9A96]" : "text-slate-400"}`} />
              <span>{language === "ar" ? "حساب الاستقبال" : "Reception Account"}</span>
            </button>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Phone Number Field */}
            <div className="space-y-1.5">
              <label className={`block text-xs font-bold text-[#0A1E33] ${isRTL ? "text-right" : "text-left"}`}>
                {language === "ar" ? "رقم الهاتف" : "Phone Number"}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder={language === "ar" ? "أدخل رقم الهاتف" : "Enter phone number"}
                  value={phoneOrUser}
                  onChange={(e) => setPhoneOrUser(e.target.value)}
                  className={`w-full h-12 ${isRTL ? "pr-4 pl-11" : "pl-4 pr-11"} rounded-xl border border-[#D7E0E5] focus:border-[#147D7A] focus:ring-2 focus:ring-[#147D7A]/15 text-xs font-bold text-[#0A1E33] placeholder:text-[#94A3B8] outline-none transition-all`}
                />
                <div className={`absolute inset-y-0 ${isRTL ? "left-0 pl-3.5" : "right-0 pr-3.5"} flex items-center pointer-events-none text-[#94A3B8]`}>
                  <Phone className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className={`block text-xs font-bold text-[#0A1E33] ${isRTL ? "text-right" : "text-left"}`}>
                {language === "ar" ? "كلمة المرور" : "Password"}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-11 rounded-xl border border-[#D7E0E5] focus:border-[#147D7A] focus:ring-2 focus:ring-[#147D7A]/15 text-xs font-bold text-[#0A1E33] placeholder:text-[#94A3B8] outline-none transition-all tracking-wider"
                />
                {/* Lock Icon */}
                <div className={`absolute inset-y-0 ${isRTL ? "right-0 pr-3.5" : "left-0 pl-3.5"} flex items-center pointer-events-none text-[#94A3B8]`}>
                  <Lock className="w-4 h-4" />
                </div>

                {/* Show/Hide Eye Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 ${isRTL ? "left-0 pl-3.5" : "right-0 pr-3.5"} flex items-center text-[#94A3B8] hover:text-[#0A1E33] transition-colors cursor-pointer`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Options Row: Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#697A8D]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#D7E0E5] text-[#147D7A] focus:ring-[#147D7A] accent-[#147D7A]"
                />
                <span className="font-medium text-xs">
                  {language === "ar" ? "تذكرني على هذا الجهاز" : "Remember this device"}
                </span>
              </label>

              <Link
                href="/forgot-password"
                className="text-xs font-bold text-[#147D7A] hover:underline"
              >
                {language === "ar" ? "نسيت كلمة المرور؟" : "Forgot password?"}
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-[#0A1E33] hover:bg-[#0C7A77] text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-60"
            >
              <span>{isLoading ? (language === "ar" ? "جاري الدخول..." : "Signing In...") : (language === "ar" ? "الدخول إلى النظام" : "Sign In to System")}</span>
              {isRTL ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          {/* Quick Credential Hint Pill */}
          <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-slate-200/80 text-[10px] text-slate-500 text-center space-y-0.5">
            <span>
              {selectedRole === "doctor"
                ? (language === "ar" ? "حساب الطبيب: " : "Doctor Account: ")
                : (language === "ar" ? "حساب الاستقبال: " : "Reception Account: ")}
              <strong className="text-slate-800 font-mono">
                {selectedRole === "doctor" ? "07801021470 (dr.Kareem@97al)" : "07719215504 (Husain@97al)"}
              </strong>
            </span>
          </div>
        </div>
      </main>

      {/* 3. Security Badge & Copyright Footer */}
      <footer className="w-full max-w-md text-center mt-6 space-y-2 z-20 select-none">
        {/* Encrypted Connection Badge */}
        <div className="inline-flex items-center gap-2 text-xs text-slate-300 font-bold">
          <div className="w-10 h-px bg-white/15" />
          <ShieldCheck className="w-4 h-4 text-[#0C9A96]" />
          <span>{language === "ar" ? "اتصال آمن ومشفر" : "Secure & Encrypted Connection"}</span>
          <div className="w-10 h-px bg-white/15" />
        </div>

        {/* Copyright */}
        <p className="text-[11px] text-slate-400 font-medium">
          {language === "ar"
            ? "جميع الحقوق محفوظة © 2026 عيادة الدكتور عبد الكريم عليوي"
            : "All Rights Reserved © 2026 Dr. Abdul Karim Aliwi Clinic"}
        </p>
      </footer>
    </div>
  );
}
