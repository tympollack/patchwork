import {
  computeH3Index,
  getH3CellBoundary,
  getH3CellCenter,
  calculateDensityTier,
  getHexagonStyle,
  aggregateNodesToH3Hexagons,
  DEFAULT_H3_RESOLUTION,
} from '../src/utils/h3Spatial';

describe('TASK-MESH-H3-PRIVACY: H3 Hexagonal Region Masking & Crowd Density Indexing', () => {
  const sampleLat = 39.0501;
  const sampleLng = -84.1915;

  describe('computeH3Index', () => {
    it('computes valid Resolution 10 Uber H3 index', () => {
      const cell = computeH3Index(sampleLat, sampleLng, 10);
      expect(typeof cell).toBe('string');
      expect(cell.length).toBeGreaterThan(10);
      expect(cell).toMatch(/^[0-9a-f]+$/i);
    });

    it('defaults to Resolution 10', () => {
      const cellDefault = computeH3Index(sampleLat, sampleLng);
      const cellRes10 = computeH3Index(sampleLat, sampleLng, DEFAULT_H3_RESOLUTION);
      expect(cellDefault).toBe(cellRes10);
    });

    it('throws error on non-finite coordinates', () => {
      expect(() => computeH3Index(NaN, sampleLng)).toThrow('Invalid geographic coordinates');
      expect(() => computeH3Index(sampleLat, Infinity)).toThrow('Invalid geographic coordinates');
    });
  });

  describe('getH3CellBoundary and getH3CellCenter', () => {
    it('returns 6 boundary vertices forming a hexagon polygon', () => {
      const cell = computeH3Index(sampleLat, sampleLng, 10);
      const boundary = getH3CellBoundary(cell);

      expect(boundary).toHaveLength(6);
      boundary.forEach(([lat, lng]) => {
        expect(typeof lat).toBe('number');
        expect(typeof lng).toBe('number');
        expect(isFinite(lat)).toBe(true);
        expect(isFinite(lng)).toBe(true);
      });
    });

    it('returns center coordinate close to original point', () => {
      const cell = computeH3Index(sampleLat, sampleLng, 10);
      const center = getH3CellCenter(cell);

      expect(center).toHaveLength(2);
      expect(Math.abs(center[0] - sampleLat)).toBeLessThan(0.01);
      expect(Math.abs(center[1] - sampleLng)).toBeLessThan(0.01);
    });
  });

  describe('calculateDensityTier', () => {
    it('classifies density counts into appropriate tiers', () => {
      expect(calculateDensityTier(1)).toBe('low');
      expect(calculateDensityTier(2)).toBe('medium');
      expect(calculateDensityTier(4)).toBe('medium');
      expect(calculateDensityTier(5)).toBe('high');
      expect(calculateDensityTier(9)).toBe('high');
      expect(calculateDensityTier(10)).toBe('critical');
      expect(calculateDensityTier(50)).toBe('critical');
    });
  });

  describe('getHexagonStyle (Tech-Blueprint aesthetic)', () => {
    it('returns Cornflower Blue border for low density', () => {
      const style = getHexagonStyle(1, 'pending');
      expect(style.color).toBe('#6495ED');
      expect(style.fillColor).toBe('#00FFFF');
      expect(style.fillOpacity).toBeCloseTo(0.22, 2);
    });

    it('returns Bright Cyan glowing border and increased fill opacity for medium/high density', () => {
      const medStyle = getHexagonStyle(3, 'verified');
      expect(medStyle.color).toBe('#00FFFF');
      expect(medStyle.fillOpacity).toBeCloseTo(0.38, 2);

      const highStyle = getHexagonStyle(7, 'verified');
      expect(highStyle.color).toBe('#00FFFF');
      expect(highStyle.fillOpacity).toBeCloseTo(0.55, 2);
    });

    it('returns warning red style when dominant status is denied', () => {
      const style = getHexagonStyle(2, 'denied');
      expect(style.color).toBe('#FF5555');
      expect(style.fillColor).toBe('#FF5555');
    });
  });

  describe('aggregateNodesToH3Hexagons', () => {
    it('returns empty array when given empty node list', () => {
      const result = aggregateNodesToH3Hexagons([]);
      expect(result).toEqual([]);
    });

    it('filters out nodes with invalid coordinates', () => {
      const nodes = [
        { id: 'bad-1', lat: NaN, long: -84.19 },
        { id: 'bad-2', lat: 39.05, long: undefined },
        { id: 'good-1', lat: 39.0501, long: -84.1915, status: 'verified' },
      ];
      const result = aggregateNodesToH3Hexagons(nodes);
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(1);
      expect(result[0].nodeIds).toEqual(['good-1']);
    });

    it('aggregates multiple nearby reports in the same Resolution 10 cell into a single hexagon', () => {
      // Extremely close coordinates within ~20 meters (well within ~66m Res 10 cell)
      const nodes = [
        { id: 'node-A', lat: 39.05010, long: -84.19150, status: 'verified' },
        { id: 'node-B', lat: 39.05012, long: -84.19152, status: 'verified' },
        { id: 'node-C', lat: 39.05011, long: -84.19149, status: 'pending' },
      ];

      const result = aggregateNodesToH3Hexagons(nodes, { resolution: 10 });

      expect(result).toHaveLength(1);
      const hex = result[0];
      expect(hex.count).toBe(3);
      expect(hex.nodeIds).toEqual(['node-A', 'node-B', 'node-C']);
      expect(hex.statuses).toEqual({ verified: 2, pending: 1 });
      expect(hex.dominantStatus).toBe('verified');
      expect(hex.densityTier).toBe('medium');
      expect(hex.boundary).toHaveLength(6);
    });

    it('separates distant nodes into distinct hexagonal cells and sorts by density descending', () => {
      const nodes = [
        // Cell 1: 3 nodes
        { id: 'c1-1', lat: 39.0501, long: -84.1915, status: 'verified' },
        { id: 'c1-2', lat: 39.05011, long: -84.19151, status: 'verified' },
        { id: 'c1-3', lat: 39.05012, long: -84.19152, status: 'verified' },
        // Cell 2 (several km away): 1 node
        { id: 'c2-1', lat: 39.1000, long: -84.2500, status: 'pending' },
      ];

      const result = aggregateNodesToH3Hexagons(nodes);

      expect(result).toHaveLength(2);
      expect(result[0].count).toBe(3);
      expect(result[1].count).toBe(1);
      expect(result[0].h3Index).not.toBe(result[1].h3Index);
    });

    it('supports lng property alternative to long', () => {
      const nodes = [
        { id: 'alt-1', lat: 39.0501, lng: -84.1915, status: 'synced' },
      ];
      const result = aggregateNodesToH3Hexagons(nodes);
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(1);
    });
  });

  describe('useSettingsStore H3 Privacy Mask Configuration', () => {
    it('defaults h3PrivacyMask to true', () => {
      const { useSettingsStore } = require('../src/store/useSettingsStore');
      const state = useSettingsStore.getState();
      expect(state.h3PrivacyMask).toBe(true);
    });

    it('toggles h3PrivacyMask correctly', () => {
      const { useSettingsStore } = require('../src/store/useSettingsStore');
      useSettingsStore.getState().set({ h3PrivacyMask: false });
      expect(useSettingsStore.getState().h3PrivacyMask).toBe(false);

      useSettingsStore.getState().set({ h3PrivacyMask: true });
      expect(useSettingsStore.getState().h3PrivacyMask).toBe(true);
    });
  });

  describe('H3HexagonCard Component Rendering', () => {
    it('renders cell index, crowd density, and privacy guarantee', () => {
      const React = require('react');
      const renderer = require('react-test-renderer');
      const H3HexagonCard = require('../src/components/H3HexagonCard').default;

      const mockHex = {
        h3Index: '8a2a93069a37fff',
        count: 5,
        boundary: [
          [39.05, -84.19],
          [39.051, -84.191],
          [39.052, -84.192],
          [39.053, -84.193],
          [39.054, -84.194],
          [39.055, -84.195],
        ],
        center: [39.05, -84.19],
        nodeIds: ['n1', 'n2', 'n3', 'n4', 'n5'],
        statuses: { verified: 3, pending: 2 },
        dominantStatus: 'verified',
        densityTier: 'high',
        style: {
          color: '#00FFFF',
          weight: 2,
          opacity: 0.95,
          fillColor: '#38BDF8',
          fillOpacity: 0.55,
        },
      };

      const onClose = jest.fn();
      let tree: any;
      renderer.act(() => {
        tree = renderer.create(React.createElement(H3HexagonCard, { hexagon: mockHex, onClose }));
      });

      const jsonStr = JSON.stringify(tree.toJSON());
      expect(jsonStr).toContain('8a2a93069a37fff');
      expect(jsonStr).toContain('5');
      expect(jsonStr).toContain('HIGH');
      expect(jsonStr).toContain('PRIVACY PROTOCOL ACTIVE');
    });
  });
});
