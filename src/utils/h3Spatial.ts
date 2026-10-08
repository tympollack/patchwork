/**
 * H3 Hexagonal Spatial Indexing & Privacy Density Masking Utility
 * (TASK-MESH-H3-PRIVACY)
 *
 * Implements Uber H3 spatial indexing (Resolution 10, ~66m edge length)
 * to aggregate civic infrastructure reports into hexagonal heatmaps
 * rather than exposing individual raw GPS coordinates.
 */

import { latLngToCell, cellToBoundary, cellToLatLng } from 'h3-js';
import { H3HexagonCell, H3DensityTier, H3AggregateOptions } from '../types/h3';

export const DEFAULT_H3_RESOLUTION = 10;

/**
 * Compute Uber H3 index at specified resolution for given coordinates.
 */
export function computeH3Index(
  lat: number,
  lng: number,
  resolution: number = DEFAULT_H3_RESOLUTION
): string {
  if (!isFinite(lat) || !isFinite(lng)) {
    throw new Error(`Invalid geographic coordinates: lat=${lat}, lng=${lng}`);
  }
  return latLngToCell(lat, lng, resolution);
}

/**
 * Get geographic boundary vertices [lat, lng] for an H3 cell.
 */
export function getH3CellBoundary(h3Index: string): Array<[number, number]> {
  return cellToBoundary(h3Index);
}

/**
 * Get center coordinates [lat, lng] for an H3 cell.
 */
export function getH3CellCenter(h3Index: string): [number, number] {
  return cellToLatLng(h3Index);
}

/**
 * Calculate density tier from node count within an H3 cell.
 */
export function calculateDensityTier(count: number): H3DensityTier {
  if (count <= 1) return 'low';
  if (count <= 4) return 'medium';
  if (count <= 9) return 'high';
  return 'critical';
}

/**
 * Determine Tech-Blueprint styling for an H3 cell based on crowd density and status.
 */
export function getHexagonStyle(
  count: number,
  dominantStatus: string = 'pending'
): H3HexagonCell['style'] {
  // Flagged / denied reports receive muted red warning outline and fill
  if (dominantStatus === 'denied') {
    return {
      color: '#FF5555',
      weight: 1.5,
      opacity: 0.9,
      fillColor: '#FF5555',
      fillOpacity: Math.min(0.6, 0.25 + count * 0.08),
    };
  }

  // Tech-Blueprint aesthetic:
  // Low density (1 node): Translucent Cyan with crisp Cornflower Blue border
  // Medium density (2-4 nodes): Electric Cyan fill with Bright Cyan border
  // High density (5-9 nodes): Bright Cyan glow
  // Critical density (10+ nodes): Intense Indigo-Cyan highlight
  if (count <= 1) {
    return {
      color: '#6495ED',
      weight: 1.5,
      opacity: 0.85,
      fillColor: '#00FFFF',
      fillOpacity: 0.22,
    };
  }

  if (count <= 4) {
    return {
      color: '#00FFFF',
      weight: 1.5,
      opacity: 0.9,
      fillColor: '#00E5FF',
      fillOpacity: 0.38,
    };
  }

  if (count <= 9) {
    return {
      color: '#00FFFF',
      weight: 2,
      opacity: 0.95,
      fillColor: '#38BDF8',
      fillOpacity: 0.55,
    };
  }

  // Critical (10+)
  return {
    color: '#00FFFF',
    weight: 2.5,
    opacity: 1.0,
    fillColor: '#818CF8',
    fillOpacity: 0.72,
  };
}

export interface RawNodeInput {
  id: string;
  lat?: number;
  long?: number;
  lng?: number;
  status?: string;
}

/**
 * Aggregate raw node reports into H3 Resolution-10 hexagonal cells.
 * Individual GPS coordinates are masked into hexagonal crowd density cells.
 */
export function aggregateNodesToH3Hexagons(
  nodes: RawNodeInput[],
  options: H3AggregateOptions = {}
): H3HexagonCell[] {
  const resolution = options.resolution ?? DEFAULT_H3_RESOLUTION;
  const cellMap = new Map<
    string,
    {
      nodeIds: string[];
      statuses: Record<string, number>;
    }
  >();

  // 1. Group nodes by Resolution 10 H3 cell
  for (const node of nodes) {
    const lat = node.lat;
    const lng = node.long !== undefined ? node.long : node.lng;

    if (lat === undefined || lng === undefined || !isFinite(lat) || !isFinite(lng)) {
      continue;
    }

    const h3Index = computeH3Index(lat, lng, resolution);
    const existing = cellMap.get(h3Index);
    const status = node.status || 'pending';

    if (existing) {
      existing.nodeIds.push(node.id);
      existing.statuses[status] = (existing.statuses[status] || 0) + 1;
    } else {
      cellMap.set(h3Index, {
        nodeIds: [node.id],
        statuses: { [status]: 1 },
      });
    }
  }

  // 2. Build structured H3HexagonCell objects
  const hexagons: H3HexagonCell[] = [];

  for (const [h3Index, data] of cellMap.entries()) {
    const count = data.nodeIds.length;
    const boundary = getH3CellBoundary(h3Index);
    const center = getH3CellCenter(h3Index);
    const densityTier = calculateDensityTier(count);

    // Determine dominant status
    let dominantStatus = 'pending';
    let maxStatusCount = 0;
    for (const [status, sCount] of Object.entries(data.statuses)) {
      if (sCount > maxStatusCount) {
        maxStatusCount = sCount;
        dominantStatus = status;
      }
    }

    const style = getHexagonStyle(count, dominantStatus);

    hexagons.push({
      h3Index,
      count,
      boundary,
      center,
      nodeIds: data.nodeIds,
      statuses: data.statuses,
      dominantStatus,
      densityTier,
      style,
    });
  }

  // Sort by report density descending
  return hexagons.sort((a, b) => b.count - a.count);
}
