import React from 'react';

export interface CodeViolationOption {
  code: string;
  title: string;
  description: string;
}

export const MUNICIPAL_VIOLATION_CODES: CodeViolationOption[] = [
  {
    code: '§14-A',
    title: 'Setback Encroachment (§14-A)',
    description: 'Physical structure or grading encroaching inside statutory 500-foot buffer setback.',
  },
  {
    code: '§18-C',
    title: 'Hydrological Alteration & Runoff (§18-C)',
    description: 'Impervious surface expansion directing unmitigated storm runoff into adjacent parcel.',
  },
  {
    code: '§09-D',
    title: 'Commercial Light Intrusion (§09-D)',
    description: 'High-intensity luminaire trespass exceeding 0.5 foot-candles at property line.',
  },
  {
    code: '§22-B',
    title: 'Easement Obstruction (§22-B)',
    description: 'Unauthorized fencing, storage, or barriers obstructing statutory utility/drainage easements.',
  },
];

export interface CodeSectionRadioGroupProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}

export const CodeSectionRadioGroup: React.FC<CodeSectionRadioGroupProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <fieldset className="space-y-3" data-testid="code-section-radio-group">
      <legend className="font-mono text-xs uppercase tracking-wider text-[#6495ED] mb-2">
        Select Statutory Violation Code
      </legend>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {MUNICIPAL_VIOLATION_CODES.map((opt) => {
          const isSelected = value === opt.code;
          return (
            <label
              key={opt.code}
              className={`flex cursor-pointer flex-col border p-3.5 transition-all ${
                isSelected
                  ? 'border-[#00E5FF] bg-[#00E5FF]/10 shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                  : 'border-[#4A90E2]/50 bg-[#0B132B]/80 hover:border-[#4A90E2]'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              style={{ borderRadius: 0 }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase text-[#00E5FF]">
                  {opt.code}
                </span>
                <input
                  type="radio"
                  name="code_section"
                  value={opt.code}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onChange(opt.code)}
                  className="accent-[#00E5FF]"
                />
              </div>
              <span className="mt-1 text-sm font-semibold text-white">{opt.title}</span>
              <span className="mt-1 text-xs text-slate-400 leading-snug">{opt.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
