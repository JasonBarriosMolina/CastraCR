import ngeohash from 'ngeohash';

export const GEOHASH_PRECISION = 5; // ~5km precision

export function encodeGeohash(lat: number, lng: number, precision = GEOHASH_PRECISION): string {
  return ngeohash.encode(lat, lng, precision);
}

export function getNeighborGeohashes(geohash: string): string[] {
  return ngeohash.neighbors(geohash);
}

/**
 * Returns all geohashes covering a radius search.
 * Uses the hash + its 8 neighbors for a simple approach.
 */
export function getGeohashesForRadius(lat: number, lng: number): string[] {
  const center = encodeGeohash(lat, lng);
  const neighbors = getNeighborGeohashes(center);
  return [center, ...neighbors];
}

export function decodeGeohash(geohash: string): { lat: number; lng: number } {
  const [lat, lng] = ngeohash.decode(geohash);
  return { lat, lng };
}
