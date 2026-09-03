import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || (label ? label.replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5 text-right">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700">
            {label}
            {props.required && <span className="text-rose-500 mr-1">*</span>}
          </label>
        )}
        <div className="relative rounded-xl shadow-sm">
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              {rightIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              "block w-full rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm",
              "h-11 px-4 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-clinic-500 focus:border-clinic-500",
              "disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed",
              rightIcon && "pr-10",
              leftIcon && "pl-10",
              error && "border-rose-400 focus:ring-rose-500 focus:border-rose-500",
              className
            )}
            {...props}
          />
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              {leftIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const textareaId = id || (label ? label.replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5 text-right">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-semibold text-slate-700">
            {label}
            {props.required && <span className="text-rose-500 mr-1">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          className={cn(
            "block w-full rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm p-3.5",
            "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-clinic-500 focus:border-clinic-500",
            "disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed min-h-[90px]",
            error && "border-rose-400 focus:ring-rose-500 focus:border-rose-500",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
