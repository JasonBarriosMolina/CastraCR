import { describe, it, expect } from 'vitest';
import {
  encodeGeohash,
  decodeGeohash,
  getNeighborGeohashes,
  getGeohashesForRadius,
  GEOHASH_PRECISION,
} from '../geohash.js';

// San José, Costa Rica
const SAN_JOSE_LAT = 9.9281;
const SAN_JOSE_LNG = -84.0907;

describe('GEOHASH_PRECISION', () => {
  it('es 5 (precisión ~5km)', () => {
    expect(GEOHASH_PRECISION).toBe(5);
  });
});

describe('encodeGeohash', () => {
  it('retorna string de longitud = precision', () => {
    const hash = encodeGeohash(SAN_JOSE_LAT, SAN_JOSE_LNG);
    expect(hash).toHaveLength(GEOHASH_PRECISION);
    expect(typeof hash).toBe('string');
  });

  it('retorna hash diferente para distintas coordenadas', () => {
    const sj  = encodeGeohash(SAN_JOSE_LAT, SAN_JOSE_LNG);
    const lim = encodeGeohash(-12.0464, -77.0428); // Lima
    expect(sj).not.toBe(lim);
  });

  it('respeta el parámetro de precision', () => {
    const hash6 = encodeGeohash(SAN_JOSE_LAT, SAN_JOSE_LNG, 6);
    expect(hash6).toHaveLength(6);
  });
});

describe('decodeGeohash', () => {
  it('decode(encode(lat, lng)) retorna coordenadas aproximadas', () => {
    const hash = encodeGeohash(SAN_JOSE_LAT, SAN_JOSE_LNG);
    const { lat, lng } = decodeGeohash(hash);
    // Tolerancia ~0.5° (precisión geohash de 5 chars)
    expect(lat).toBeCloseTo(SAN_JOSE_LAT, 0);
    expect(lng).toBeCloseTo(SAN_JOSE_LNG, 0);
  });

  it('retorna objeto con lat y lng numéricos', () => {
    const result = decodeGeohash('d1xvt');
    expect(typeof result.lat).toBe('number');
    expect(typeof result.lng).toBe('number');
  });
});

describe('getNeighborGeohashes', () => {
  it('retorna exactamente 8 vecinos', () => {
    const hash = encodeGeohash(SAN_JOSE_LAT, SAN_JOSE_LNG);
    const neighbors = getNeighborGeohashes(hash);
    expect(neighbors).toHaveLength(8);
  });

  it('los vecinos son strings de la misma longitud que el hash', () => {
    const hash = encodeGeohash(SAN_JOSE_LAT, SAN_JOSE_LNG);
    const neighbors = getNeighborGeohashes(hash);
    neighbors.forEach((n) => expect(n).toHaveLength(hash.length));
  });
});

describe('getGeohashesForRadius', () => {
  it('retorna 9 geohashes (centro + 8 vecinos)', () => {
    const hashes = getGeohashesForRadius(SAN_JOSE_LAT, SAN_JOSE_LNG);
    expect(hashes).toHaveLength(9);
  });

  it('el primer elemento es el hash central', () => {
    const center = encodeGeohash(SAN_JOSE_LAT, SAN_JOSE_LNG);
    const hashes = getGeohashesForRadius(SAN_JOSE_LAT, SAN_JOSE_LNG);
    expect(hashes[0]).toBe(center);
  });

  it('no tiene duplicados', () => {
    const hashes = getGeohashesForRadius(SAN_JOSE_LAT, SAN_JOSE_LNG);
    const unique = new Set(hashes);
    expect(unique.size).toBe(hashes.length);
  });
});
