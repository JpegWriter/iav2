'use client';

// ============================================================================
// SEO HEADING SELECTOR COMPONENT
// ============================================================================
// Displays scored heading options with tier badges, warnings, and explanations.
// Supports auto-selection of best option while allowing user override.

import React, { useMemo, useEffect, useState } from 'react';
import {
  scoreHeadingSet,
  type HeadingType,
  type ScoreResult,
  getTierColorClasses,
  getTierLabel,
  isRiskySelection,
  getRiskySelectionWarning,
} from '@/lib/writer/seoHeadingScorer';

type Props = {
  options: string[];
  focusKeyword: string;
  location: string;
  brand?: string;
  headingType: HeadingType;
  value: string;
  onChange: (val: string) => void;
  label?: string;
  autoPickBest?: boolean;
  showConfirmOnRisky?: boolean;
};

export function SeoHeadingSelector({
  options,
  focusKeyword,
  location,
  brand,
  headingType,
  value,
  onChange,
  label,
  autoPickBest = false,
  showConfirmOnRisky = true,
}: Props) {
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const { results, best } = useMemo(() => {
    return scoreHeadingSet(options, { focusKeyword, location, brand, headingType });
  }, [options, focusKeyword, location, brand, headingType]);

  // Auto-pick best if enabled and no value set
  useEffect(() => {
    if (autoPickBest && !value && best?.text) {
      onChange(best.text);
    }
  }, [autoPickBest, value, best?.text, onChange]);

  const handleSelect = (result: ScoreResult) => {
    if (showConfirmOnRisky && isRiskySelection(result)) {
      const warning = getRiskySelectionWarning(result);
      if (warning) {
        setPendingSelection(result.text);
        setWarningMessage(warning);
        setShowWarning(true);
        return;
      }
    }
    onChange(result.text);
  };

  const confirmRiskySelection = () => {
    if (pendingSelection) {
      onChange(pendingSelection);
    }
    setShowWarning(false);
    setPendingSelection(null);
    setWarningMessage(null);
  };

  const cancelRiskySelection = () => {
    setShowWarning(false);
    setPendingSelection(null);
    setWarningMessage(null);
  };

  if (results.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No options available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      {results.map((r) => {
        const isBest = best?.text === r.text;
        const isSelected = value === r.text;

        return (
          <label
            key={r.text}
            className={[
              "block rounded-xl border p-3 cursor-pointer transition-all",
              isBest && !isSelected ? "border-green-300 bg-green-50/50" : "",
              isSelected ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-gray-200",
              !isBest && !isSelected ? "hover:border-gray-300 hover:bg-gray-50" : "",
            ].filter(Boolean).join(" ")}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name={`heading-${headingType}`}
                checked={isSelected}
                onChange={() => handleSelect(r)}
                className="mt-1.5 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={[
                    "font-medium text-sm",
                    r.tier === "risky" ? "text-red-700" : "text-gray-900",
                  ].join(" ")}>
                    {r.text}
                  </span>

                  <span className={[
                    "text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap",
                    getTierColorClasses(r.tier),
                  ].join(" ")}>
                    {isBest ? "★ " : ""}{getTierLabel(r.tier)}
                  </span>

                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {r.score}/100
                  </span>
                </div>

                {/* Warning flags */}
                {r.flags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.flags.map(f => (
                      <span
                        key={f}
                        className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full"
                      >
                        ⚠ {f}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expandable reasons */}
                <details className="mt-2 group">
                  <summary className="text-xs text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    Why this scored {r.score}
                  </summary>
                  <ul className="mt-2 text-xs text-gray-600 list-disc ml-5 space-y-0.5">
                    {r.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          </label>
        );
      })}

      {/* Risky selection warning dialog */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <span className="text-xl">⚠️</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  SEO Warning
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  {warningMessage}
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={cancelRiskySelection}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Choose Another
                  </button>
                  <button
                    onClick={confirmRiskySelection}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                  >
                    Use Anyway
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPACT VARIANT (for inline use)
// ============================================================================

type CompactProps = {
  options: string[];
  focusKeyword: string;
  location: string;
  brand?: string;
  headingType: HeadingType;
  value: string;
  onChange: (val: string) => void;
};

export function SeoHeadingSelectorCompact({
  options,
  focusKeyword,
  location,
  brand,
  headingType,
  value,
  onChange,
}: CompactProps) {
  const { results, best } = useMemo(() => {
    return scoreHeadingSet(options, { focusKeyword, location, brand, headingType });
  }, [options, focusKeyword, location, brand, headingType]);

  return (
    <div className="space-y-2">
      {results.map((r) => {
        const isBest = best?.text === r.text;
        const isSelected = value === r.text;

        return (
          <div
            key={r.text}
            onClick={() => onChange(r.text)}
            className={[
              "flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm",
              isSelected ? "bg-blue-100 border border-blue-300" : "bg-gray-50 hover:bg-gray-100",
            ].join(" ")}
          >
            <div className={[
              "w-4 h-4 rounded-full border-2 flex-shrink-0",
              isSelected ? "border-blue-500 bg-blue-500" : "border-gray-300",
            ].join(" ")}>
              {isSelected && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              )}
            </div>
            
            <span className="flex-1 truncate">{r.text}</span>
            
            <span className={[
              "text-xs px-1.5 py-0.5 rounded font-medium",
              getTierColorClasses(r.tier),
            ].join(" ")}>
              {isBest ? "★" : r.score}
            </span>
          </div>
        );
      })}
    </div>
  );
}
