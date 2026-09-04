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
} from "lucide-react";

// Peaceful ambient stars configuration
const LOGIN_STARS = [
  { top: "8%", left: "5%", size: 8, color: "#147D7A", isFourPoint: true, animation: "animate-star-slow", delay: "0s", duration: "7s" },
  { top: "25%", left: "12%", size: 3.5, color: "#0C9A96", isFourPoint: false, animation: "animate-star-pulse", delay: "1.2s", duration: "5s" },
  { top: "45%", left: "4%", size: 7.5, color: "#F59E0B", isFourPoint: true, animation: "animate-star-medium", delay: "2.4s", duration: "8s" },
  { top: "65%", left: "15%", size: 3, color: "#147D7A", isFourPoint: false, animation: "animate-star-slow", delay: "0.8s", duration: "6s" },
  { top: "82%", left: "8%", size: 8, color: "#0C9A96", isFourPoint: true, animation: "animate-star-pulse", delay: "3.1s", duration: "7.5s" },

  { top: "12%", left: "30%", size: 3.5, color: "#147D7A", isFourPoint: false, animation: "animate-star-slow", delay: "2s", duration: "8s" },
  { top: "70%", left: "32%", size: 8, color: "#F59E0B", isFourPoint: true, animation: "animate-star-pulse", delay: "0.5s", duration: "6s" },

  { top: "10%", left: "60%", size: 8, color: "#147D7A", isFourPoint: true, animation: "animate-star-slow", delay: "1s", duration: "9s" },
  { top: "28%", left: "72%", size: 3.5, color: "#F59E0B", isFourPoint: false, animation: "animate-star-pulse", delay: "2.8s", duration: "5.5s" },
  { top: "62%", left: "68%", size: 9, color: "#0C9A96", isFourPoint: true, animation: "animate-star-medium", delay: "0.3s", duration: "8s" },
  { top: "86%", left: "78%", size: 4, color: "#147D7A", isFourPoint: false, animation: "animate-star-slow", delay: "2.2s", duration: "6.8s" },

  { top: "18%", left: "90%", size: 7, color: "#F59E0B", isFourPoint: true, animation: "animate-star-pulse", delay: "1.9s", duration: "7.2s" },
  { top: "74%", left: "92%", size: 8, color: "#147D7A", isFourPoint: true, animation: "animate-star-slow", delay: "0.9s", duration: "8.5s" },
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
      className="min-h-screen bg-[#F7F9FA] flex flex-col lg:flex-row relative w-full overflow-x-hidden font-sans text-[#0A1E33] selection:bg-[#147D7A] selection:text-white"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Ambient Floating Stars in Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 select-none">
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
                className="opacity-50 drop-shadow-[0_0_6px_rgba(20,125,122,0.35)]"
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

      {/* ========================================================================= */}
      {/* 1. RIGHT COLUMN (Distinct Dark Navy Doctor Portrait Hero in RTL)          */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-[48%] xl:w-[46%] relative bg-[#061524] text-white flex flex-col justify-between p-6 sm:p-10 lg:p-12 min-h-[420px] lg:min-h-screen overflow-hidden order-1 lg:order-1 shadow-2xl select-none">
        {/* Background Subtle Hexagon Pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#147D7A_1px,transparent_1px)] [background-size:24px_24px] z-0" />

        {/* Decorative Hexagon Molecules */}
        <div className="absolute top-28 right-8 pointer-events-none opacity-25 z-0">
          <svg width="120" height="120" viewBox="0 0 100 100" fill="none" stroke="#0C9A96" strokeWidth="1.2">
            <path d="M50 5 L85 25 L85 65 L50 85 L15 65 L15 25 Z" />
            <path d="M85 25 L120 45 L120 85 L85 105 L50 85" />
          </svg>
        </div>

        {/* Multi-layered Curve Vector Divider */}
        <div className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none z-30">
          <svg
            className="w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {isRTL ? (
              <>
                <path
                  d="M 12 0 C -5 32, -5 68, 12 100"
                  stroke="#0C9A96"
                  strokeWidth="0.9"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d="M 13.5 0 C -3.5 32, -3.5 68, 13.5 100"
                  stroke="#FFFFFF"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d="M 14.8 0 C -2.2 32, -2.2 68, 14.8 100"
                  stroke="#061524"
                  strokeWidth="2.6"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : (
              <>
                <path
                  d="M 88 0 C 105 32, 105 68, 88 100"
                  stroke="#0C9A96"
                  strokeWidth="0.9"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d="M 86.5 0 C 103.5 32, 103.5 68, 86.5 100"
                  stroke="#FFFFFF"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d="M 85.2 0 C 102.2 32, 102.2 68, 85.2 100"
                  stroke="#061524"
                  strokeWidth="2.6"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>
        </div>

        {/* Top Header: Hexagon Logo & Clinic Title */}
        <div className={`flex items-center ${isRTL ? "justify-start" : "justify-start"} gap-3.5 relative z-20`}>
          <div className="shrink-0">
            <svg
              width="44"
              height="44"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-sm"
            >
              <path
                d="M24 3.5L42.5 13.8V34.2L24 44.5L5.5 34.2V13.8L24 3.5Z"
                stroke="#FFFFFF"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 24H15.5L19.5 14.5L24.5 34.5L29.5 18L33.5 24H42.5"
                stroke="#0C9A96"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className={isRTL ? "text-right" : "text-left"}>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
              {language === "ar"
                ? "عيادة د. عبد الكريم عليوي"
                : "Dr. Abdul Karim Aliwi Clinic"}
            </h1>
            <p className="text-xs sm:text-[13px] font-bold text-[#0C9A96] mt-0.5">
              {language === "ar"
                ? "بورد طب الأطفال وحديثي الولادة"
                : "Board Certified in Pediatrics & Neonatology"}
            </p>
          </div>
        </div>

        {/* Center: Distinct Doctor Cutout Portrait on Dark Navy Backdrop */}
        <div className="relative my-auto flex justify-center items-center py-4 z-10">
          <div className="relative w-64 sm:w-72 lg:w-80 max-w-full aspect-[4/5] flex items-center justify-center">
            <img
              src="/doctor-portrait-cutout.png"
              alt="الدكتور عبد الكريم عليوي"
              className="w-full h-full object-contain filter drop-shadow-2xl contrast-105"
            />
            {/* Smooth gradient blend at the bottom */}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#061524] to-transparent" />
          </div>
        </div>

        {/* Bottom Headline & Subtitle of Dark Navy Hero */}
        <div className="text-center relative z-20 space-y-2 pb-2">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {language === "ar" ? (
              <>
                رعاية موثوقة. إدارة آمنة<span className="text-[#0C9A96]">.</span>
              </>
            ) : (
              <>
                Trusted Care. Secure Management<span className="text-[#0C9A96]">.</span>
              </>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-[#8DA4B8] font-medium max-w-md mx-auto">
            {language === "ar"
              ? "دخول مخصص للكادر الطبي والإداري في العيادة."
              : "Authorized clinical and administrative access."}
          </p>
          <div className="w-12 h-1 bg-[#0C9A96] mx-auto rounded-full mt-3 opacity-90" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. LEFT COLUMN (Bilingual Floating Login Card with Language Switcher)     */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-[52%] xl:w-[54%] flex flex-col justify-between p-6 sm:p-10 lg:p-12 relative z-20 order-2 lg:order-2">
        {/* Top Header Actions: Language Switcher & Back to Home */}
        <div className="flex items-center justify-between w-full max-w-md mx-auto mb-6 z-20">
          {/* Back to Home Link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#0A1E33] hover:text-[#147D7A] transition-colors group"
          >
            {isRTL ? (
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            ) : (
              <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            )}
            <span>{language === "ar" ? "العودة للرئيسية" : "Back to Home"}</span>
          </Link>

          {/* Language Switcher Pill */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-[#D7E0E5] bg-white text-xs sm:text-sm font-bold text-[#0A1E33] hover:border-[#147D7A] hover:text-[#147D7A] transition-all shadow-2xs cursor-pointer group"
            title={language === "ar" ? "Switch to English" : "التحويل للغة العربية"}
          >
            <Globe className="w-3.5 h-3.5 text-[#147D7A] group-hover:rotate-45 transition-transform duration-300" />
            <span>{language === "ar" ? "English" : "عربي"}</span>
          </button>
        </div>

        {/* Main Floating Login Card */}
        <div className="w-full max-w-md mx-auto my-auto bg-white rounded-[24px] p-6 sm:p-8 border border-[#E5EBF0] shadow-sm relative z-20 space-y-6">
          {/* Card Header */}
          <div className="text-center space-y-1">
            <h3 className="text-2xl font-black text-[#0A1E33] tracking-tight">
              {language === "ar" ? "تسجيل الدخول" : "Account Sign In"}
            </h3>
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
              className="w-full h-12 bg-[#0A1E33] hover:bg-[#147D7A] text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-60"
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

        {/* Security Badge & Footer */}
        <div className="text-center mt-6 space-y-3 z-20">
          {/* Encrypted Connection Badge */}
          <div className="inline-flex items-center gap-2 text-xs text-[#697A8D] font-bold">
            <div className="w-10 h-px bg-[#D7E0E5]" />
            <ShieldCheck className="w-4 h-4 text-[#147D7A]" />
            <span>{language === "ar" ? "اتصال آمن ومشفر" : "Secure & Encrypted Connection"}</span>
            <div className="w-10 h-px bg-[#D7E0E5]" />
          </div>

          {/* Copyright */}
          <p className="text-[11px] text-[#94A3B8] font-medium">
            {language === "ar"
              ? "جميع الحقوق محفوظة © 2026 عيادة الدكتور عبد الكريم عليوي"
              : "All Rights Reserved © 2026 Dr. Abdul Karim Aliwi Clinic"}
          </p>
        </div>
      </div>
    </div>
  );
}
