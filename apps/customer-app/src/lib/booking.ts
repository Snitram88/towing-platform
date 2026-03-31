import type { Region } from 'react-native-maps';

export type MapPoint = {
  latitude: number;
  longitude: number;
};

export type AddressSuggestion = {
  id: string;
  label: string;
  subtitle: string;
  point: MapPoint;
};

export type TowUnit = {
  id: string;
  title: string;
  point: MapPoint;
  etaMin: number;
};

export const DEFAULT_POINT: MapPoint = {
  latitude: 6.6018,
  longitude: 3.3515,
};

export const DEFAULT_REGION: Region = {
  latitude: DEFAULT_POINT.latitude,
  longitude: DEFAULT_POINT.longitude,
  latitudeDelta: 0.14,
  longitudeDelta: 0.12,
};

export const ADDRESS_CATALOG: AddressSuggestion[] = [
  {
    id: 'agunbiade',
    label: '7 Agunbiade Street',
    subtitle: 'Ikorodu, Lagos',
    point: { latitude: 6.6196, longitude: 3.5103 },
  },
  {
    id: 'passport-ikoyi',
    label: 'Ikoyi Passport Office',
    subtitle: 'Ikoyi Road, Lagos',
    point: { latitude: 6.4474, longitude: 3.4302 },
  },
  {
    id: 'admiralty',
    label: '12 Admiralty Way',
    subtitle: 'Lekki Phase 1, Lagos',
    point: { latitude: 6.4459, longitude: 3.4702 },
  },
  {
    id: 'awolowo',
    label: '42 Awolowo Road',
    subtitle: 'Ikoyi, Lagos',
    point: { latitude: 6.4523, longitude: 3.4287 },
  },
  {
    id: 'allen',
    label: '14 Allen Avenue',
    subtitle: 'Ikeja, Lagos',
    point: { latitude: 6.6013, longitude: 3.3517 },
  },
  {
    id: 'ikeja-city-mall',
    label: 'Shoprite Ikeja City Mall',
    subtitle: 'Obafemi Awolowo Way, Ikeja',
    point: { latitude: 6.6059, longitude: 3.3515 },
  },
  {
    id: 'gbagada',
    label: 'Gbagada Workshop District',
    subtitle: 'Gbagada, Lagos',
    point: { latitude: 6.5564, longitude: 3.3915 },
  },
  {
    id: 'unity-close-8',
    label: '8 Unity Close',
    subtitle: 'Lagos 101232',
    point: { latitude: 6.571, longitude: 3.3306 },
  },
  {
    id: 'unity-close-4',
    label: '4 Unity Close',
    subtitle: 'Agege 101232',
    point: { latitude: 6.6158, longitude: 3.3159 },
  },
  {
    id: 'iyana-ipaja',
    label: 'Iyana Ipaja Bus Stop',
    subtitle: 'Iyana-Ipaja New Road, Ikeja',
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

export function suggestAddresses(query: string): AddressSuggestion[] {
  const q = query.trim().toLowerCase();

  if (!q) {
    return ADDRESS_CATALOG.slice(0, 7);
  }

  return ADDRESS_CATALOG.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q)
  ).slice(0, 10);
}

export function createNearbyTowUnits(center: MapPoint): TowUnit[] {
  const offsets = [
    { lat: 0.005, lng: -0.006, eta: 6 },
    { lat: -0.004, lng: 0.005, eta: 8 },
    { lat: 0.008, lng: 0.003, eta: 5 },
    { lat: -0.007, lng: -0.004, eta: 10 },
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

export function haversineKm(a: MapPoint, b: MapPoint): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

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

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function estimateDurationMinutes(distanceKm: number): number {
  return Math.max(8, Math.round(distanceKm * 2.1));
}

export function interpolatePoint(start: MapPoint, end: MapPoint, progress: number): MapPoint {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
    longitude: start.longitude + (end.longitude - start.longitude) * progress,
  };
}

export function formatLatLng(point: MapPoint): string {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

export function describeReverseGeocode(
  result:
    | {
        street?: string | null;
        name?: string | null;
        city?: string | null;
        district?: string | null;
        region?: string | null;
      }
    | undefined,
  fallback: MapPoint
): string {
  if (!result) {
    return `Pinned location (${formatLatLng(fallback)})`;
  }

  const line1 = result.street || result.name || 'Pinned location';
  const line2 = result.city || result.district || result.region || 'Selected on map';

  return `${line1}, ${line2}`;
}
