# Maritime Trading Game

## 1. Core Concept

A simple web-based strategy/management game centered around **maritime transportation and international trade**.

The player starts with:

* A small port
* A basic ship
* Limited money
* A small selection of goods and destinations

The objective is to **build and manage a profitable maritime trading network**.

The player chooses where to establish ports, buys and manages ships, transports goods between ports, develops technologies, hires personnel, and progressively expands their commercial empire.

The game should remain visually simple and easy to understand, while having enough progression and optimization to encourage long play sessions.

---

# 2. Core Gameplay Loop

```text
Build / Upgrade Port
        ↓
Discover Trade Opportunities
        ↓
Buy / Assign Ships
        ↓
Transport Goods
        ↓
Earn Money
        ↓
Invest Profits
        ↓
Research Technologies
        ↓
Buy Better Ships
        ↓
Unlock Better Goods / Routes
        ↓
Expand Worldwide
        ↓
Repeat
```

The important principle is:

> **Every successful trade should give the player a reason to improve their network.**

---

# 3. Ports

The player can establish ports around the world.

Each port has characteristics such as:

* Location
* Port capacity
* Storage capacity
* Loading/unloading speed
* Available goods
* Local demand
* Available infrastructure
* Port level
* Operating cost

### Port upgrades

Examples:

* Larger docks
* More storage
* Faster loading cranes
* Better warehouses
* Fuel infrastructure
* Ship repair facilities
* Container terminals
* Advanced logistics center
* Automated port
* International trade hub

Higher-level ports can handle:

* More ships
* Larger ships
* More valuable goods
* More simultaneous contracts

---

# 4. Ships

Ships are the main tools used to generate money.

Different ships have different characteristics:

| Statistic       | Description                 |
| --------------- | --------------------------- |
| Capacity        | Amount of cargo transported |
| Speed           | Travel time                 |
| Fuel efficiency | Operating cost              |
| Range           | Maximum distance            |
| Reliability     | Chance of breakdowns        |
| Crew capacity   | Number of employees         |
| Maintenance     | Cost of maintaining ship    |
| Specialization  | Type of cargo               |

### Example ships

**Early game**

* Small cargo ship
* Coastal freighter
* Small container ship

**Mid game**

* Large container ship
* Bulk carrier
* Tanker
* Ro-Ro ship

**Late game**

* Large container vessel
* LNG carrier
* Advanced automated ship
* High-speed cargo ship

Ships should not simply become "bigger = better".

A smaller ship could be:

* Faster on short routes
* Cheaper to operate
* Better for small ports

A large ship could:

* Transport enormous quantities
* Require upgraded ports
* Have much higher operating costs

---

# 5. Goods

Goods are the economic foundation of the game.

Different ports produce and consume different goods.

### Basic goods

* Food
* Wood
* Coal
* Steel
* Grain
* Textiles

### Intermediate goods

* Machinery
* Electronics
* Vehicles
* Chemicals
* Construction materials

### Advanced goods

* Luxury products
* Advanced electronics
* Pharmaceuticals
* Rare materials
* Specialized industrial equipment

The value of goods depends on:

```text
Production
+
Demand
+
Distance
+
Scarcity
+
Market conditions
```

---

# 6. Trade Routes

Players create routes between ports.

Example:

```text
Shanghai
   ↓
Singapore
   ↓
Dubai
   ↓
Rotterdam
```

A route could automatically generate money if:

* The destination needs the cargo
* The ship has enough capacity
* The route is profitable

Players can optimize routes based on:

* Distance
* Fuel consumption
* Cargo value
* Port fees
* Demand
* Ship capacity
* Travel time

---

# 7. Contracts

Instead of simply transporting random goods, ports can generate **trade contracts**.

Example:

> Rotterdam requires 500 units of electronics.

Reward:

**$125,000**

Deadline:

**7 days**

Required:

* Cargo capacity ≥ 500
* Destination port level ≥ 3

Contracts make the world feel alive and give the player short-term objectives.

---

# 8. Economy

The player earns money through trade.

### Revenue

```text
Cargo delivered
×
Cargo value
×
Demand multiplier
```

### Expenses

* Fuel
* Crew salaries
* Ship maintenance
* Port fees
* Taxes
* Repairs

Therefore:

> A route that makes $100,000 revenue isn't necessarily profitable.

Example:

```text
Revenue             $100,000
Fuel                 -$25,000
Crew                 -$10,000
Port fees             -$8,000
Maintenance           -$7,000
--------------------------------
Profit                $50,000
```

