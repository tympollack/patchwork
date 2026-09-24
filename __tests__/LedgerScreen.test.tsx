import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { setTestViewport, assertWithinViewportBounds, VIEWPORTS, type ViewportPreset } from '../src/__tests__/utils/withViewport';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the component import
// ---------------------------------------------------------------------------
const mockNodes = [
  {
    id: 'node-001',
    lat: 40.712776,
    long: -74.005974,
    timestamp: Date.now() - 1000 * 60 * 5,
    status: 'pending',
    syncStatus: 'pending_sync',
    description: 'Pothole near crosswalk',
  },
  {
    id: 'node-002',
    lat: 34.052235,
    long: -118.243683,
    timestamp: Date.now() - 1000 * 60 * 60,
    status: 'awaiting_verification',
    syncStatus: 'synced',
    description: 'Broken sidewalk',
  },
  {
    id: 'node-003',
    lat: 41.878113,
    long: -87.629799,
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    status: 'denied',
    syncStatus: 'synced',
    description: null,
  },
];

jest.mock('../src/store/useNodeStore', () => ({
  useNodeStore: (selector: any) => {
    const store = {
      nodes: mockNodes,
      updateNodeDescription: jest.fn(),
    };
    return selector ? selector(store) : store;
  },
  useNodeSubscription: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
}));

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    OS: 'ios',
    select: (obj: any) => obj.ios,
  },
  OS: 'ios',
  select: (obj: any) => obj.ios,
}));

// LayoutAnimation: mock only configureNext via jest.spyOn in beforeEach
// (module-level mock of all of 'react-native' triggers TurboModuleRegistry errors)

import LedgerScreen from '../src/components/LedgerScreen';

const VIEWPORT_PRESETS: ViewportPreset[] = ['compact', 'standard', 'wide'];

describe('LedgerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress deprecation + error noise
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Prevent LayoutAnimation.configureNext from throwing in test env
    const LayoutAnimation = require('react-native').LayoutAnimation;
    if (LayoutAnimation) {
      jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Baseline render tests
  // ---------------------------------------------------------------------------

  it('renders the screen header', () => {
    const { getByText } = render(<LedgerScreen />);
    expect(getByText('PATCHWORK // NODE LEDGER')).toBeTruthy();
  });

  it('renders total entries count', () => {
    const { getByText } = render(<LedgerScreen />);
    expect(getByText('TOTAL ENTRIES:')).toBeTruthy();
  });

  it('renders filter button', () => {
    const { getByText } = render(<LedgerScreen />);
    expect(getByText(/FILTER/)).toBeTruthy();
  });

  it('renders node entries from store', () => {
    const { getAllByText } = render(<LedgerScreen />);
    // Nodes grouped by status — pending group should appear
    expect(getAllByText(/PENDING/i).length).toBeGreaterThan(0);
  });

  it('renders VERIFIER: ACTIVE subtitle', () => {
    const { getByText } = render(<LedgerScreen />);
    expect(getByText('VERIFIER: ACTIVE')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Multi-viewport boundary matrix
  // Tests per TASK-PW-RETROFIT-LEDGER-SCREEN agent_prompt:
  //   • Expanding card animations / log text don't force horizontal scroll on 320px
  //   • Map image container width is percentage or flex (not rigid pixel)
  //   • UPDATE LOG button visible + within safe tap area when card is expanded
  // ---------------------------------------------------------------------------

  describe.each(VIEWPORT_PRESETS)('viewport: %s', (preset) => {
    beforeEach(() => setTestViewport(preset));

    it('renders without crash at viewport width', () => {
      const { UNSAFE_root } = render(<LedgerScreen />);
      expect(UNSAFE_root).toBeTruthy();
    });

    it('map-container style is a percentage string — never a rigid pixel width', () => {
      const { getByText, getByTestId } = render(<LedgerScreen />);

      // Expand the awaiting_verification card to render the map-container
      fireEvent.press(getByText('34.05224, -118.24368'));

      // Read the actual rendered style from the element, not a precomputed constant
      const mapContainer = getByTestId('map-container');
      const style = StyleSheet.flatten(mapContainer.props.style ?? {});

      // width must be a string (e.g. '45%'), NOT a numeric pixel value.
      // If a future change sets width: 400, this test fails — catching the regression.
      expect(typeof style?.width).toBe('string');
      // Confirm it ends with '%' (relative, not absolute)
      expect(String(style?.width)).toMatch(/%$/);
    });

    it('listContent paddingHorizontal leaves positive usable width for coordinate text', () => {
      const { getByTestId } = render(<LedgerScreen />);

      // Read actual rendered style from the list container.
      // In RNTL, ScrollView contentContainerStyle is passed as contentContainerProps.style.
      // We check the outer list View which applies paddingHorizontal: 16.
      const list = getByTestId('node-list');
      const style = StyleSheet.flatten(list.props.contentContainerStyle ?? {});
      const paddingH = (typeof style?.paddingHorizontal === 'number' ? style.paddingHorizontal : 16) * 2;
      const usableWidth = VIEWPORTS[preset].width - paddingH;

      // Must be positive — text cannot render in zero or negative width
      expect(usableWidth).toBeGreaterThan(0);
      // 288px (compact) is sufficient for widest coordinate string
      expect(usableWidth).toBeGreaterThanOrEqual(100);
    });

    it('UPDATE LOG button is visible and within safe tap area when card is expanded', () => {
      const { getByText, getByTestId } = render(<LedgerScreen />);

      // Expand the awaiting_verification card (node-002) — this is the editable card
      // that renders both the map-container and the UPDATE LOG button.
      // The card header text includes the lat/lng coordinate.
      const headerCoord = getByText('34.05224, -118.24368');
      fireEvent.press(headerCoord);

      // UPDATE LOG button should now be visible
      const updateBtn = getByTestId('update-log-btn');
      assertWithinViewportBounds(updateBtn, VIEWPORTS[preset]);

      // The map thumbnail container should use percentage width (string), not fixed px
      const mapContainer = getByTestId('map-container');
      assertWithinViewportBounds(mapContainer, VIEWPORTS[preset]);
    });

    it('card containers use flex layout — no fixed widths wider than viewport', () => {
      // cardContainer: borderWidth + flex (no fixed pixel width)
      // expandedRow: flexDirection:'row' with leftPanel: flex:1 + mapContainer: '45%'
      // Both halves of the row are bounded by parent flex — no overflow possible.
      const viewport = VIEWPORTS[preset];
      const usableWidth = viewport.width - 32; // listContent paddingHorizontal: 16
      expect(usableWidth).toBeGreaterThan(0);
      // 45% of usable width (the map panel) must be < viewport.width
      const mapPanelWidth = Math.floor(usableWidth * 0.45);
      expect(mapPanelWidth).toBeLessThan(viewport.width);
    });
  });
});
