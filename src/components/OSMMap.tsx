import { WebView } from 'react-native-webview';
import { StyleSheet, View } from 'react-native';

interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  status?: string;
}

interface OSMMapProps {
  initialLat: number;
  initialLng: number;
  markers?: MarkerData[];
  userLocation?: { lat: number; lng: number; heading: number } | null;
  onMarkerPress?: (id: string) => void;
}

export default function OSMMap({ initialLat, initialLng, markers = [], userLocation, onMarkerPress }: OSMMapProps) {
  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body { margin: 0; padding: 0; height: 100%; width: 100%; }
        #map { height: 100%; width: 100%; }
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
        
        // Apply dark blueprint filter to map tiles
        setTimeout(() => {
          const tileLayer = document.querySelector('.leaflet-layer');
          if (tileLayer) {
            tileLayer.style.filter = 'invert(100%) hue-rotate(180deg) brightness(88%) contrast(88%) saturate(0.6)';
          }
        }, 100);

        // Returns Leaflet circleMarker options based on node status
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
          // Default: ghost node (pending) — hollow cyan
          return { radius: 7, fillColor: 'transparent', color: '#00FFFF', weight: 2, opacity: 0.65, fillOpacity: 0 };
        }
        
        const markersData = ${JSON.stringify(markers)};
        markersData.forEach(marker => {
          const circle = L.circleMarker([marker.lat, marker.lng], getMarkerStyle(marker.status)).addTo(map);
          circle.on('click', () => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', id: marker.id }));
          });
        });
        
        let userMarker = null;
        const userLocationData = ${JSON.stringify(userLocation)};
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
        
        window.updateMarkers = function(newMarkers) {
          map.eachLayer(layer => {
            if (layer instanceof L.CircleMarker) map.removeLayer(layer);
          });
          newMarkers.forEach(marker => {
            const circle = L.circleMarker([marker.lat, marker.lng], getMarkerStyle(marker.status)).addTo(map);
            circle.on('click', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', id: marker.id }));
            });
          });
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
          map.setView([lat, lng], 15);
        };
        
        window.setCenter = function(lat, lng, zoom) {
          map.setView([lat, lng], zoom);
        };
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: mapHtml }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="always"
        onMessage={(event) => {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === 'markerPress' && onMarkerPress) {
            onMarkerPress(data.id);
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