This gives the player actual optimization decisions.

---

# 9. Technology Tree

Money can be invested into research.

Technology could be divided into several branches.

### Ship technology

* Better engines
* Fuel efficiency
* Larger cargo capacity
* Better navigation
* Automation
* Faster loading
* Reduced maintenance

### Port technology

* Bigger docks
* Automated cranes
* Better warehouses
* Faster logistics
* Larger ships
* Containerization

### Business technology

* Better contracts
* Market prediction
* Negotiation
* Insurance
* International trade
* Financial optimization

### Navigation technology

* Better route planning
* Weather prediction
* Optimized navigation
* Autonomous navigation

---

# 10. Personnel

Ships and ports can employ personnel.

Examples:

### Ship

* Captain
* Engineers
* Sailors
* Mechanics
* Logistics officer

### Port

* Dock workers
* Managers
* Engineers
* Logistics specialists

Personnel can have levels and specializations.

Example:

```text
Captain — Level 4

+8% navigation efficiency
+5% fuel efficiency
+10% accident prevention
```

This adds another layer of optimization without making the game mechanically complicated.

---

# 11. World Map

The entire game revolves around a world map.

The player sees:

* Ports
* Ships
* Trade routes
* Cargo
* Contracts
* Economic activity

Ships physically move across the map.

Example:

```text
       EUROPE
          ● Rotterdam
          │
          │
          │
ATLANTIC  │
          │
          ●
          │
       AFRICA
          │
          ● Cape Town
          │
       INDIAN OCEAN
          │
          ● Singapore
          │
          ● Shanghai
```

The map doesn't need to be geographically perfect initially.

A stylized world map is enough.

### Map data

The map has no tile layer, so the country outlines are what fills the screen, and their
size is the main cost of panning and zooming. Two pre-simplified Natural Earth copies are
committed to `public/` rather than fetching one large file at runtime:

| File | Source | Vertices | Gzipped |
| --- | --- | --- | --- |
| `public/countries-low.geojson` | Natural Earth 1:110m | ~10.6k | ~72 kB |
| `public/countries-high.geojson` | Natural Earth 1:50m | ~100k | ~755 kB |
| `public/lakes.geojson` | Natural Earth 1:110m lakes | ~450 | ~4 kB |

The coarse file is drawn up to zoom 5, and the detailed one above it once the player
zooms in far enough to need it. Regenerate all three with:

```bash
npm run build:borders
```

That script rounds coordinates and drops Natural Earth's unused attribute columns, so it
is also the place to start if the coastlines ever need to be coarser or finer.

The lakes are not drawn — the basemap tiles show them — but they are a build input for the
sea grid, which needs them to carve the Great Lakes back out of the country outlines. See
below.

### Sea routing

A course is not a straight line. Drawn as one, Rotterdam to Tokyo runs across Europe and
Central Asia, so routes are searched over an ocean grid built from the same outlines the map
is drawn from:

| Asset | Source | Grid | Size |
| --- | --- | --- | --- |
| `src/assets/sea-grid.json` | `public/countries-low.geojson` and `public/lakes.geojson`, rasterised | 720 × 360 at 0.5° | 42 kB (~7 kB gzipped) |

Regenerate it with:

```bash
npm run build:borders   # only if the lakes need refreshing
npm run build:sea-grid
```

The grid is water only. Man-made canals are deliberately *not* opened — Suez, Panama, Kiel
and Corinth stay blocked, so the Mediterranean is not a shortcut to the Red Sea and the
Atlantic is not one to the Pacific. Natural straits are: the builder clears a box around 68
of them (Bosporus, Bab-el-Mandeb, Malacca, Magellan…), because a passage narrower than one
cell would otherwise read as a wall and maroon the sea behind it.

A strait that is a *corridor* rather than a doorway gets checked end to end, because
"reachable from the Atlantic" cannot tell a transit from a detour: Magellan was carved at
the Atlantic entrance and at the Pacific mouth but blocked across the Segunda Angostura in
between, and every Argentine–Chilean voyage still passed the check by rounding Cape Horn —
600 km and two days further than the strait it is named after. The same test caught Puget
Sound and the Strait of Georgia, whose outside passage ran 460 km round the Olympic
Peninsula instead of 240 km through the San Juan islands.

