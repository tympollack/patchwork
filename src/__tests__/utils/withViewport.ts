/**
 * withViewport.ts
 * Reusable viewport mocking utility for the PatchWork mobile test suite.
 *
 * Usage:
 *   import { setTestViewport, assertWithinViewportBounds, VIEWPORTS } from './withViewport';
 *
 *   beforeEach(() => setTestViewport('compact'));
 *   it('...', () => { assertWithinViewportBounds(element, VIEWPORTS.compact); });
 */
import { StyleSheet } from 'react-native';
// @ts-ignore: missing type definition in standard install
import type { ReactTestInstance } from 'react-test-renderer';

// ---------------------------------------------------------------------------
// Device presets
// ---------------------------------------------------------------------------
export const VIEWPORTS = {
  /** iPhone SE 1st gen / small Android */
  compact:  { width: 320, height: 568,  scale: 2,   fontScale: 1 },
  /** iPhone 14/15 */
  standard: { width: 390, height: 844,  scale: 3,   fontScale: 1 },
  /** Pixel 7 / Galaxy S-series */
  wide:     { width: 412, height: 915,  scale: 2.6, fontScale: 1 },
} as const;

export type ViewportPreset = keyof typeof VIEWPORTS;

// ---------------------------------------------------------------------------
// setTestViewport
// Mocks useWindowDimensions and Dimensions.get for the given preset.
// An afterEach hook is registered automatically to restore all mocks.
// ---------------------------------------------------------------------------
export function setTestViewport(preset: ViewportPreset): void {
  const vp = VIEWPORTS[preset];

  // Mock useWindowDimensions hook
  jest.spyOn(
    require('react-native'),
    'useWindowDimensions'
  ).mockReturnValue(vp);

  // Mock Dimensions.get for both 'window' and 'screen'
  jest.spyOn(
    require('react-native').Dimensions,
    'get'
  ).mockImplementation((dim: any) => {
    if (dim === 'window' || dim === 'screen') return vp;
    return vp;
  });
}

// afterEach cleanup registered once per import
afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// assertWithinViewportBounds
// Asserts that a rendered element does not overflow the given viewport width.
// ---------------------------------------------------------------------------
export function assertWithinViewportBounds(
  element: ReactTestInstance,
  viewport: { width: number; height: number }
): void {
  const style = StyleSheet.flatten(element.props.style ?? {});

  // Fail if a fixed pixel width exceeds the viewport
  if (typeof style?.width === 'number') {
    expect(style.width).toBeLessThanOrEqual(viewport.width);
  }

  // Warn if flexShrink is explicitly 0 without a bounded flex parent
  // (can cause overflow on narrow screens)
  if (style?.flexShrink === 0) {
    const hasFlexBound =
      typeof style?.maxWidth === 'number' ||
      style?.width === '100%' ||
      typeof style?.flex === 'number';
    if (!hasFlexBound) {
      // Use a soft assertion — warn but don't hard-fail
      console.warn(
        `[assertWithinViewportBounds] flexShrink:0 detected without a bounded parent. ` +
        `This may cause overflow on ${viewport.width}px screens.`
      );
    }
  }
}

describe('withViewport utility', () => {
  it('should load as a test file to satisfy Jest', () => {
    expect(true).toBe(true);
  });
});
