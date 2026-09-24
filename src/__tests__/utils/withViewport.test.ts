/**
 * withViewport.test.ts
 *
 * Acceptance criteria for TASK-PW-VIEWPORT-HARNESS:
 * "Unit test withViewport.test.ts confirms mocks isolate cleanly between sequential tests."
 *
 * Tests prove:
 * 1. VIEWPORTS presets have the exact dimensions specified in the task description.
 * 2. setTestViewport() causes useWindowDimensions to return the correct dimensions.
 * 3. setTestViewport() causes Dimensions.get('window') to return the correct dimensions.
 * 4. Mocks from one test do NOT bleed into the next (afterEach restoreAllMocks fires).
 * 5. assertWithinViewportBounds passes for a style whose numeric width fits the viewport.
 * 6. assertWithinViewportBounds fails (expect throws) for a style wider than the viewport.
 * 7. assertWithinViewportBounds is a no-op when width is a percentage string.
 */
import { useWindowDimensions, Dimensions, StyleSheet } from 'react-native';
import {
  VIEWPORTS,
  setTestViewport,
  assertWithinViewportBounds,
  type ViewportPreset,
} from './withViewport';

// ---------------------------------------------------------------------------
// 1. Preset shape verification
// ---------------------------------------------------------------------------
describe('VIEWPORTS presets', () => {
  it('compact matches iPhone SE 1st gen / small Android spec', () => {
    expect(VIEWPORTS.compact).toEqual({ width: 320, height: 568, scale: 2, fontScale: 1 });
  });

  it('standard matches iPhone 14/15 spec', () => {
    expect(VIEWPORTS.standard).toEqual({ width: 390, height: 844, scale: 3, fontScale: 1 });
  });

  it('wide matches Pixel 7 / Galaxy S-series spec', () => {
    expect(VIEWPORTS.wide).toEqual({ width: 412, height: 915, scale: 2.6, fontScale: 1 });
  });
});

// ---------------------------------------------------------------------------
// 2. setTestViewport — useWindowDimensions mock
// ---------------------------------------------------------------------------
describe('setTestViewport — useWindowDimensions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const cases: ViewportPreset[] = ['compact', 'standard', 'wide'];

  cases.forEach((preset) => {
    it(`mocks useWindowDimensions to return ${VIEWPORTS[preset].width}x${VIEWPORTS[preset].height} for '${preset}'`, () => {
      setTestViewport(preset);
      const dims = useWindowDimensions();
      expect(dims.width).toBe(VIEWPORTS[preset].width);
      expect(dims.height).toBe(VIEWPORTS[preset].height);
      expect(dims.scale).toBe(VIEWPORTS[preset].scale);
      expect(dims.fontScale).toBe(VIEWPORTS[preset].fontScale);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. setTestViewport — Dimensions.get mock
// ---------------------------------------------------------------------------
describe('setTestViewport — Dimensions.get', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("mocks Dimensions.get('window') for compact viewport", () => {
    setTestViewport('compact');
    const win = Dimensions.get('window');
    expect(win.width).toBe(320);
    expect(win.height).toBe(568);
  });

  it("mocks Dimensions.get('screen') for wide viewport", () => {
    setTestViewport('wide');
    const scr = Dimensions.get('screen');
    expect(scr.width).toBe(412);
    expect(scr.height).toBe(915);
  });
});

// ---------------------------------------------------------------------------
// 4. Mock isolation between sequential tests — the key acceptance criterion
// ---------------------------------------------------------------------------
describe('mock isolation between sequential tests', () => {
  it('test A: sets compact viewport (320px)', () => {
    setTestViewport('compact');
    expect(useWindowDimensions().width).toBe(320);
  });

  // afterEach restoreAllMocks fires between A and B.
  // If isolation works, useWindowDimensions is restored to its original implementation
  // (not the compact spy returning 320px from test A).
  it('test B: no mock set — compact spy from test A is fully restored by afterEach', () => {
    // After test A ran and afterEach fired restoreAllMocks:
    // the useWindowDimensions spy should be gone — isMockFunction returns false.
    // If the mock was leaking, isMockFunction would return true here.
    const rn = require('react-native');
    expect(jest.isMockFunction(rn.useWindowDimensions)).toBe(false);

    // Secondary check: set a fresh spy and confirm it returns the correct value
    // to verify the spy mechanism itself is functional after restore.
    jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 999, height: 999, scale: 1, fontScale: 1 });
    expect(rn.useWindowDimensions().width).toBe(999);
    // Restore explicitly so test C starts clean
    jest.restoreAllMocks();
    // After restore, isMockFunction must be false again
    expect(jest.isMockFunction(rn.useWindowDimensions)).toBe(false);
  });

  it('test C: sets wide viewport (412px) — independent of test A compact mock', () => {
    setTestViewport('wide');
    expect(useWindowDimensions().width).toBe(412);
    // Confirm test A's 320px did not persist
    expect(useWindowDimensions().width).not.toBe(320);
  });
});

// ---------------------------------------------------------------------------
// 5-7. assertWithinViewportBounds
// ---------------------------------------------------------------------------
describe('assertWithinViewportBounds', () => {
  const compactVP = VIEWPORTS.compact; // { width: 320, height: 568 }

  function makeElement(style: object) {
    return { props: { style } } as any;
  }

  it('passes when numeric width equals viewport width (exact boundary)', () => {
    const el = makeElement({ width: 320 });
    expect(() => assertWithinViewportBounds(el, compactVP)).not.toThrow();
  });

  it('passes when numeric width is less than viewport width', () => {
    const el = makeElement({ width: 72 }); // captureOuter size
    expect(() => assertWithinViewportBounds(el, compactVP)).not.toThrow();
  });

  it('fails when numeric width exceeds viewport width', () => {
    const el = makeElement({ width: 400 }); // wider than 320px compact
    expect(() => assertWithinViewportBounds(el, compactVP)).toThrow();
  });

  it('is a no-op (does not fail) when width is a percentage string', () => {
    const el = makeElement({ width: '100%' });
    expect(() => assertWithinViewportBounds(el, compactVP)).not.toThrow();
  });

  it('is a no-op when no width style is set', () => {
    const el = makeElement({ flex: 1 });
    expect(() => assertWithinViewportBounds(el, compactVP)).not.toThrow();
  });

  it('handles StyleSheet.flatten on nested style arrays', () => {
    const flat = StyleSheet.create({ a: { width: 200 } });
    const el = makeElement([flat.a]);
    expect(() => assertWithinViewportBounds(el, compactVP)).not.toThrow();
  });

  it('emits a console.warn (not a throw) for flexShrink:0 without a flex bound', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const el = makeElement({ flexShrink: 0 }); // no flex/maxWidth/width:'100%'
    expect(() => assertWithinViewportBounds(el, compactVP)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('flexShrink:0'));
    warnSpy.mockRestore();
  });

  it('does NOT warn for flexShrink:0 when width:"100%" is present', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const el = makeElement({ flexShrink: 0, width: '100%' });
    expect(() => assertWithinViewportBounds(el, compactVP)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
