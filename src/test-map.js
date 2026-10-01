// Simple test to verify port data and Leaflet integration
import React from 'react';
import { render } from 'react-dom';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import ports from './src/assets/ports.json';

console.log('Testing with', ports.length, 'ports');

// Process ports exactly as in map.js
const portData = ports
  .map((port, index) => {
    const latitude = Number.parseFloat(String(port.LATITUDE).replace(',', '.'));
    const longitude = Number.parseFloat(String(port.LONGITUDE).replace(',', '.'));

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      ...port,
      id: `${port.REGION_NO}-${port.PORT_NAME}-${index}`,
      position: [latitude, longitude],
    };
  })
  .filter(Boolean);

console.log('Processed', portData.length, 'valid ports');

if (portData.length > 0) {
  console.log('First port:', portData[0].PORT_NAME, 'at', portData[0].position);
  console.log('Last port:', portData[portData.length-1].PORT_NAME, 'at', portData[portData.length-1].position);
}

// Create a simple map component for testing
const TestMap = () => (
  <MapContainer
    center={[20, 0]}
    zoom={2}
    style={{height: '500px', width: '100%'}}
  >
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
    {portData.slice(0, 10).map(port => (
      <CircleMarker
        key={port.id}
        center={port.position}
        radius={5}
        color="#ff0000"
        fillColor="#f03"
        fillOpacity={0.8}
      >
        <Tooltip>{port.PORT_NAME}</Tooltip>
      </CircleMarker>
    ))}
  </MapContainer>
);

// For testing purposes, export the component
export default TestMap;