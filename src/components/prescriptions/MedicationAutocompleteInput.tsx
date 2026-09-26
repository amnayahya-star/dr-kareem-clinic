"use client";

import React, { useState, useEffect, useRef } from "react";
import { searchDrugProducts, DrugSearchResult } from "@/services/drugSearchService";
import { Pill, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MedicationAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectResult: (drug: DrugSearchResult) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
  isCustomMedication?: boolean;
  hasCatalogLink?: boolean;
  language?: "ar" | "en";
  className?: string;
  id?: string;
}

export function MedicationAutocompleteInput({
  value,
  onChange,
  onSelectResult,
  disabled = false,
  label,
  placeholder,
  required = false,
  isCustomMedication = true,
  hasCatalogLink = false,
  language = "ar",
  className,
  id,
}: MedicationAutocompleteInputProps) {
  const [results, setResults] = useState<DrugSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // إغلاق القائمة عند النقر خارج العنصر
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  // تنظيف مؤقت الـ debounce عند إزالة المكون
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // معالجة تغيير قيمة الإدخال والبحث بعد حرفين مع debounce 300ms
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    // تأخير البحث بمقدار 300 مللي ثانية لمنع الاستدعاءات المتكررة لكل ضغطة مفتاح
    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      setSearchError(null);
      try {
        const fetched = await searchDrugProducts(trimmed, 10);
        setResults(fetched);
        setIsOpen(true);
        setHighlightedIndex(-1);
      } catch (err: any) {
        setSearchError(
          language === "ar"
            ? "تعذر البحث في قاعدة بيانات الأدوية (يمكنك المتابعة يدوياً)"
            : "Drug search failed (you can continue manually)"
        );
        setResults([]);
        setIsOpen(true);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  };

  // معالجة اختيار دواء من القائمة
  const handleSelectDrug = (drug: DrugSearchResult) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setIsOpen(false);
    setResults([]);
    setHighlightedIndex(-1);
    setSearchError(null);
    onSelectResult(drug);
  };

  // دعم التنقل بلوحة المفاتيح: الأسهم و Enter و Escape
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" && results.length > 0) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          handleSelectDrug(results[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  const inputId = id || (label ? label.replace(/\s+/g, "-") : undefined);

  return (
    <div ref={containerRef} className="w-full relative space-y-1.5 text-right">
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700">
            {label}
            {required && <span className="text-rose-500 mr-1">*</span>}
          </label>

          {/* شارة حالة الدواء: مربوط بالكتالوج أو مدخل يدوي */}
          {hasCatalogLink && !isCustomMedication ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
              title={language === "ar" ? "دواء موثق من كتالوج الأدوية" : "Verified catalog drug"}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              {language === "ar" ? "كتالوج الأدوية" : "Catalog"}
            </span>
          ) : value.trim().length > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
              title={language === "ar" ? "دواء مدخل يدوياً ومخصص للعيادة" : "Custom manually entered medication"}
            >
              <Pill className="w-3 h-3 text-slate-400" />
              {language === "ar" ? "إدخال يدوي" : "Custom"}
            </span>
          ) : null}
        </div>
      )}

      <div className="relative rounded-xl shadow-sm">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.trim().length >= 2 && results.length > 0) {
              setIsOpen(true);
            }
          }}
          disabled={disabled}
          placeholder={placeholder || (language === "ar" ? "ابحث باسم الدواء أو اكتب يدوياً..." : "Search drug or type manually...")}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={`${inputId}-listbox`}
          data-testid="medication-search-input"
          className={cn(
            "block w-full rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm",
            "h-11 px-4 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-clinic-500 focus:border-clinic-500",
            "disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed",
            isLoading && "pl-10",
            className
          )}
        />

        {isLoading && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-clinic-500">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        )}
      </div>

      {/* قائمة الإكمال التلقائي المنبثقة */}
      {isOpen && !disabled && (
        <div
          id={`${inputId}-listbox`}
          role="listbox"
          data-testid="medication-autocomplete-dropdown"
          className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100"
        >
          {/* حالة التحميل */}
          {isLoading && results.length === 0 && (
            <div
              data-testid="medication-search-loading"
              className="p-3.5 text-center text-xs text-slate-500 flex items-center justify-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin text-clinic-600" />
              <span>
                {language === "ar" ? "جاري البحث في قاعدة بيانات الأدوية..." : "Searching drug database..."}
              </span>
            </div>
          )}

          {/* حالة الخطأ */}
          {searchError && (
            <div
              data-testid="medication-search-error"
              className="p-3 text-center text-xs text-rose-600 bg-rose-50/50 flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {/* حالة عدم وجود نتائج */}
          {!isLoading && !searchError && results.length === 0 && value.trim().length >= 2 && (
            <div
              data-testid="medication-search-empty"
              className="p-4 text-center text-xs text-slate-500 space-y-1"
            >
              <p className="font-semibold text-slate-700">
                {language === "ar" ? "لم يتم العثور على أدوية مطابقة" : "No matching drugs found"}
              </p>
              <p className="text-[11px] text-slate-400">
                {language === "ar"
                  ? "يمكنك المتابعة بكتابة الاسم والجرعة يدوياً وسيُحفظ كدواء مخصص."
                  : "You can keep typing manually and it will be saved as a custom medication."}
              </p>
            </div>
          )}

          {/* عرض النتائج حتى 10 نتائج */}
          {results.map((drug, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <div
                key={drug.product_id}
                role="option"
                aria-selected={isHighlighted}
                data-testid="medication-search-result-item"
                onClick={() => handleSelectDrug(drug)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "p-3 text-right cursor-pointer transition-colors duration-150",
                  isHighlighted ? "bg-clinic-50/80 text-clinic-950" : "hover:bg-slate-50 text-slate-800"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-sm text-slate-900 leading-snug">
                    {drug.display_name}
                  </div>
                  {drug.strength && (
                    <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      {drug.strength}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  {drug.active_ingredient && (
                    <span className="inline-flex items-center gap-1 text-clinic-700 font-medium">
                      <Pill className="w-3 h-3 text-clinic-500" />
                      {drug.active_ingredient}
                    </span>
                  )}
                  {drug.dosage_form && (
                    <span className="text-[11px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                      {drug.dosage_form}
                    </span>
                  )}
                  {drug.route && (
                    <span className="text-[11px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                      {drug.route}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
