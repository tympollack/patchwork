'use client';

import React, { useRef, useState } from 'react';

export interface PinOtpInputProps {
  length?: number;
  disabled?: boolean;
  onComplete: (pin: string) => void;
  onChange?: (pin: string) => void;
}

export const PinOtpInput: React.FC<PinOtpInputProps> = ({
  length = 6,
  disabled = false,
  onComplete,
  onChange,
}) => {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleInputChange = (index: number, value: string) => {
    // Only accept numeric digit
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const nextDigits = [...digits];
      nextDigits[index] = '';
      setDigits(nextDigits);
      onChange?.(nextDigits.join(''));
      return;
    }

    const digit = cleaned.slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    setDigits(nextDigits);

    const fullCode = nextDigits.join('');
    onChange?.(fullCode);

    // Auto-advance focus to next input
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-trigger when all boxes are populated
    if (nextDigits.every((d) => d !== '') && nextDigits.length === length) {
      onComplete(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Backspace regression: focus previous input
        inputRefs.current[index - 1]?.focus();
        const nextDigits = [...digits];
        nextDigits[index - 1] = '';
        setDigits(nextDigits);
        onChange?.(nextDigits.join(''));
      } else {
        const nextDigits = [...digits];
        nextDigits[index] = '';
        setDigits(nextDigits);
        onChange?.(nextDigits.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pastedData) return;

    const nextDigits = Array(length).fill('');
    for (let i = 0; i < pastedData.length; i++) {
      nextDigits[i] = pastedData[i];
    }
    setDigits(nextDigits);
    onChange?.(nextDigits.join(''));

    // Focus appropriate input box
    const nextFocusIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[nextFocusIndex]?.focus();

    // Auto-complete if 6 digits pasted
    if (pastedData.length === length) {
      onComplete(pastedData);
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3" data-testid="pin-otp-container">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          value={digits[index]}
          onChange={(e) => handleInputChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          aria-label={`PIN Digit ${index + 1}`}
          className="h-14 w-11 sm:h-16 sm:w-13 border-2 border-[#4A90E2] bg-[#0B132B] text-center font-mono text-2xl font-bold text-[#00E5FF] shadow-inner outline-none transition-all focus:border-[#00E5FF] focus:bg-[#14213D] focus:shadow-[0_0_12px_rgba(0,229,255,0.4)] disabled:opacity-40"
          style={{ borderRadius: 0 }}
        />
      ))}
    </div>
  );
};
