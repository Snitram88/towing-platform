import type { Region } from 'react-native-maps';

export type MapPoint = {
  latitude: number;
  longitude: number;
};

export type AddressSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  placeId?: string;
  point?: MapPoint;
};

export type TowUnit = {
  id: string;
  title: string;
  etaMin: number;
  point: MapPoint;
};

export type RouteResult = {
  distanceKm: number;
  durationMin: number;
  polyline: MapPoint[];
};

export const DEFAULT_POINT: MapPoint = {
  latitude: 6.5244,
  longitude: 3.3792,
};

export const DEFAULT_REGION: Region = {
  latitude: DEFAULT_POINT.latitude,
  longitude: DEFAULT_POINT.longitude,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

export const FALLBACK_ADDRESSES: AddressSuggestion[] = [
  {
    id: 'admiralty-way',
    title: '12 Admiralty Way',
    subtitle: 'Lekki Phase 1, Lagos',
    point: { latitude: 6.4459, longitude: 3.4702 },
  },
  {
    id: 'awolowo-road',
    title: '42 Awolowo Road',
    subtitle: 'Ikoyi, Lagos',
    point: { latitude: 6.4523, longitude: 3.4287 },
  },
  {
    id: 'ikeja-city-mall',
    title: 'Ikeja City Mall',
    subtitle: 'Obafemi Awolowo Way, Ikeja, Lagos',
    point: { latitude: 6.6059, longitude: 3.3515 },
  },
  {
    id: 'allen-avenue',
    title: '14 Allen Avenue',
    subtitle: 'Ikeja, Lagos',
    point: { latitude: 6.6013, longitude: 3.3517 },
  },
  {
    id: 'ikorodu-road',
    title: '7 Agunbiade Street',
    subtitle: 'Ikorodu, Lagos',
    point: { latitude: 6.6196, longitude: 3.5103 },
  },
  {
    id: 'gbagada',
    title: 'Gbagada Workshop District',
    subtitle: 'Gbagada, Lagos',
    point: { latitude: 6.5564, longitude: 3.3915 },
  },
  {
    id: 'unity-close-lagos',
    title: '8 Unity Close',
    subtitle: 'Lagos 101232',
    point: { latitude: 6.571, longitude: 3.3306 },
  },
  {
    id: 'iyana-ipaja',
    title: 'Iyana Ipaja Bus Stop',
    subtitle: 'Ikeja, Lagos',
    point: { latitude: 6.6054, longitude: 3.2909 },
  },
];

export function pointToRegion(point: MapPoint, zoom = 0.035): Region {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: zoom,
    longitudeDelta: zoom,
  };
}

export function haversineKm(a: MapPoint, b: MapPoint): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) *
      Math.sin(dLng / 2) *
      Math.cos(lat1) *
      Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function estimateDurationMinutes(distanceKm: number) {
  return Math.max(6, Math.round(distanceKm * 2.2));
}

export function interpolatePoint(start: MapPoint, end: MapPoint, progress: number): MapPoint {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
    longitude: start.longitude + (end.longitude - start.longitude) * progress,
  };
}

export function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export function createNearbyTowUnits(center: MapPoint): TowUnit[] {
  const offsets = [
    { lat: 0.005, lng: -0.006, eta: 6 },
    { lat: -0.004, lng: 0.005, eta: 8 },
    { lat: 0.007, lng: 0.003, eta: 5 },
    { lat: -0.006, lng: -0.004, eta: 10 },
  ];

  return offsets.map((offset, index) => ({
    id: `tow-${index + 1}`,
    title: `Tow unit ${index + 1}`,
    etaMin: offset.eta,
    point: {
      latitude: center.latitude + offset.lat,
      longitude: center.longitude + offset.lng,
    },
  }));
}

export function nearestTowUnit(origin: MapPoint, units: TowUnit[]): TowUnit {
  return [...units].sort((a, b) => haversineKm(origin, a.point) - haversineKm(origin, b.point))[0];
}

export function fallbackSuggestions(query: string): AddressSuggestion[] {
  const q = query.trim().toLowerCase();

  if (!q) return FALLBACK_ADDRESSES.slice(0, 8);

  return FALLBACK_ADDRESSES.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q)
  ).slice(0, 8);
}

export function decodePolyline(encoded: string): MapPoint[] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: MapPoint[] = [];

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return coordinates;
}

export function buildFallbackRoute(origin: MapPoint, destination: MapPoint): RouteResult {
  const distanceKm = haversineKm(origin, destination);
  return {
    distanceKm,
    durationMin: estimateDurationMinutes(distanceKm),
    polyline: [origin, destination],
  };
}

export function randomSessionToken() {
  return Math.random().toString(36).slice(2, 18);
}
