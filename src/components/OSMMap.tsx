import React, { useRef, useEffect, useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { StyleSheet, View } from 'react-native';
import { H3HexagonCell } from '../types/h3';

export interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  status?: string;
}

export interface OSMMapProps {
  initialLat: number;
  initialLng: number;
  markers?: MarkerData[];
  hexagons?: H3HexagonCell[];
  h3MaskEnabled?: boolean;
  userLocation?: { lat: number; lng: number; heading: number } | null;
  onMarkerPress?: (id: string) => void;
  onHexagonPress?: (h3Index: string) => void;
  onCenterChange?: (coords: { lat: number; lng: number }) => void;
}

const VALID_STATUSES = ['pending', 'awaiting_verification', 'verified', 'denied', 'archived'];

export default function OSMMap({
  initialLat,
  initialLng,
  markers = [],
  hexagons = [],
  h3MaskEnabled = true,
  userLocation,
  onMarkerPress,
  onHexagonPress,
  onCenterChange,
}: OSMMapProps) {
  const webViewRef = useRef<WebView>(null);
  const isMapReadyRef = useRef<boolean>(false);
  const lastLayersPayloadRef = useRef<string>('');

  // Sanitized marker data — only numeric lat/lng and alphanumeric ID
  const sanitizedMarkers = useMemo(
    () =>
      markers.map((m) => ({
        id: String(m.id).replace(/[^a-zA-Z0-9_-]/g, ''),
        lat: isFinite(m.lat) ? Number(m.lat) : 0,
        lng: isFinite(m.lng) ? Number(m.lng) : 0,
        status: VALID_STATUSES.includes(m.status ?? '') ? m.status : 'pending',
      })),
    [markers]
  );

  // Sanitized hexagon cell data
  const sanitizedHexagons = useMemo(
    () =>
      hexagons.map((h) => ({
        h3Index: String(h.h3Index).replace(/[^a-f0-9]/gi, ''),
        count: isFinite(h.count) ? Number(h.count) : 0,
        boundary: Array.isArray(h.boundary)
          ? h.boundary.map((coord) => [
              isFinite(coord[0]) ? Number(coord[0]) : 0,
              isFinite(coord[1]) ? Number(coord[1]) : 0,
            ])
          : [],
        center: [
          isFinite(h.center[0]) ? Number(h.center[0]) : 0,
          isFinite(h.center[1]) ? Number(h.center[1]) : 0,
        ],
        style: {
          color: String(h.style?.color || '#00FFFF').replace(/[^#a-f0-9]/gi, ''),
          weight: isFinite(h.style?.weight) ? Number(h.style.weight) : 1.5,
          opacity: isFinite(h.style?.opacity) ? Number(h.style.opacity) : 0.9,
          fillColor: String(h.style?.fillColor || '#00FFFF').replace(/[^#a-f0-9]/gi, ''),
          fillOpacity: isFinite(h.style?.fillOpacity) ? Number(h.style.fillOpacity) : 0.35,
        },
      })),
    [hexagons]
  );

  // Safe JSON serialization escaping HTML tag delimiters to prevent script breakout
  const safeStringify = (data: unknown) =>
    JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e');

  const pushLayersUpdate = () => {
    if (!webViewRef.current) return;
    const jsCode = `
      if (typeof window.updateLayers === 'function') {
        window.updateLayers(${safeStringify(sanitizedHexagons)}, ${safeStringify(
      sanitizedMarkers
    )}, ${h3MaskEnabled ? 'true' : 'false'});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(jsCode);
  };

  const pushUserLocation = () => {
    if (!webViewRef.current || !userLocation) return;
    const lat = isFinite(userLocation.lat) ? Number(userLocation.lat) : 0;
    const lng = isFinite(userLocation.lng) ? Number(userLocation.lng) : 0;
    const heading = isFinite(userLocation.heading) ? Number(userLocation.heading) % 360 : 0;
    const jsCode = `
      if (typeof window.updateUserLocation === 'function') {
        window.updateUserLocation(${lat}, ${lng}, ${heading});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(jsCode);
  };

  // Base HTML is stable and memoized — never reloads on layer updates or mask toggles
  const mapHtml = useMemo(
    () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: #0A1128; }
        #map { height: 100%; width: 100%; background: #0A1128; }
        .user-marker {
          background: #00FFFF;
          border: 2px solid #6495ED;
          border-radius: 50%;
          width: 14px;
          height: 14px;
          box-shadow: 0 0 8px rgba(0, 255, 255, 0.9);
        }
        .user-direction {
          background: #00FFFF;
          width: 2px;
          height: 12px;
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
        }
        .hex-badge {
          color: #00FFFF;
          font-family: monospace;
          font-size: 11px;
          font-weight: bold;
          text-align: center;
          line-height: 20px;
          text-shadow: 0 0 4px #0A1128, 0 0 8px #0A1128;
          pointer-events: none;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        const map = L.map('map', {
          zoomControl: false,
          attributionControl: false
        }).setView([${isFinite(initialLat) ? Number(initialLat) : 0}, ${
      isFinite(initialLng) ? Number(initialLng) : 0
    }], 14);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);
        
        setTimeout(() => {
          const tileLayer = document.querySelector('.leaflet-layer');
          if (tileLayer) {
            tileLayer.style.filter = 'invert(100%) hue-rotate(180deg) brightness(88%) contrast(88%) saturate(0.6)';
          }
        }, 100);

        function getMarkerStyle(status) {
          if (status === 'denied') {
            return { radius: 7, fillColor: 'transparent', color: '#FF5555', weight: 2, opacity: 1, fillOpacity: 0 };
          }
          if (status === 'awaiting_verification') {
            return { radius: 7, fillColor: 'transparent', color: '#00FFFF', weight: 2, opacity: 1, fillOpacity: 0 };
          }
          if (status === 'verified' || status === 'synced') {
            return { radius: 7, fillColor: '#00FFFF', color: '#00FFFF', weight: 1, opacity: 1, fillOpacity: 0.9 };
          }
          return { radius: 7, fillColor: 'transparent', color: '#00FFFF', weight: 2, opacity: 0.65, fillOpacity: 0 };
        }

        const activeLayers = [];
        let userMarker = null;

        function renderHexagons(hexList) {
          hexList.forEach(hex => {
            if (!hex.boundary || hex.boundary.length === 0) return;
            const polygon = L.polygon(hex.boundary, hex.style).addTo(map);
            polygon.on('click', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hexPress', h3Index: hex.h3Index, count: hex.count }));
            });
            activeLayers.push(polygon);

            const badgeIcon = L.divIcon({
              className: 'h3-hex-badge-container',
              html: '<div class="hex-badge">' + (typeof hex.count === 'number' ? hex.count : '') + '</div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            const badge = L.marker(hex.center, { icon: badgeIcon, interactive: false }).addTo(map);
            activeLayers.push(badge);
          });
        }

        function renderMarkers(markerList) {
          markerList.forEach(marker => {
            const circle = L.circleMarker([marker.lat, marker.lng], getMarkerStyle(marker.status)).addTo(map);
            circle.on('click', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', id: marker.id }));
            });
            activeLayers.push(circle);
          });
        }

        function clearDataLayers() {
          while (activeLayers.length > 0) {
            const layer = activeLayers.pop();
            map.removeLayer(layer);
          }
        }

        // Privacy Guarantee: when maskEnabled is true, never fall back to raw pins!
        window.updateLayers = function(newHexagons, newMarkers, maskEnabled) {
          clearDataLayers();
          if (maskEnabled) {
            if (newHexagons && newHexagons.length > 0) {
              renderHexagons(newHexagons);
            }
          } else {
            renderMarkers(newMarkers || []);
          }
        };

        window.updateUserLocation = function(lat, lng, heading) {
          if (userMarker) map.removeLayer(userMarker);
          const userIcon = L.divIcon({
            className: 'user-marker-container',
            html: '<div class="user-marker" style="transform: rotate(' + heading + 'deg);"><div class="user-direction"></div></div>',
            iconSize: [14, 26],
            iconAnchor: [7, 13]
          });
          userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
        };

        window.setCenter = function(lat, lng, zoom) {
          map.setView([lat, lng], zoom);
        };

        map.on('moveend', function() {
          const c = map.getCenter();
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'centerChange', lat: c.lat, lng: c.lng }));
          }
        });

        // Notify React Native that Leaflet map is ready to receive dynamic layers
        if (window.ReactNativeWebView) {
          const c = map.getCenter();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady', lat: c.lat, lng: c.lng }));
        }
      </script>
    </body>
    </html>
  `,
    [initialLat, initialLng]
  );

  // Dynamically update layers when hexagons, markers, or mask mode change (without recreating map)
  useEffect(() => {
    if (!isMapReadyRef.current) return;
    const payloadKey = `${JSON.stringify(sanitizedHexagons)}|${JSON.stringify(
      sanitizedMarkers
    )}|${h3MaskEnabled}`;
    if (payloadKey === lastLayersPayloadRef.current) return;
    lastLayersPayloadRef.current = payloadKey;
    pushLayersUpdate();
  }, [sanitizedHexagons, sanitizedMarkers, h3MaskEnabled]);

  // Update user location dynamically
  useEffect(() => {
    if (!isMapReadyRef.current) return;
    pushUserLocation();
  }, [userLocation]);

  return (
    <View style={styles.container} testID="osm-map-view">
      <WebView
        ref={webViewRef as any}
        source={{ html: mapHtml }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="always"
        onMessage={(event: any) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'mapReady') {
              isMapReadyRef.current = true;
              if (onCenterChange && typeof data.lat === 'number' && typeof data.lng === 'number') {
                onCenterChange({ lat: data.lat, lng: data.lng });
              }
              pushLayersUpdate();
              pushUserLocation();
            } else if (data.type === 'centerChange' && onCenterChange) {
              onCenterChange({ lat: data.lat, lng: data.lng });
            } else if (data.type === 'markerPress' && onMarkerPress) {
              onMarkerPress(data.id);
            } else if (data.type === 'hexPress' && onHexagonPress) {
              onHexagonPress(data.h3Index);
            }
          } catch (e) {
            console.error('Failed to parse WebView message:', e);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
});
