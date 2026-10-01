import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import './map.css';

// Simple test map with just a few markers
const SimpleMapTest = () => {
  // Hardcoded test ports near major cities
  const testPorts = [
    { name: 'New York', lat: 40.7128, lng: -74.006 },
    { name: 'London', lat: 51.5074, lng: -0.1278 },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
    { name: 'Sydney', lat: -33.8688, lng: 151.2093 }
  ];

  return (
    <div style={{ height: '500px', width: '100%', background: '#f0f0f0' }}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {testPorts.map((port, index) => (
          <CircleMarker
            key={index}
            center={[port.lat, port.lng]}
            radius={8}
            color="#ff0000"
            fillColor="#f03"
            fillOpacity={0.8}
          >
            <Tooltip>{port.name}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

export default SimpleMapTest;