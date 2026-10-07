import { BLUEPRINT_COLORS, BLUEPRINT_FONTS, HTN_TRUST_STRING } from '../apps/web/src/styles/tokens';
import tailwindConfig from '../apps/web/tailwind.config';

describe('TASK-PW-ZON-03: Tech-Blueprint Design System and Micro-Tokens', () => {
  it('defines correct palette hex codes', () => {
    expect(BLUEPRINT_COLORS.navy[950]).toBe('#0B132B');
    expect(BLUEPRINT_COLORS.cornflower[500]).toBe('#4A90E2');
    expect(BLUEPRINT_COLORS.cyan[400]).toBe('#00E5FF');
    expect(BLUEPRINT_COLORS.warning[500]).toBe('#F59E0B');
  });

  it('enforces 0px border radius across all primitives in Tailwind config', () => {
    const borderRadius = tailwindConfig.theme?.extend?.borderRadius as Record<string, string>;
    expect(borderRadius).toBeDefined();
    expect(borderRadius.none).toBe('0px');
    expect(borderRadius.DEFAULT).toBe('0px');
    expect(borderRadius.sm).toBe('0px');
    expect(borderRadius.md).toBe('0px');
    expect(borderRadius.lg).toBe('0px');
    expect(borderRadius.full).toBe('0px');
  });

  it('configures dual-font typography pairing', () => {
    expect(BLUEPRINT_FONTS.mono).toContain('Roboto Mono');
    expect(BLUEPRINT_FONTS.sans).toContain('Inter');
  });

  it('contains the authoritative HTN trust compliance string', () => {
    expect(HTN_TRUST_STRING).toBe(
      '🔒 Horizon Trust Network (HTN) Data Standards Compliant | PostGIS Spatial Audit Active'
    );
  });
});
