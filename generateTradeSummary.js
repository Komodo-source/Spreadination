const fs = require('fs');
const readline = require('readline');

const { shortenGoodsName } = require('./goodsNames');

// Load country codes: numeric -> ISO2
const countryCodes = JSON.parse(fs.readFileSync('./src/assets/country_codes_V202601.json', 'utf8'));
const countryCodeToIso2 = {};
countryCodes.forEach(c => {
  countryCodeToIso2[c.country_code] = c.country_iso2;
});

// Load product codes: code -> description
const productCodes = JSON.parse(fs.readFileSync('./src/assets/product_codes_HS22_V202601.json', 'utf8'));
const productCodeToDescription = {};
productCodes.forEach(p => {
  productCodeToDescription[p.code] = p.description;
});

// Initialize data structures
// exportsByCountry: { exporterIso2: { productCode: { value: 0, quantity: 0 } } }
// importsByCountry: { importerIso2: { productCode: { value: 0, quantity: 0 } } }
const exportsByCountry = {};
const importsByCountry = {};

console.log('Starting to process BACI data...');

const stream = fs.createReadStream('./src/assets/BACI_HS22_Y2024_V202601.json', {encoding: 'utf16le'});
const rl = readline.createInterface({input: stream});

let lineCount = 0;
let processedCount = 0;

rl.on('line', (line) => {
  lineCount++;
  // Skip the first line '[' and last line ']' and empty lines
  if (line.trim() === '[' || line.trim() === ']' || line.trim() === '') {
    return;
  }
  // Remove trailing comma if present
  if (line.endsWith(',')) {
    line = line.slice(0, -1);
  }
  try {
    const record = JSON.parse(line);
    const exporterIso2 = countryCodeToIso2[record.i];
    const importerIso2 = countryCodeToIso2[record.j];
    const productCode = record.k;
    const value = parseFloat(record.v);
    const quantity = parseFloat(record.q);

    // Skip if we don't have the country codes (should not happen)
    if (!exporterIso2 || !importerIso2) {
      return;
    }

    // Initialize country entries if not present
    if (!exportsByCountry[exporterIso2]) {
      exportsByCountry[exporterIso2] = {};
    }
    if (!importsByCountry[importerIso2]) {
      importsByCountry[importerIso2] = {};
    }

    // Initialize product entry if not present
    if (!exportsByCountry[exporterIso2][productCode]) {
      exportsByCountry[exporterIso2][productCode] = { value: 0, quantity: 0 };
    }
    if (!importsByCountry[importerIso2][productCode]) {
      importsByCountry[importerIso2][productCode] = { value: 0, quantity: 0 };
    }

    // Accumulate
    exportsByCountry[exporterIso2][productCode].value += value;
    exportsByCountry[exporterIso2][productCode].quantity += quantity;
    importsByCountry[importerIso2][productCode].value += value;
    importsByCountry[importerIso2][productCode].quantity += quantity;

    processedCount++;
    if (processedCount % 100000 === 0) {
      console.log(`Processed ${processedCount} records...`);
    }
  } catch (e) {
    // Ignore malformed lines
  }
});

rl.on('close', () => {
  console.log(`Finished reading. Processed ${processedCount} records out of ${lineCount} lines.`);

  // Now, for each country, compute top 5 exports and imports by value
  const result = {};

  // Process exports
  Object.keys(exportsByCountry).forEach(country => {
    const products = exportsByCountry[country];
    const productArray = Object.keys(products).map(productCode => ({
      productCode,
      description: shortenGoodsName(productCode, productCodeToDescription[productCode] || 'Unknown product'),
      value: products[productCode].value,
      quantity: products[productCode].quantity
    }));
    // Sort by value descending
    productArray.sort((a, b) => b.value - a.value);
    // Take top 5
    const top5 = productArray.slice(0, 5);
    if (!result[country]) {
      result[country] = { exports: [], imports: [] };
    }
    result[country].exports = top5;
  });

  // Process imports
  Object.keys(importsByCountry).forEach(country => {
    const products = importsByCountry[country];
    const productArray = Object.keys(products).map(productCode => ({
      productCode,
      description: shortenGoodsName(productCode, productCodeToDescription[productCode] || 'Unknown product'),
      value: products[productCode].value,
      quantity: products[productCode].quantity
    }));
    productArray.sort((a, b) => b.value - a.value);
    const top5 = productArray.slice(0, 5);
    if (!result[country]) {
      result[country] = { exports: [], imports: [] };
    }
    result[country].imports = top5;
  });

  // Write the result to a file
  fs.writeFileSync('./src/assets/trade_summary.json', JSON.stringify(result, null, 2));
  console.log('Trade summary written to ./src/assets/trade_summary.json');
});