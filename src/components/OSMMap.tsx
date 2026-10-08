import React, { useRef, useEffect } from 'react';
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
}

export default function OSMMap({
  initialLat,
  initialLng,
  markers = [],
  hexagons = [],
  h3MaskEnabled = true,
  userLocation,
  onMarkerPress,
  onHexagonPress,
}: OSMMapProps) {
  const webViewRef = useRef<WebView>(null);

  // Sanitized marker data — only numeric lat/lng and alphanumeric ID
  const sanitizedMarkers = markers.map((m) => ({
    id: String(m.id).replace(/[^a-zA-Z0-9_-]/g, ''),
    lat: isFinite(m.lat) ? Number(m.lat) : 0,
    lng: isFinite(m.lng) ? Number(m.lng) : 0,
    status: ['pending', 'awaiting_verification', 'verified', 'denied', 'archived'].includes(
      m.status ?? ''
    )
      ? m.status
      : 'pending',
  }));

  // Sanitized hexagon cell data
  const sanitizedHexagons = hexagons.map((h) => ({
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
  }));

  const mapHtml = `
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
        }).setView([${initialLat}, ${initialLng}], 14);
        
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

        const initialHexagons = ${JSON.stringify(sanitizedHexagons)};
        const initialMarkers = ${JSON.stringify(sanitizedMarkers)};
        let isHexMaskActive = ${h3MaskEnabled ? 'true' : 'false'};
        const activeLayers = [];

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
              html: '<div class="hex-badge">' + hex.count + '</div>',
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

        if (isHexMaskActive && initialHexagons.length > 0) {
          renderHexagons(initialHexagons);
        } else {
          renderMarkers(initialMarkers);
        }

        let userMarker = null;
        const userLocationData = ${JSON.stringify(
          userLocation
            ? {
                lat: isFinite(userLocation.lat) ? Number(userLocation.lat) : 0,
                lng: isFinite(userLocation.lng) ? Number(userLocation.lng) : 0,
                heading: isFinite(userLocation.heading) ? Number(userLocation.heading) % 360 : 0,
              }
            : null
        )};

        if (userLocationData) {
          const userIcon = L.divIcon({
            className: 'user-marker-container',
            html: '<div class="user-marker" style="transform: rotate(' + userLocationData.heading + 'deg);"><div class="user-direction"></div></div>',
            iconSize: [14, 26],
            iconAnchor: [7, 13]
          });
          userMarker = L.marker([userLocationData.lat, userLocationData.lng], { icon: userIcon }).addTo(map);
          map.setView([userLocationData.lat, userLocationData.lng], 15);
        }

        window.updateLayers = function(newHexagons, newMarkers, maskEnabled) {
          clearDataLayers();
          isHexMaskActive = maskEnabled;
          if (maskEnabled && newHexagons && newHexagons.length > 0) {
            renderHexagons(newHexagons);
          } else {
            renderMarkers(newMarkers || []);
          }
        };

        window.setCenter = function(lat, lng, zoom) {
          map.setView([lat, lng], zoom);
        };
      </script>
    </body>
    </html>
  `;

  // Dynamically update layers when hexagons, markers, or mask mode changes
  useEffect(() => {
    if (webViewRef.current) {
      const jsCode = `
        if (typeof window.updateLayers === 'function') {
          window.updateLayers(${JSON.stringify(sanitizedHexagons)}, ${JSON.stringify(
        sanitizedMarkers
      )}, ${h3MaskEnabled ? 'true' : 'false'});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(jsCode);
    }
  }, [hexagons, markers, h3MaskEnabled]);

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
            if (data.type === 'markerPress' && onMarkerPress) {
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
