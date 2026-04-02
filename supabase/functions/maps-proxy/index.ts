const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const GOOGLE_KEY = Deno.env.get('GOOGLE_MAPS_SERVER_KEY');

    if (!GOOGLE_KEY) {
      return jsonResponse({ error: 'Missing GOOGLE_MAPS_SERVER_KEY' }, 500);
    }

    const { action, payload } = await req.json();

    if (action === 'autocomplete') {
      const { query, sessionToken, origin } = payload ?? {};

      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask':
            'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.distanceMeters',
        },
        body: JSON.stringify({
          input: query,
          sessionToken,
          languageCode: 'en',
          includedRegionCodes: ['ng'],
          includeQueryPredictions: false,
          locationRestriction: {
            rectangle: {
              low: { latitude: 4.2, longitude: 2.6 },
              high: { latitude: 13.9, longitude: 14.7 },
            },
          },
          ...(origin
            ? {
                origin: {
                  latitude: origin.latitude,
                  longitude: origin.longitude,
                },
              }
            : {}),
        }),
      });

      const data = await response.json();
      return jsonResponse(data, response.status);
    }

    if (action === 'resolve-place') {
      const { placeId } = payload ?? {};

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(
          placeId
        )}&key=${GOOGLE_KEY}`
      );

      const data = await response.json();
      return jsonResponse(data, response.status);
    }

    if (action === 'reverse-geocode') {
      const { point } = payload ?? {};

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${point.latitude},${point.longitude}&key=${GOOGLE_KEY}`
      );

      const data = await response.json();
      return jsonResponse(data, response.status);
    }

    if (action === 'route') {
      const { origin, destination } = payload ?? {};

      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: origin.latitude,
                longitude: origin.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destination.latitude,
                longitude: destination.longitude,
              },
            },
          },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        }),
      });

      const data = await response.json();
      return jsonResponse(data, response.status);
    }

    return jsonResponse({ error: 'Unsupported action' }, 400);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown function error' },
      500
    );
  }
});
