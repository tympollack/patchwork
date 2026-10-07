export interface TailwindConfig {
  content: string[];
  theme: {
    extend: {
      colors: Record<string, Record<string | number, string>>;
      borderRadius: Record<string, string>;
      fontFamily: Record<string, string[]>;
      borderWidth?: Record<string, string>;
    };
  };
  plugins: unknown[];
}

const config: TailwindConfig = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0B132B',
          900: '#0A1128',
          800: '#14213D',
        },
        cornflower: {
          400: '#7AA7E8',
          500: '#4A90E2',
          600: '#6495ED',
        },
        cyan: {
          300: '#33EBFF',
          400: '#00E5FF',
          500: '#00FFFF',
        },
        warning: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
      },
      borderRadius: {
        none: '0px',
        sm: '0px',
        DEFAULT: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
        full: '0px',
      },
      fontFamily: {
        mono: ['var(--font-roboto-mono)', 'Roboto Mono', 'Courier', 'monospace'],
        sans: ['var(--font-inter)', 'Inter', 'SF Pro', 'system-ui', 'sans-serif'],
      },
      borderWidth: {
        DEFAULT: '1px',
        2: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
