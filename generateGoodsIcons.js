const fs = require('fs');

// Icon that represents each HS chapter in the port trade panel.
// Source: Material Design Icons (Apache-2.0) served by the Iconify API.
// Run with `node generateGoodsIcons.js` to refresh ./src/assets/goods_icons.json.
const API_URL = 'https://api.iconify.design/mdi.json';

const ICON_NAMES = [
  // Food and agriculture
  'cow',
  'food-steak',
  'fish',
  'cheese',
  'paw',
  'flower',
  'carrot',
  'food-apple',
  'coffee',
  'barley',
  'bread-slice',
  'seed',
  'sprout',
  'oil',
  'food-drumstick',
  'spoon-sugar',
  'cookie',
  'pasta',
  'pot-steam',
  'food',
  'bottle-soda',
  'sack',
  'cigar',
  'grass',
  // Minerals, fuels and energy
  'wall',
  'pickaxe',
  'barrel',
  // Chemicals, plastics and pharmaceuticals
  'beaker',
  'test-tube',
  'pill',
  'molecule',
  'lipstick',
  'camera',
  'recycle',
  'tire',
  // Wood, paper and leather
  'bag-personal',
  'pine-tree',
  'pine-tree-variant',
  'file-document-outline',
  'book',
  // Textiles, apparel and footwear
  'sheep',
  'texture-box',
  'rug',
  'tshirt-crew',
  'shoe-sneaker',
  'hat-fedora',
  'feather',
  // Stone, ceramics and precious materials
  'account-hard-hat',
  'pot',
  'diamond',
  // Metals
  'anvil',
  'pipe',
  'power-plug',
  'battery-charging',
  'fence',
  'package',
  'shovel',
  'hammer',
  'hammer-screwdriver',
  // Machinery and transport
  'cog',
  'chip',
  'train-car',
  'car',
  'airplane',
  'ferry',
  // Instruments, arms, furniture and leisure
  'microscope',
  'watch',
  'pistol',
  'sofa',
  'gamepad-variant',
  'palette',
];

const OUTPUT_PATH = './src/assets/goods_icons.json';

async function main() {
  const response = await fetch(`${API_URL}?icons=${ICON_NAMES.join(',')}`);

  if (!response.ok) {
    throw new Error(`Icon request failed: ${response.status}`);
  }

  const payload = await response.json();
  const notFound = payload.not_found || [];

  if (notFound.length > 0) {
    throw new Error(`Unknown icons: ${notFound.join(', ')}`);
  }

  const paths = {};

  ICON_NAMES.forEach((name) => {
    const icon = payload.icons[name];
    const match = icon && icon.body.match(/<path[^>]*\sd="([^"]+)"/);

    if (!match) {
      throw new Error(`Unsupported icon markup for "${name}": ${icon && icon.body}`);
    }

    paths[name] = match[1];
  });

  const output = {
    source: 'https://iconify.design (Material Design Icons, Apache-2.0)',
    viewBox: `0 0 ${payload.width} ${payload.height}`,
    paths,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${ICON_NAMES.length} icons to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
