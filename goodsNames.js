// Short display names for the products that appear in trade_summary.json.
//
// The raw BACI/HS wording spells out the full customs description, which is far
// too long for the port panel ("Petroleum oils and oils from bituminous
// minerals, not crude: preparations n.e.c. containing by weight 70% or more of
// petroleum oils ..."). Each entry keeps only what identifies the goods: the
// commodity itself plus the qualifier traders actually distinguish (crude vs
// refined, fresh vs frozen, engine size, purity, packed weight).
//
// generateTradeSummary.js applies these while building the summary, and
// shortenTradeSummary.js applies them to an already-built summary, so the two
// stay in step.

const GOODS_NAMES = {
  // Live animals
  '010410': 'Live sheep',
  '010611': 'Live primates',
  '010613': 'Live camels',

  // Meat and edible offal
  '020130': 'Fresh beef, boneless',
  '020230': 'Frozen beef, boneless',
  '020312': 'Fresh pork, bone-in',
  '020421': 'Fresh mutton, carcasses',
  '020442': 'Frozen mutton, bone-in',
  '020714': 'Frozen chicken cuts',

  // Fish, crustaceans and molluscs
  '030111': 'Live ornamental fish',
  '030214': 'Fresh Atlantic salmon',
  '030232': 'Fresh yellowfin tuna',
  '030234': 'Fresh bigeye tuna',
  '030319': 'Frozen salmon',
  '030331': 'Frozen halibut',
  '030341': 'Frozen albacore tuna',
  '030342': 'Frozen yellowfin tuna',
  '030343': 'Frozen skipjack tuna',
  '030344': 'Frozen bigeye tuna',
  '030349': 'Frozen tuna, other',
  '030355': 'Frozen jack mackerel',
  '030359': 'Frozen fish, other',
  '030363': 'Frozen cod',
  '030366': 'Frozen hake',
  '030383': 'Frozen toothfish',
  '030389': 'Frozen fish, n.e.c.',
  '030444': 'Fresh fillets, cod family',
  '030449': 'Fresh fish fillets, other',
  '030471': 'Frozen cod fillets',
  '030485': 'Frozen toothfish fillets',
  '030487': 'Frozen tuna fillets',
  '030489': 'Frozen fish fillets, other',
  '030572': 'Fish offal (heads, tails, maws)',
  '030611': 'Frozen rock lobster',
  '030616': 'Frozen cold-water shrimp',
  '030617': 'Frozen shrimp & prawns',
  '030632': 'Fresh lobsters',
  '030633': 'Fresh crabs',
  '030743': 'Frozen squid & cuttlefish',
  '030752': 'Frozen octopus',
  '030792': 'Frozen shellfish, other',
  '030811': 'Live sea cucumbers',

  // Dairy produce
  '040120': 'Fresh milk & cream',
  '040221': 'Milk powder',
  '040510': 'Butter',
  '040690': 'Cheese, other',

  // Animal products n.e.c.
  '051191': 'Inedible fish waste',

  // Live plants and cut flowers
  '060290': 'Live plants, other',
  '060311': 'Fresh cut roses',

  // Vegetables
  '070310': 'Onions & shallots, fresh',
  '071331': 'Dried mung & black gram',
  '071333': 'Dried kidney beans',
  '071340': 'Dried lentils',
  '071360': 'Dried pigeon peas',
  '071410': 'Cassava',
  '071430': 'Yams',
  '071440': 'Taro',

  // Fruit and nuts
  '080122': 'Brazil nuts, shelled',
  '080131': 'Cashew nuts, in shell',
  '080132': 'Cashew nuts, shelled',
  '080390': 'Bananas',
  '080410': 'Dates',
  '080420': 'Figs',
  '080430': 'Pineapples',
  '080440': 'Avocados',
  '080510': 'Oranges',
  '080610': 'Fresh grapes',
  '080620': 'Dried grapes (raisins)',
  '080929': 'Fresh cherries',
  '081040': 'Fresh berries (vaccinium)',
  '081050': 'Fresh kiwifruit',
  '081190': 'Frozen fruit & nuts',

  // Coffee, tea, maté and spices
  '090111': 'Unroasted coffee',
  '090112': 'Unroasted decaf coffee',
  '090230': 'Black tea, packs ≤3kg',
  '090240': 'Black tea, packs >3kg',
  '090510': 'Vanilla',
  '090710': 'Cloves',
  '090811': 'Nutmeg',
  '090831': 'Cardamoms',
  '091099': 'Spices, other',

  // Cereals
  '100119': 'Durum wheat',
  '100199': 'Wheat (non-durum)',
  '100590': 'Maize (corn)',
  '100610': 'Paddy rice',
  '100620': 'Brown rice',
  '100630': 'Milled rice',
  '100640': 'Broken rice',
  '100790': 'Grain sorghum',

  // Milling products
  '110100': 'Wheat flour',
  '110220': 'Maize flour',
  '110313': 'Maize groats & meal',

  // Oil seeds and oleaginous fruits
  '120190': 'Soya beans',
  '120242': 'Groundnuts, shelled',
  '120510': 'Rapeseed (low erucic)',
  '120600': 'Sunflower seeds',
  '120740': 'Sesame seeds',
  '120799': 'Oil seeds, other',
  '120999': 'Sowing seeds, other',
  '121190': 'Plants for perfumery & pharmacy',

  // Gums and resins
  '130120': 'Gum arabic',
  '130190': 'Natural gums & resins, other',

  // Animal and vegetable fats and oils
  '150420': 'Fish oils & fats',
  '150710': 'Crude soya-bean oil',
  '150790': 'Refined soya-bean oil',
  '150920': 'Extra virgin olive oil',
  '150930': 'Virgin olive oil',
  '151110': 'Crude palm oil',
  '151190': 'Refined palm oil',
  '151211': 'Crude sunflower oil',
  '151219': 'Refined sunflower oil',
  '151311': 'Crude coconut oil',
  '151411': 'Crude rapeseed oil',

  // Prepared meat, fish and crustaceans
  '160250': 'Prepared beef',
  '160414': 'Prepared & canned tuna',
  '160415': 'Prepared mackerel',
  '160419': 'Prepared fish, other',
  '160529': 'Canned shrimp & prawns',

  // Sugars and sugar confectionery
  '170113': 'Raw cane sugar (note 2)',
  '170114': 'Raw cane sugar',
  '170199': 'Refined sugar (sucrose)',

  // Cocoa and cocoa preparations
  '180100': 'Cocoa beans',
  '180310': 'Cocoa paste',
  '180400': 'Cocoa butter',

  // Preparations of cereals, flour and starch
  '190190': 'Malt & milk food preparations',
  '190219': 'Uncooked pasta (egg-free)',
  '190230': 'Prepared pasta',
  '190590': "Bakers' wares",

  // Preparations of vegetables, fruit and nuts
  '200290': 'Prepared tomatoes',
  '200990': 'Mixed fruit & vegetable juice',

  // Miscellaneous edible preparations
  '210690': 'Food preparations, n.e.c.',

  // Beverages, spirits and vinegar
  '220110': 'Mineral & aerated water',
  '220190': 'Water & ice, other',
  '220210': 'Sweetened & flavoured water',
  '220299': 'Non-alcoholic beverages, other',
  '220300': 'Malt beer',
  '220421': 'Still wine, ≤2L',
  '220840': 'Rum & cane spirits',
  '220860': 'Vodka',
  '220890': 'Spirits & liqueurs, other',

  // Residues and waste from the food industries; animal feed
  '230120': 'Fish meal & pellets',
  '230400': 'Soya-bean oil-cake',
  '230910': 'Pet food, retail',
  '230990': 'Pet food, bulk',

  // Tobacco and manufactured tobacco substitutes
  '240110': 'Unstemmed tobacco',
  '240120': 'Stemmed tobacco',
  '240210': 'Cigars & cigarillos',
  '240220': 'Cigarettes',
  '240399': 'Tobacco, other',
  '240411': 'Heated tobacco products',

  // Salt, stone, cement and similar mineral earths
  '250100': 'Salt & sea water',
  '250510': 'Silica & quartz sands',
  '251010': 'Unground phosphate rock',
  '251612': 'Granite blocks & slabs',
  '251810': 'Dolomite, crude blocks',
  '252310': 'Cement clinkers',
  '252329': 'Portland cement (grey)',
  '253090': 'Mineral substances, other',

  // Ores, slag and ash
  '260111': 'Iron ore, non-agglomerated',
  '260112': 'Iron ore, agglomerated',
  '260200': 'Manganese ore',
  '260300': 'Copper ore',
  '260400': 'Nickel ore',
  '260600': 'Aluminium ore (bauxite)',
  '260700': 'Lead ore',
  '260800': 'Zinc ore',
  '260900': 'Tin ore',
  '261000': 'Chromium ore',
  '261100': 'Tungsten ore',
  '261400': 'Titanium ore',
  '261510': 'Zirconium ore',
  '261590': 'Niobium & tantalum ores',
  '261610': 'Silver ore',
  '261690': 'Gold & platinum ores',
  '262099': 'Metal-bearing slag & ash',
  '262110': 'Municipal waste incineration ash',

  // Mineral fuels, oils and energy
  '270112': 'Bituminous coal',
  '270119': 'Coal, other',
  '270300': 'Peat',
  '270750': 'Aromatic hydrocarbon mixtures',
  '270799': 'Coal-tar distillates, other',
  '270900': 'Crude petroleum oil',
  '271000': 'Refined petroleum oils',
  '271111': 'Liquefied natural gas (LNG)',
  '271112': 'Liquefied propane',
  '271113': 'Liquefied butane',
  '271119': 'Liquefied petroleum gas, other',
  '271121': 'Natural gas, gaseous',
  '271129': 'Gaseous hydrocarbons, other',
  '271311': 'Petroleum coke',
  '271320': 'Petroleum bitumen',
  '271600': 'Electrical energy',

  // Inorganic chemicals
  '280920': 'Phosphoric acid',
  '281410': 'Anhydrous ammonia',
  '281820': 'Aluminium oxide',
  '282751': 'Sodium & potassium bromides',
  '283620': 'Soda ash',
  '283691': 'Lithium carbonate',
  '284410': 'Natural uranium & compounds',
  '284690': 'Rare-earth metal compounds',

  // Organic chemicals
  '290220': 'Benzene',
  '290243': 'Paraxylene',
  '290499': 'Hydrocarbon derivatives, other',
  '290511': 'Methanol',
  '293319': 'Heterocyclics (pyrazole)',
  '293359': 'Heterocyclics (pyrimidine)',
  '293379': 'Lactams, other',
  '293719': 'Polypeptide hormones',

  // Pharmaceutical products
  '300212': 'Antisera & blood fractions',
  '300214': 'Immunological products, mixed',
  '300215': 'Immunological products',
  '300241': 'Vaccines, human medicine',
  '300390': 'Medicaments, not retail',
  '300431': 'Insulin medicaments, retail',
  '300439': 'Hormone & antibiotic medicaments',
  '300490': 'Medicaments, retail',

  // Fertilizers
  '310210': 'Urea fertilizer',
  '310230': 'Ammonium nitrate fertilizer',
  '310390': 'Phosphate fertilizers, other',
  '310420': 'Potash (potassium chloride)',
  '310520': 'NPK fertilizer',
  '310530': 'Diammonium phosphate (DAP)',
  '310559': 'Nitrogen-phosphorus fertilizers, other',

  // Essential oils, cosmetics and toiletries
  '330129': 'Essential oils, other',
  '330210': 'Flavour & fragrance mixtures',
  '330300': 'Perfumes & toilet waters',
  '330491': 'Cosmetic powders',
  '330499': 'Skin care preparations',

  // Photographic goods
  '370790': 'Photographic chemicals',

  // Miscellaneous chemical products
  '381512': 'Precious-metal catalysts',
  '381519': 'Supported catalysts, other',
  '382219': 'Diagnostic & lab reagents',
  '382499': 'Chemical preparations, n.e.c.',

  // Plastics
  '390110': 'Polyethylene (LDPE)',
  '390120': 'Polyethylene (HDPE)',
  '390210': 'Polypropylene',
  '390690': 'Acrylic polymers',
  '390761': 'PET resin',
  '391810': 'PVC floor & wall coverings',
  '391990': 'Self-adhesive plastic film & tape',
  '392330': 'Plastic bottles & flasks',
  '392690': 'Plastic articles, other',

  // Rubber and rubber articles
  '400122': 'Natural rubber (TSNR)',
  '401110': 'Car tyres',
  '401120': 'Bus & lorry tyres',
  '401290': 'Tyres, other',

  // Leather goods and cases
  '420221': 'Leather handbags',
  '420292': 'Bags & cases, other',

  // Wood and articles of wood
  '440290': 'Wood charcoal',
  '440321': 'Pine logs, rough',
  '440349': 'Tropical logs, rough',
  '440399': 'Logs, rough, other',
  '440711': 'Pine sawn timber',
  '440729': 'Tropical sawn timber',
  '440839': 'Tropical veneer sheets',
  '441233': 'Plywood, wood plies',

  // Wood pulp
  '470200': 'Dissolving-grade wood pulp',
  '470321': 'Bleached coniferous pulp',
  '470329': 'Bleached non-coniferous pulp',

  // Paper and paperboard
  '480256': 'Printing & writing paper',
  '481092': 'Coated paperboard, multi-ply',
  '481910': 'Corrugated cartons & boxes',
  '481920': 'Folding cartons & boxes',

  // Printed books, newspapers and other printed matter
  '490199': 'Books & brochures',
  '490700': 'Stamps & securities',

  // Wool and other animal hair
  '510111': 'Greasy shorn wool',

  // Cotton
  '520100': 'Raw cotton',
  '520512': 'Cotton yarn, single',
  '520852': 'Printed cotton fabric',
  '521213': 'Dyed cotton fabric',

  // Man-made filaments
  '540752': 'Dyed polyester fabric',
  '540769': 'Polyester fabric, other',

  // Man-made staple fibres
  '551449': 'Printed synthetic-blend fabric',
  '551614': 'Printed viscose fabric',

  // Wadding, nonwovens, rope and cordage
  '560394': 'Nonwovens, >150g/m²',

  // Carpets and textile floor coverings
  '570110': 'Knotted wool carpets',

  // Knitted or crocheted fabrics
  '600410': 'Elastomeric knit fabric',
  '600622': 'Dyed cotton knit fabric',

  // Articles of apparel, knitted or crocheted
  '610910': 'Cotton T-shirts & vests',
  '610990': 'T-shirts & vests, other',
  '611020': 'Cotton jerseys & pullovers',
  '611030': 'Synthetic jerseys & pullovers',
  '611610': 'Coated knitted gloves',

  // Articles of apparel, not knitted or crocheted
  '620342': "Men's cotton trousers",
  '620449': "Women's dresses, other",
  '620462': "Women's cotton trousers",
  '620520': "Men's cotton shirts",
  '621210': 'Brassieres',

  // Other made-up textile articles
  '630231': 'Cotton bed linen',
  '630420': 'Bed nets & furnishing articles',
  '630900': 'Worn clothing',

  // Footwear
  '640299': 'Footwear, rubber or plastic',
  '640399': 'Leather footwear',
  '640411': 'Sports footwear',
  '640610': 'Footwear uppers',
  '640690': 'Footwear parts, other',

  // Headgear
  '650500': 'Hats & other headgear',

  // Prepared feathers, human hair and wigs
  '670300': 'Dressed human hair',
  '670420': 'Wigs & false hair',

  // Stone, plaster, cement, abrasives
  '680530': 'Coated abrasives',

  // Ceramic products
  '690919': 'Technical ceramic wares',

  // Pearls, stones and precious metals
  '710121': 'Cultured pearls, unworked',
  '710122': 'Cultured pearls, worked',
  '710210': 'Diamonds, unsorted',
  '710221': 'Industrial diamonds, rough',
  '710231': 'Non-industrial diamonds, rough',
  '710239': 'Non-industrial diamonds, worked',
  '710391': 'Rubies, sapphires & emeralds',
  '710691': 'Unwrought silver',
  '710692': 'Semi-manufactured silver',
  '710812': 'Unwrought gold',
  '710813': 'Semi-manufactured gold',
  '711011': 'Unwrought platinum',
  '711021': 'Unwrought palladium',
  '711291': 'Gold waste & scrap',
  '711319': 'Precious metal jewellery',
  '711620': 'Gemstone articles',

  // Iron and steel
  '720221': 'Ferro-silicon',
  '720230': 'Ferro-silico-manganese',
  '720241': 'Ferro-chromium',
  '720260': 'Ferro-nickel',
  '720310': 'Direct-reduced iron (DRI)',
  '720430': 'Tinned steel scrap',
  '720449': 'Ferrous scrap, other',
  '721061': 'Aluminium-zinc coated steel',
  '721070': 'Painted & coated steel',
  '721391': 'Hot-rolled wire rod',
  '721420': 'Steel rebar',
  '721590': 'Steel bars & rods, other',
  '721633': 'Steel H sections',
  '721650': 'Steel angles & sections',

  // Articles of iron or steel
  '730110': 'Steel sheet piling',
  '730429': 'Oil & gas drilling casing',
  '730840': 'Scaffolding & shuttering',
  '730890': 'Steel structures, other',
  '730900': 'Steel tanks & reservoirs',
  '731100': 'Steel gas containers',
  '731512': 'Steel articulated chain',
  '732690': 'Steel articles, other',

  // Copper
  '740100': 'Copper mattes',
  '740200': 'Unrefined copper anodes',
  '740311': 'Refined copper cathodes',
  '740400': 'Copper scrap',
  '740811': 'Refined copper wire',

  // Nickel
  '750110': 'Nickel mattes',
  '750120': 'Nickel oxide sinters',
  '750210': 'Unwrought nickel',

  // Aluminium
  '760110': 'Unwrought aluminium',
  '760120': 'Unwrought aluminium alloys',
  '760200': 'Aluminium scrap',
  '760511': 'Aluminium wire',
  '760612': 'Aluminium plates & sheets',
  '761010': 'Aluminium doors & windows',
  '761090': 'Aluminium structures, other',

  // Zinc, tin and other base metals
  '790120': 'Unwrought zinc alloys',
  '800110': 'Unwrought tin',
  '810520': 'Unwrought cobalt',
  '811010': 'Unwrought antimony',

  // Tools, implements and cutlery
  '820160': 'Hedge & pruning shears',
  '820790': 'Interchangeable tools',

  // Miscellaneous articles of base metal
  '830621': 'Plated metal ornaments',
  '830710': 'Flexible steel tubing',
  '830890': 'Metal clasps & buckles',
  '830990': 'Metal caps & lids',

  // Machinery and mechanical appliances
  '840510': 'Gas generators',
  '840734': 'Vehicle petrol engines >1000cc',
  '841112': 'Turbo-jets >25kN',
  '841191': 'Turbo-jet & propeller parts',
  '841199': 'Gas turbine parts',
  '841290': 'Engine & motor parts',
  '841510': 'Air conditioning machines',
  '841590': 'Air conditioner parts',
  '841920': 'Medical sterilizers',
  '842121': 'Water filtering machinery',
  '842129': 'Liquid filtering machinery, other',
  '842240': 'Packing & wrapping machinery',
  '842290': 'Packing machinery parts',
  '842649': 'Self-propelled cranes',
  '842951': 'Front-end loaders',
  '842952': 'Excavators, 360° slew',
  '843031': 'Tunnelling & rock-cutting machinery',
  '843143': 'Boring machinery parts',
  '843149': 'Earth-moving machinery parts',
  '844331': 'Multi-function printers',
  '844391': 'Printing machinery parts',
  '845380': 'Leather-working machinery',
  '846599': 'Wood & plastics machine tools',
  '847130': 'Laptops & portable computers',
  '847150': 'Computer processing units',
  '847170': 'Computer storage units',
  '847330': 'Computer parts',
  '847420': 'Crushing & grinding machines',
  '847490': 'Mineral processing machinery parts',
  '847710': 'Injection-moulding machines',
  '847990': 'Mechanical appliance parts',
  '848180': 'Valves & taps',
  '848620': 'Semiconductor-making machines',
  '848790': 'Machinery parts, other',

  // Electrical machinery and equipment
  '850231': 'Wind-powered generating sets',
  '850300': 'Motor & generator parts',
  '850423': 'Liquid transformers >10,000kVA',
  '850431': 'Transformers ≤1kVA',
  '850440': 'Static converters',
  '850760': 'Lithium-ion batteries',
  '851713': 'Smartphones',
  '851762': 'Network & switching apparatus',
  '851769': 'Communication apparatus, other',
  '851771': 'Aerials & communication parts',
  '852321': 'Magnetic stripe cards',
  '852352': 'Smart cards',
  '852412': 'OLED display modules',
  '852492': 'OLED modules, with drivers',
  '852852': 'Computer monitors',
  '852872': 'Television sets',
  '852910': 'Aerials & reflectors',
  '853620': 'Circuit breakers ≤1000V',
  '853630': 'Circuit protection apparatus',
  '853641': 'Electrical relays ≤60V',
  '853710': 'Control panels ≤1000V',
  '853720': 'Control panels >1000V',
  '854143': 'Solar panels & PV cells',
  '854231': 'IC processors & controllers',
  '854232': 'IC memories',
  '854239': 'Integrated circuits, other',
  '854370': 'Electrical machines, other',
  '854390': 'Electrical machine parts',
  '854420': 'Co-axial cable',
  '854430': 'Vehicle wiring sets',
  '854442': 'Cable with connectors ≤1000V',
  '854449': 'Cable, no connectors ≤1000V',
  '854470': 'Optical fibre cables',
  '854511': 'Furnace carbon electrodes',
  '854800': 'Electrical machinery parts, other',
  '854911': 'Lead-acid battery scrap',

  // Railway locomotives and rolling stock
  '860310': 'Electric railway coaches',
  '860721': 'Railway air brakes',
  '860799': 'Railway parts, other',
  '860900': 'Shipping containers',

  // Vehicles other than railway
  '870121': 'Diesel road tractors',
  '870193': 'Tractors 37-75kW',
  '870321': 'Petrol cars ≤1000cc',
  '870322': 'Petrol cars 1000-1500cc',
  '870323': 'Petrol cars 1500-3000cc',
  '870324': 'Petrol cars >3000cc',
  '870332': 'Diesel cars 1500-2500cc',
  '870333': 'Diesel cars >2500cc',
  '870340': 'Petrol hybrids',
  '870360': 'Plug-in petrol hybrids',
  '870380': 'Electric cars',
  '870410': 'Off-highway dumpers',
  '870421': 'Diesel trucks ≤5t',
  '870422': 'Diesel trucks 5-20t',
  '870423': 'Diesel trucks >20t',
  '870431': 'Petrol trucks ≤5t',
  '870510': 'Crane lorries',
  '870710': 'Car bodies & cabs',
  '870829': 'Vehicle body parts',
  '870840': 'Vehicle gearboxes',
  '870894': 'Vehicle steering parts',
  '870899': 'Vehicle parts, other',
  '871120': 'Motorcycles 50-250cc',
  '871639': 'Trailers & semi-trailers',
  '871640': 'Trailers, other',

  // Aircraft and spacecraft
  '880212': 'Helicopters >2000kg',
  '880230': 'Aircraft 2000-15,000kg',
  '880240': 'Aircraft >15,000kg',
  '880622': 'Drones 250g-7kg',
  '880730': 'Aircraft parts',
  '880790': 'Aircraft & spacecraft parts, other',

  // Ships, boats and floating structures
  '890110': 'Cruise ships & ferries',
  '890120': 'Tankers',
  '890190': 'Cargo vessels',
  '890200': 'Fishing vessels',
  '890322': 'Sailboats 7.5-24m',
  '890323': 'Sailboats >24m',
  '890332': 'Motorboats 7.5-24m',
  '890333': 'Motorboats >24m',
  '890400': 'Tugs & pusher craft',
  '890510': 'Dredgers',
  '890520': 'Drilling & production platforms',
  '890590': 'Floating cranes & docks',
  '890690': 'Vessels, other',
  '890800': 'Vessels for breaking up',

  // Optical, medical and measuring instruments
  '901490': 'Navigation instrument parts',
  '901580': 'Surveying & hydrographic instruments',
  '901839': 'Catheters & cannulae',
  '901890': 'Medical instruments, other',
  '902110': 'Orthopaedic appliances',
  '902129': 'Dental fittings',
  '902139': 'Artificial body parts',
  '902219': 'Industrial X-ray apparatus',
  '902920': 'Speed indicators & tachometers',
  '903180': 'Measuring instruments, other',

  // Clocks and watches
  '910121': 'Automatic watches, precious metal',
  '910221': 'Automatic wrist-watches',
  '910811': 'Electric watch movements',

  // Arms and ammunition
  '930190': 'Military weapons',
  '930510': 'Pistol parts & accessories',
  '930630': 'Cartridges & ammunition parts',
  '930690': 'Ammunition, other',

  // Furniture, bedding and prefabricated buildings
  '940199': 'Seat parts',
  '940360': 'Wooden furniture',
  '940610': 'Prefabricated wooden buildings',
  '940620': 'Modular steel buildings',
  '940690': 'Prefabricated buildings, other',

  // Toys, games and sports equipment
  '950300': 'Toys, dolls & puzzles',
  '950430': 'Coin-operated games',
  '950450': 'Video game consoles',

  // Works of art, collectors' pieces and antiques
  '970121': 'Antique paintings >100 years',
  '970191': 'Modern paintings & drawings',
  '970390': 'Modern sculptures',
  '970539': 'Collector coins',
};

// Coarse safety net for codes missing from the table (e.g. a newer HS revision).
// The description's tail after "Heading: " is usually the commodity itself, so
// keep that and drop the customs boilerplate around it.
function fallbackGoodsName(description) {
  if (!description) {
    return description;
  }

  let text = String(description).replace(/\([^)]*\)/g, ' ');

  const separator = text.lastIndexOf(': ');
  if (separator > 0 && text.length - separator > 4) {
    text = text.slice(separator + 2);
  }

  text = text
    .split(/\s*,\s*(?:n\.e\.c\.|excluding|other than|whether|not |put up|of a kind|in |for )/i)[0]
    .split(/\s+(?:excluding|other than|whether or not)\s/i)[0]
    .replace(/[\s,;:.\-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (text.length > 48) {
    text = `${text.slice(0, 47).replace(/[\s,;:.\-]+$/, '')}...`;
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shortenGoodsName(productCode, description) {
  return GOODS_NAMES[productCode] || fallbackGoodsName(description);
}

module.exports = { GOODS_NAMES, shortenGoodsName };