The Great Lakes are the same problem the other way round. Natural Earth keeps lakes in a
layer of their own, so the country outlines run *straight across* them and the raster saw one
solid continent from Duluth to the Gulf of St. Lawrence — every Great Lakes port had no sea
route at all. The builder now carves the five lakes back out of `public/lakes.geojson` and
threads the waterway between them and the Atlantic: the St. Lawrence, the Welland at Niagara,
the Detroit and St. Clair rivers, the Straits of Mackinac and the St. Marys river up to
Superior. That seaway is engineered water, the one exception to the rule above — a hull
really does take it, and without it the lakes are unreachable. Anything a lake carve opens
that does *not* join the open sea is blocked again by the same pass that closes the world's
closed basins, so carving Lake Nicaragua cannot quietly cut a passage across Central America.

Polar pack ice is blocked north of 75° N, so no course runs over the top of the world. The
script asserts all of this against the mask before writing it, and fails the build if a canal
leaks, a strait closes, or a lake drops out of the ocean.

`src/seaRoute.js` searches that grid. A step costs the great-circle distance between the two
cells it joins, so a diagonal is not free; a diagonal is only allowed when the cells sharing
that corner are water too, which is what keeps an isthmus one cell thick sealed; and the
staircase the search returns is straightened into the corners a helmsman would steer.

The search runs as a *distance field* from one departure rather than a route at a time: one
pass prices every port on the map, which is what lets the panel list sixty destinations, quote
a crossing and send a voyage that all agree with each other. About 1% of ports — the deep
river ports (Manaus, Asunción, Hankow) and a few high-Arctic berths (Longyearbyen) — have no
sea route at all; those fall back to a straight line and the panel says so rather than
pretending.

---

# 12. Progression

The game should have a clear progression.

### Stage 1 — Local trader

* 1 port
* 1 small ship
* Basic goods
* Short routes

### Stage 2 — Regional company

* Several ports
* Multiple ships
* Better contracts
* Research

### Stage 3 — International company

* Global routes
* Large vessels
* Specialized cargo
* Advanced ports

### Stage 4 — Global corporation

* Huge fleet
* Major international ports
* Advanced technologies
* Complex logistics

### Stage 5 — Endgame

Possible objectives:

* Become the world's largest shipping company
* Control the most profitable trade routes
* Transport a certain amount of cargo
* Own the largest fleet
* Dominate specific markets

---

# 13. Random Events

Optional events can make the world less predictable.

Examples:

* Fuel prices increase
* Port congestion
* Storm
* Ship breakdown
* Economic crisis
* Sudden demand for a product
* New resource discovered
* Port strike
* Trade agreement
* New technology

The player then has to adapt their network.

---

# 14. Multiplayer / Competition

This could eventually become multiplayer.

Players could compete on:

* Company value
* Revenue
* Fleet size
* Cargo transported
* Number of ports
* Market share

Possible leaderboard:

```text
GLOBAL SHIPPING COMPANIES

1. OceanCorp       $82.4M
2. BlueWave        $71.2M
3. Atlantic Trade  $64.8M
4. Nashou Shipping $58.3M
```

Players could also see other players' ships and companies on the world map.

---

# 15. UI Philosophy

The game should stay **simple and readable**.

Main screen:

```text
┌──────────────────────────────────────────────┐
│ $2,450,000     Ships: 12     Ports: 7       │
├──────────────────────────────────────────────┤
│                                              │
│                WORLD MAP                     │
│                                              │
│       ●──────🚢────────●                     │
│      Port             Port                   │
│                                              │
│              🚢                              │
│                                              │
│   ●────────────────────────●                 │
│                                              │
├──────────────────────────────────────────────┤
│ Fleet │ Ports │ Trade │ Research │ Company   │
└──────────────────────────────────────────────┘
```

The goal should be **"easy to learn, difficult to optimize."**

---

# 16. MVP

Do NOT build everything initially.

The first playable version could contain only:

### Map

* Simple world map
* Click to create port

### Ports

* Port level
* Storage
* Production
* Demand

### Ships

* Buy ship
* Capacity
* Speed
* Fuel cost

### Trading

* Choose cargo
* Choose destination
* Send ship
* Receive money

### Economy

* Revenue
* Fuel cost
* Maintenance

### Progression

* Buy better ships
* Upgrade ports
* 5–10 technologies

That's enough to make a playable game.

---

# 17. Long-term Vision

The final game could become a lightweight **maritime tycoon / logistics strategy game**.

The player starts with a tiny cargo ship and gradually builds an international shipping company.

The key fantasy is:

> **"I started with one tiny boat in one port, and now I operate a global maritime empire."**
