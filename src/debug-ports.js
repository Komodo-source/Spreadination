// Debug script to verify port data processing
const ports = require('../src/assets/ports.json');

console.log('=== PORT DATA DEBUG ===');
console.log('Total raw ports:', ports.length);

// Show first few raw entries
console.log('\nFirst 3 raw ports:');
ports.slice(0, 3).forEach((p, i) => {
  console.log(`${i+1}. ${p.PORT_NAME || 'NO NAME'} - Lat: ${p.LATITUDE}, Lng: ${p.LONGITUDE}`);
});

// Process as in map.js
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

console.log('\n=== PROCESSED PORT DATA ===');
console.log('Total valid ports:', portData.length);

// Show first few processed
console.log('\nFirst 5 processed ports:');
portData.slice(0, 5).forEach((p, i) => {
  console.log(`${i+1}. ${p.PORT_NAME} - [${p.position[0]}, ${p.position[1]}] (ID: ${p.id})`);
});

// Check for specific ports we know should exist
const testPorts = ['SHAKOTAN', 'MOMBETSU KO', 'CHARLOTTETOWN', 'LOS ANGELES', 'LONDON'];
console.log('\n=== SPECIFIC PORT LOOKUP ===');
testPorts.forEach(portName => {
  const found = portData.find(p => p.PORT_NAME === portName);
  if (found) {
    console.log(`✓ ${portName}: [${found.position[0]}, ${found.position[1]}] (ID: ${found.id})`);
  } else {
    console.log(`✗ ${portName}: NOT FOUND`);
  }
});

// Validate coordinate ranges
console.log('\n=== COORDINATE VALIDATION ===');
const invalidLats = portData.filter(p => Math.abs(p.position[0]) > 90);
const invalidLngs = portData.filter(p => Math.abs(p.position[1]) > 180);
console.log('Ports with invalid latitude (>90 or <-90):', invalidLats.length);
console.log('Ports with invalid longitude (>180 or <-180):', invalidLngs.length);

if (invalidLats.length > 0) {
  console.log('Invalid latitude examples:', invalidLats.slice(0, 3).map(p => `${p.PORT_NAME}: ${p.position[0]}`));
}
if (invalidLngs.length > 0) {
  console.log('Invalid longitude examples:', invalidLngs.slice(0, 3).map(p => `${p.PORT_NAME}: ${p.position[1]}`));
}

// Show geographic distribution
console.log('\n=== GEOGRAPHIC DISTRIBUTION ===');
const regions = {};
portData.forEach(p => {
  const region = Math.floor(p.position[0] / 10) * 10; // Group by 10-degree latitude bands
  if (!regions[region]) regions[region] = 0;
  regions[region]++;
});

console.log('Ports by latitude region (10° bands):');
Object.keys(regions)
  .sort((a, b) => parseFloat(a) - parseFloat(b))
  .forEach(region => {
    console.log(`  ${region}° to ${parseFloat(region)+10}°: ${regions[region]} ports`);
  });

// Test the exact filtering logic
console.log('\n=== FILTERING LOGIC TEST ===');
const nullCount = ports.reduce((count, port) => {
  const latitude = Number.parseFloat(String(port.LATITUDE).replace(',', '.'));
  const longitude = Number.parseFloat(String(port.LONGITUDE).replace(',', '.'));
  return count + (!Number.isFinite(latitude) || !Number.isFinite(longitude) ? 1 : 0);
}, 0);
console.log('Ports filtered out due to invalid coordinates:', nullCount);

console.log('\n=== DEBUG COMPLETE ===');