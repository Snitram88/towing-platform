import { supabase } from './supabase';
import {
  AddressSuggestion,
  buildFallbackRoute,
  decodePolyline,
  fallbackSuggestions,
  MapPoint,
  RouteResult,
  randomSessionToken,
} from './booking';

type PlaceDetailsResult = {
  title: string;
  subtitle: string;
  point: MapPoint;
};

export function createPlacesSessionToken() {
  return randomSessionToken();
}

export async function autocompleteNigeriaAddresses(
  query: string,
  sessionToken: string,
  origin?: MapPoint | null
): Promise<AddressSuggestion[]> {
  if (!query.trim()) {
    return fallbackSuggestions('');
  }

  const { data, error } = await supabase.functions.invoke('maps-proxy', {
    body: {
      action: 'autocomplete',
      payload: {
        query,
        sessionToken,
        origin: origin ?? null,
      },
    },
  });

  if (error || !data?.suggestions) {
    return fallbackSuggestions(query);
  }

  const suggestions = (data.suggestions ?? [])
    .map((item: any, index: number) => {
      const prediction = item.placePrediction;
      if (!prediction?.placeId) return null;

      const main =
        prediction.structuredFormat?.mainText?.text ||
        prediction.text?.text ||
        'Address';
      const secondary =
        prediction.structuredFormat?.secondaryText?.text || 'Nigeria';

      return {
        id: prediction.placeId || String(index),
        placeId: prediction.placeId,
        title: main,
        subtitle: secondary,
      } as AddressSuggestion;
    })
    .filter(Boolean);

  return suggestions.length > 0 ? suggestions : fallbackSuggestions(query);
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
  const { data, error } = await supabase.functions.invoke('maps-proxy', {
    body: {
      action: 'resolve-place',
      payload: { placeId },
    },
  });

  if (error) return null;

  const first = data?.results?.[0];
  const location = first?.geometry?.location;

  if (!location) return null;

  return {
    title: first.formatted_address || 'Selected place',
    subtitle: 'Nigeria',
    point: {
      latitude: location.lat,
      longitude: location.lng,
    },
  };
}

export async function reverseGeocodePoint(point: MapPoint): Promise<string> {
  const { data, error } = await supabase.functions.invoke('maps-proxy', {
    body: {
      action: 'reverse-geocode',
      payload: { point },
    },
  });

  if (error) {
    return `Pinned location (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`;
  }

  const first = data?.results?.[0];
  return (
    first?.formatted_address ||
    `Pinned location (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`
  );
}

function parseDurationToMinutes(durationValue: string | undefined) {
  if (!durationValue) return 0;
  const seconds = Number(String(durationValue).replace('s', ''));
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

export async function computeDrivingRoute(
  origin: MapPoint,
  destination: MapPoint
): Promise<RouteResult> {
  const { data, error } = await supabase.functions.invoke('maps-proxy', {
    body: {
      action: 'route',
      payload: { origin, destination },
    },
  });

  if (error || !data?.routes?.[0]) {
    return buildFallbackRoute(origin, destination);
  }

  const route = data.routes[0];
  const distanceKm = Number(route.distanceMeters || 0) / 1000;
  const durationMin = parseDurationToMinutes(route.duration);
  const encodedPolyline = route.polyline?.encodedPolyline;
  const polyline = encodedPolyline ? decodePolyline(encodedPolyline) : [origin, destination];

  return {
    distanceKm: distanceKm || buildFallbackRoute(origin, destination).distanceKm,
    durationMin: durationMin || buildFallbackRoute(origin, destination).durationMin,
    polyline,
  };
}
