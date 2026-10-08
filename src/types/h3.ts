/**
 * H3 Hexagonal Spatial Indexing & Density Types
 * (TASK-MESH-H3-PRIVACY)
 */

export type H3DensityTier = 'low' | 'medium' | 'high' | 'critical';

export interface H3HexagonCell {
  /** Resolution 10 Uber H3 index (e.g., '8a2a1072b59ffff') */
  h3Index: string;
  /** Number of nodes/reports in this hexagon cell */
  count: number;
  /** Array of [lat, lng] vertices forming the hexagon polygon boundary */
  boundary: Array<[number, number]>;
  /** Center [lat, lng] coordinates of the hexagon */
  center: [number, number];
  /** List of node IDs aggregated inside this cell */
  nodeIds: string[];
  /** Breakdown of statuses for nodes within this cell */
  statuses: {
    pending?: number;
    awaiting_verification?: number;
    verified?: number;
    denied?: number;
    synced?: number;
    [key: string]: number | undefined;
  };
  /** Dominant node status within this cell */
  dominantStatus: string;
  /** Relative density tier based on count */
  densityTier: H3DensityTier;
  /** Polygon styling adhering to the Tech-Blueprint design system */
  style: {
    color: string;       // Border color (Cornflower Blue / Bright Cyan)
    weight: number;      // Border width
    opacity: number;     // Border opacity
    fillColor: string;   // Interior fill color
    fillOpacity: number; // Scaled fill opacity based on density
  };
}

export interface H3AggregateOptions {
  /** H3 spatial resolution (default 10, ~66m edge) */
  resolution?: number;
  /** Primary highlight color override */
  highlightColor?: string;
}
