import goodsIcons from './assets/goods_icons.json';

// One glyph per HS chapter so a trade row hints at the kind of goods it is.
// Chapters that share a general family (textiles, base metals, apparel) share
// a glyph; the shortened goods name next to it carries the specifics.
const CHAPTER_ICONS = {
  // Live animals and food
  '01': 'cow',
  '02': 'food-steak',
  '03': 'fish',
  '04': 'cheese',
  '05': 'paw',
  '06': 'flower',
  '07': 'carrot',
  '08': 'food-apple',
  '09': 'coffee',
  '10': 'barley',
  '11': 'bread-slice',
  '12': 'seed',
  '13': 'sprout',
  '15': 'oil',
  '16': 'food-drumstick',
  '17': 'spoon-sugar',
  '18': 'cookie',
  '19': 'pasta',
  '20': 'pot-steam',
  '21': 'food',
  '22': 'bottle-soda',
  '23': 'sack',
  '24': 'cigar',

  // Minerals, fuels and energy
  '25': 'wall',
  '26': 'pickaxe',
  '27': 'barrel',

  // Chemicals, plastics and pharmaceuticals
  '28': 'beaker',
  '29': 'test-tube',
  '30': 'pill',
  '31': 'grass',
  '33': 'lipstick',
  '37': 'camera',
  '38': 'molecule',
  '39': 'recycle',
  '40': 'tire',

  // Wood, paper, leather
  '42': 'bag-personal',
  '44': 'pine-tree',
  '47': 'pine-tree-variant',
  '48': 'file-document-outline',
  '49': 'book',

  // Textiles, apparel and footwear
  '51': 'sheep',
  '52': 'texture-box',
  '54': 'texture-box',
  '55': 'texture-box',
  '56': 'texture-box',
  '57': 'rug',
  '60': 'texture-box',
  '61': 'tshirt-crew',
  '62': 'tshirt-crew',
  '63': 'tshirt-crew',
  '64': 'shoe-sneaker',
  '65': 'hat-fedora',
  '67': 'feather',

  // Stone, ceramics and precious materials
  '68': 'account-hard-hat',
  '69': 'pot',
  '71': 'diamond',

  // Base metals
  '72': 'anvil',
  '73': 'pipe',
  '74': 'power-plug',
  '75': 'battery-charging',
  '76': 'fence',
  '79': 'account-hard-hat',
  '80': 'package',
  '81': 'shovel',
  '82': 'hammer',
  '83': 'hammer-screwdriver',

  // Machinery and transport
  '84': 'cog',
  '85': 'chip',
  '86': 'train-car',
  '87': 'car',
  '88': 'airplane',
  '89': 'ferry',

  // Instruments, arms, furniture and leisure
  '90': 'microscope',
  '91': 'watch',
  '93': 'pistol',
  '94': 'sofa',
  '95': 'gamepad-variant',
  '97': 'palette',
};

const DEFAULT_ICON = 'package';

export function getGoodsIconName(productCode) {
  const chapter = String(productCode ?? '')
    .padStart(2, '0')
    .slice(0, 2);

  return CHAPTER_ICONS[chapter] || DEFAULT_ICON;
}

export default function GoodsIcon({ className, productCode }) {
  const name = getGoodsIconName(productCode);
  const path = goodsIcons.paths[name] || goodsIcons.paths[DEFAULT_ICON];

  if (!path) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox={goodsIcons.viewBox}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
