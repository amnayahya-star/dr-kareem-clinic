import React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F9FA] text-[#0A1E33]" dir="rtl">
      {children}
    </div>
  );
}
