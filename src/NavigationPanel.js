import 'flag-icons/css/flag-icons.min.css';
import { useCallback, useMemo, useState } from 'react';
import ports from './assets/ports.json';
import vessels from './assets/vessels.json';
import { AIRCRAFT_CATALOG, AIRPORTS, aircraftById } from './aircraftData';
import { cargoOptions as buildCargoOptions } from './cargo';
import { formatDuration, portDistanceKm } from './geo';
import { PORT_DICTIONARIES } from './map';
import { seaDistanceField } from './seaRoute';
import { berthClass, canBerth, lossRiskPercent, vesselClass } from './Research';
import { REAL_TRADE_BONUS_SHARE, hullPrice, resolveVoyage } from './voyage';

/**
 * Planning a route, and dispatching the fleet that sails or flies it.
 *
 * This used to be four lists rendered straight into the modal — all 3630 ports, all 200
 * hulls and every one of the 1120 country/good pairs — which is both unusable and slow.
 * Every section is now a search box over a capped result list, and each one only offers
 * things that can actually be used: ports you own for departure, hulls that fit the
 * berth at *both* ends, and the goods that the departure country actually exports.
 *
 * A single route is planned in one of two modes. **Sea** is the original model: a ship
 * sails from a port you own, priced off the sea route the grid searches (so a trip around
 * a continent costs what it should). **Air** sends an aircraft, which crosses the land a
 * ship has to go around; it flies from any airport — airports are public, nobody owns one
 * — to any other, in a straight great circle. Aircraft are far faster but carry much less,
 * so an air delivery pays a fraction of the same distance by sea, and the aircraft itself
 * costs about an order of magnitude more than a comparable hull.
 *
 * The fleet section is the dispatch board, filtered to the mode in play: every owned
 * transport with its data and whether it is under way, so an idle hull or airframe can be
 * given a route while others are already out.
 */

/**
 * How many results a capped list shows before the search box is the way to go. Large
 * enough to browse a whole ocean of ports by scrolling (the list scrolls in place — see
 * `.nav-options`), so "nearest eight" is no longer the whole map.
 */
const LIST_LIMIT = 60;

/** Goods are the point of the trip, so their list is far longer than a port list. */
const CARGO_LIST_LIMIT = 120;

const BONUS_LABEL = `+${REAL_TRADE_BONUS_SHARE * 100}%`;

const HARBOR_LABELS = PORT_DICTIONARIES.HARBOR_SIZE;

const matches = (query, values) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle));
};

/** "8 of 3630" once a list is capped, or just the total when everything fits. */
const resultNote = (total, shown) => {
  if (shown === 0) return 'nothing found';
  if (total !== null && total > shown) return `${shown.toLocaleString()} of ${total.toLocaleString()}`;
  return `${shown.toLocaleString()} shown`;
};

/** How many of a filtered list actually render, so the note never over-counts the cap. */
const capped = (matches, limit) => Math.min(matches, limit);

function Section({ children, note, title }) {
  return (
    <section className="nav-section">
      <h4>
        {title}
        {note && <span className="nav-section-note">{note}</span>}
      </h4>
      {children}
    </section>
  );
}

function OptionList({ empty, onSelect, options, selectedId }) {
  if (options.length === 0) {
    return <p className="nav-empty">{empty}</p>;
  }

  return (
    <ul className="nav-options">
      {options.map(({ disabled, id, meta, title, warning }) => (
        <li key={id}>
          <button
            className={`nav-option${id === selectedId ? ' selected' : ''}`}
            disabled={disabled}
            onClick={() => onSelect(id)}
            type="button"
          >
            <span className="nav-option-title">{title}</span>
            {meta && <span className="nav-option-meta">{meta}</span>}
            {warning && <span className="nav-option-warning">{warning}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Where an airport is, for a result row: "Nairobi, KE". */
const airportPlace = (airport) =>
  [airport.municipality, airport.iso_country].filter(Boolean).join(', ') || airport.ident;

function NavigationPanel({ fleet, money, onClose, onStart, ownedPortIds, research }) {
  const [mode, setMode] = useState('sea');
  const [departureId, setDepartureId] = useState(null);
  const [arrivalId, setArrivalId] = useState(null);
  const [vesselId, setVesselId] = useState(null);
  const [cargoCode, setCargoCode] = useState(null);
  const [queries, setQueries] = useState({ departure: '', arrival: '', vessel: '', cargo: '' });

  const airborne = mode === 'air';

  const setQuery = (field) => (event) => setQueries((current) => ({ ...current, [field]: event.target.value }));

  // Changing mode changes what every selection means (a port id and an airport id are not
  // the same thing), so the plan is cleared rather than half-translated between the two.
  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setDepartureId(null);
    setArrivalId(null);
    setVesselId(null);
    setCargoCode(null);
    setQueries({ departure: '', arrival: '', vessel: '', cargo: '' });
  };

  const ownedPorts = useMemo(
    () => ports.filter((port) => ownedPortIds.includes(port.id_port)),
    [ownedPortIds]
  );

  const departure = useMemo(() => {
    if (airborne) return AIRPORTS.find((airport) => airport.id === departureId) ?? null;
    return ownedPorts.find((port) => port.id_port === departureId) ?? null;
  }, [airborne, departureId, ownedPorts]);

  const arrival = useMemo(() => {
    if (airborne) return AIRPORTS.find((airport) => airport.id === arrivalId) ?? null;
    return ports.find((port) => port.id_port === arrivalId) ?? null;
  }, [airborne, arrivalId]);

  const vessel = useMemo(() => {
    if (airborne) return aircraftById(vesselId);
    return vessels.find((entry) => entry.id_vessel === vesselId) ?? null;
  }, [airborne, vesselId]);

  /**
   * The dispatch board: one row per owned transport, with the trip that occupies it (if
   * any). Ownership is the backend's (`player_vessel` rows are handed in as `fleet`), and
   * occupancy is whatever trip UI.js has under way for that hull or airframe.
   */
  const fleetEntries = useMemo(
    () =>
      (fleet || []).map((entry) => ({
        air: entry.vessel.kind === 'aircraft',
        busy: Boolean(entry.voyage),
        id: entry.vessel.id_vessel,
        vessel: entry.vessel,
        voyage: entry.voyage ?? null,
      })),
    [fleet]
  );

  // Only the transports that can run this mode are offered in its list and board.
  const modeEntries = useMemo(
    () => fleetEntries.filter((entry) => entry.air === airborne),
    [airborne, fleetEntries]
  );

  const ownedVesselIds = useMemo(() => modeEntries.map((entry) => entry.id), [modeEntries]);
  const readyVessels = modeEntries.filter((entry) => !entry.busy);

  // Every good the departure country exports, re-sorted for the chosen arrival: the loads
  // that are a real export/import pair for this route come first, the rest by value. A
  // country with no recorded trade falls back to the world's biggest exports rather than
  // leaving the player with nothing to carry.
  const cargoOptions = useMemo(
    () => buildCargoOptions({ fromCountry: departure?.COUNTRY, toCountry: arrival?.COUNTRY }),
    [arrival, departure]
  );

  const cargo = useMemo(
    () => cargoOptions.find((good) => good.productCode === cargoCode) ?? null,
    [cargoCode, cargoOptions]
  );

  /**
   * The sea distance to any port, from one search out of the departure.
   *
   * A route around a continent costs what it should, which is the whole point: the crow-flies
   * distance from Rotterdam to Tokyo runs over Europe and Asia, and pricing a voyage off it
   * made every long haul a bargain. Only the selected pair is ever drawn (map.js searches its
   * own field for the voyage), so this is shared by the list, the sort and the summary.
   *
   * Air has no such field: a flight is a straight great circle, so there is nothing to
   * search and the straight distance is the real one.
   */
  const seaField = useMemo(
    () => (!airborne && departure ? seaDistanceField(departure) : null),
    [airborne, departure]
  );

  /** The sea distance to a port, or null when only a straight line reaches it. */
  const seaDistanceTo = useCallback(
    (port) => (seaField ? seaField.distanceKmTo(port) : null),
    [seaField]
  );

  /**
   * A destination's distance, however it can be reached: for a ship the sea route when
   * there is one, otherwise the straight line it would fall back to; for a flight always
   * the direct great circle.
   */
  const distanceFor = useCallback(
    (destination) => {
      if (airborne) return portDistanceKm(departure, destination);

      const distance = seaDistanceTo(destination);
      return distance === null ? portDistanceKm(departure, destination) : distance;
    },
    [airborne, departure, seaDistanceTo]
  );

  /** "12,345 km by sea", "9,000 km direct" for water the grid cannot reach, "km direct" in the air. */
  const distanceLabel = useCallback(
    (destination) => {
      if (airborne) return `${Math.round(distanceFor(destination)).toLocaleString()} km direct`;

      return `${Math.round(distanceFor(destination)).toLocaleString()} km ${
        seaDistanceTo(destination) === null ? 'direct' : 'by sea'
      }`;
    },
    [airborne, distanceFor, seaDistanceTo]
  );

  const seaReachable = Boolean(!airborne && departure && arrival && seaDistanceTo(arrival) !== null);
  const distanceKm = departure && arrival ? distanceFor(arrival) : null;
  const vesselOwned = vessel ? ownedVesselIds.includes(vessel.id_vessel) : false;
  const vesselCost = vessel && !vesselOwned ? (airborne ? vessel.price : hullPrice(vessel.gt)) : 0;
  const vesselBusy = Boolean(modeEntries.find((entry) => entry.id === vesselId)?.busy);

  // Estimated with a roll that can never trigger a loss, so the panel quotes the
  // delivery rather than a gamble.
  const preview = useMemo(() => {
    if (distanceKm === null || !cargo) return null;

    return resolveVoyage({
      cargoValueK: cargo.value,
      distanceKm,
      lossRoll: 100,
      realTrade: cargo.realTrade,
      research,
      air: airborne,
    });
  }, [airborne, cargo, distanceKm, research]);

  const { options: departureOptions, total: departureMatches } = useMemo(() => {
    const source = airborne ? AIRPORTS : ownedPorts;
    const query = queries.departure.trim().toLowerCase();
    const found = source.filter((entry) =>
      airborne
        ? matches(query, [entry.name, entry.municipality, entry.iso_country, entry.iata_code])
        : matches(query, [entry.PORT_NAME, entry.COUNTRY])
    );

    return {
      total: found.length,
      options: found.slice(0, LIST_LIMIT).map((entry) => {
        if (airborne) {
          return {
            disabled: false,
            id: entry.id,
            meta: `${airportPlace(entry)}${entry.iata_code ? ` · ${entry.iata_code}` : ''}`,
            title: entry.name,
          };
        }

        const fits = !vessel || canBerth(entry, vessel.length, research);
        const capacity = berthClass(entry, research);

        return {
          disabled: false,
          id: entry.id_port,
          meta: `${HARBOR_LABELS[entry.HARBORSIZE]?.label ?? 'Unknown'} berth · takes ${capacity ?? '?'} class`,
          title: `${entry.PORT_NAME}, ${entry.COUNTRY}`,
          warning: fits ? null : 'Too shallow for the selected hull',
        };
      }),
    };
  }, [airborne, ownedPorts, queries.departure, research, vessel]);

  const { options: arrivalOptions, total: arrivalMatches } = useMemo(() => {
    const query = queries.arrival.trim().toLowerCase();
    const source = airborne ? AIRPORTS : ports;
    const found = source.filter((entry) => {
      if (airborne) {
        return entry.id !== departureId &&
          matches(query, [entry.name, entry.municipality, entry.iso_country, entry.iata_code]);
      }

      return entry.id_port !== departureId && matches(query, [entry.PORT_NAME, entry.COUNTRY]);
    });

    // Browsing without a search term lists the destinations nearest the departure, which
    // beats being handed the first rows of a 3630-port file in file order; with no departure
    // to measure from, the whole world is offered alphabetically so any of it can be scrolled.
    const labelOf = (entry) =>
      airborne ? `${entry.name}, ${entry.municipality || entry.iso_country}` : `${entry.PORT_NAME}, ${entry.COUNTRY}`;
    const ordered = query
      ? found
      : departure
        ? [...found].sort((a, b) => distanceFor(a) - distanceFor(b))
        : [...found].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));

    return {
      total: found.length,
      options: ordered.slice(0, LIST_LIMIT).map((entry) => {
        if (airborne) {
          return {
            disabled: false,
            id: entry.id,
            meta: departure
              ? `${airportPlace(entry)} · ${distanceLabel(entry)}`
              : airportPlace(entry),
            title: entry.name,
          };
        }

        const fits = !vessel || canBerth(entry, vessel.length, research);

        return {
          disabled: false,
          id: entry.id_port,
          meta: departure
            ? `${HARBOR_LABELS[entry.HARBORSIZE]?.label ?? 'Unknown'} berth · ${distanceLabel(entry)}`
            : `${HARBOR_LABELS[entry.HARBORSIZE]?.label ?? 'Unknown'} berth`,
          title: `${entry.PORT_NAME}, ${entry.COUNTRY}`,
          warning: fits ? null : 'Too shallow for the selected hull',
        };
      }),
    };
  }, [airborne, departure, departureId, distanceFor, distanceLabel, queries.arrival, research, vessel]);

  const { options: vesselOptions, total: vesselMatches } = useMemo(() => {
    // Owned transports come first — ready ones ahead of the ones already under way — because
    // the search box is mostly used to find one of your own; unowned ones come next so the
    // same list still sells you a new one. Within a rank the cheapest leads, so an affordable
    // starter boat (or aircraft) is visible without typing its name.
    const rank = (entry) => {
      const owned = modeEntries.find((fleetEntry) => fleetEntry.id === entry.id_vessel);

      if (!owned) return 1;

      return owned.busy ? 2 : 0;
    };
    const priceOf = (entry) => (entry.kind === 'aircraft' ? entry.price : hullPrice(entry.gt));
    const found = (airborne ? AIRCRAFT_CATALOG : vessels)
      .filter((entry) =>
        matches(queries.vessel, [entry.ship_name, entry.Company_Name, entry.typecode, entry.fleet_nation])
      )
      .sort((a, b) => rank(a) - rank(b) || priceOf(a) - priceOf(b));

    return {
      total: found.length,
      options: found.slice(0, LIST_LIMIT).map((entry) => {
        const owned = modeEntries.find((fleetEntry) => fleetEntry.id === entry.id_vessel);
        const busy = Boolean(owned?.busy);

        if (airborne) {
          const price = owned ? (busy ? 'owned · in flight' : 'owned · ready') : `$${entry.price.toLocaleString()}`;

          return {
            disabled: busy,
            id: entry.id_vessel,
            meta: `${entry.typecode} · ${entry.classLabel} · ${entry.payloadTonnes} t payload · ${price}`,
            title: entry.model,
            warning: busy ? 'Already in flight' : null,
          };
        }

        const fits = !departure || canBerth(departure, entry.length, research);
        const price = owned ? (busy ? 'owned · at sea' : 'owned · ready') : `$${hullPrice(entry.gt).toLocaleString()}`;

        return {
          disabled: !fits || busy,
          id: entry.id_vessel,
          meta: `${vesselClass(entry.length) ?? '?'} class · ${entry.ship_name} · ${Number(entry.gt).toLocaleString()} GT · ${entry.length} m · ${price}`,
          title: entry.Company_Name,
          warning: busy ? 'Already at sea' : fits ? null : 'Needs a deeper berth',
        };
      }),
    };
  }, [airborne, departure, modeEntries, queries.vessel, research]);

  const { options: cargoList, total: cargoMatches } = useMemo(() => {
    const found = cargoOptions.filter((good) => matches(queries.cargo, [good.description, good.productCode]));

    return {
      total: found.length,
      options: found.slice(0, CARGO_LIST_LIMIT).map((good) => ({
        disabled: false,
        id: good.productCode,
        meta: [
          `${Number(good.value).toLocaleString()}k USD traded`,
          good.realTrade ? `real trade · ${BONUS_LABEL}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        title: good.description,
      })),
    };
  }, [cargoOptions, queries.cargo]);

  // The goods the route really carries: departure exports it, arrival imports it.
  const realTradeGoods = cargoOptions.filter((good) => good.realTrade).length;

  const blockedReason = useMemo(() => {
    if (airborne) {
      if (!departure) return 'Choose a departure airport.';
      if (!arrival) return 'Choose an arrival airport.';
      if (!vessel) return 'Choose an aircraft.';
      if (vesselBusy) return `${vessel.Company_Name} is already in flight. Send a ready aircraft instead.`;
      if (!cargo) return 'Choose goods to trade.';
      if (vesselCost > money) return `Not enough money for this aircraft ($${vesselCost.toLocaleString()} needed).`;
      if (departure.id === arrival.id) return 'Departure and arrival are the same airport.';
      return null;
    }

    if (ownedPorts.length === 0) return 'You need to own a port before you can sail from one.';
    if (!departure) return 'Choose a departure port.';
    if (!arrival) return 'Choose an arrival port.';
    if (!vessel) return 'Choose a vessel.';
    if (vesselBusy) return `${vessel.ship_name} is already at sea. Send a ready vessel instead.`;
    if (!canBerth(departure, vessel.length, research)) {
      return `${departure.PORT_NAME} cannot berth a ${vessel.length} m hull. Research Deepwater Dredging.`;
    }
    if (!canBerth(arrival, vessel.length, research)) {
      return `${arrival.PORT_NAME} cannot berth a ${vessel.length} m hull. Pick a deeper arrival port.`;
    }
    if (!cargo) return 'Choose a goods to trade.';
    if (vesselCost > money) return `Not enough money for this hull ($${vesselCost.toLocaleString()} needed).`;
    if (departure.id_port === arrival.id_port) return 'Departure and arrival are the same port.';
    return null;
  }, [airborne, arrival, cargo, departure, money, ownedPorts.length, research, vessel, vesselBusy, vesselCost]);

  const start = () => {
    if (blockedReason) return;
    onStart({
      fromPort: departure,
      toPort: arrival,
      ship: vessel,
      good: cargo,
      realTrade: Boolean(cargo.realTrade),
      mode,
    });
    // Dispatching leaves the panel open: an owner with several transports sends them one
    // after another, and clearing the selection points the next pick at one still in port.
    setVesselId(null);
  };

  return (
    <div className="nav-panel">
      <h3>New route</h3>

      <div className="nav-mode" role="group" aria-label="Transport mode">
        <button
          className={`nav-mode-btn${!airborne ? ' active' : ''}`}
          onClick={() => switchMode('sea')}
          type="button"
        >
          Sea
        </button>
        <button
          className={`nav-mode-btn${airborne ? ' active' : ''}`}
          onClick={() => switchMode('air')}
          type="button"
        >
          Air
        </button>
        <span className="nav-mode-note">
          {airborne
            ? 'Airports are public; aircraft fly direct overland, faster and for less freight.'
            : 'Sails from a port you own, around the continents.'}
        </span>
      </div>

      <Section
        note={resultNote(airborne ? AIRPORTS.length : ownedPorts.length, capped(departureMatches, LIST_LIMIT))}
        title={airborne ? 'Departure airport' : 'Departure port'}
      >
        <input
          className="nav-search"
          onChange={setQuery('departure')}
          placeholder={airborne ? 'Search 1175 airports…' : 'Search your ports…'}
          type="search"
          value={queries.departure}
        />
        <OptionList
          empty={
            airborne
              ? 'No airport matches that search.'
              : ownedPorts.length
                ? 'No owned port matches that search.'
                : 'You do not own a port yet.'
          }
          onSelect={setDepartureId}
          options={departureOptions}
          selectedId={departureId}
        />
      </Section>

      <Section
        note={resultNote(arrivalMatches, capped(arrivalMatches, LIST_LIMIT))}
        title={airborne ? 'Arrival airport' : 'Arrival port'}
      >
        <input
          className="nav-search"
          onChange={setQuery('arrival')}
          placeholder={
            airborne
              ? 'Search, or browse the nearest airports…'
              : departure
                ? 'Search, or browse the nearest ports…'
                : 'Search 3630 ports…'
          }
          type="search"
          value={queries.arrival}
        />
        <OptionList
          empty={airborne ? 'No airport matches that search.' : 'No port matches that search.'}
          onSelect={setArrivalId}
          options={arrivalOptions}
          selectedId={arrivalId}
        />
      </Section>

      <Section
        note={resultNote(airborne ? AIRCRAFT_CATALOG.length : vessels.length, capped(vesselMatches, LIST_LIMIT))}
        title={airborne ? 'Aircraft' : 'Vessel'}
      >
        <input
          className="nav-search"
          onChange={setQuery('vessel')}
          placeholder={airborne ? 'Search by model, type or maker…' : 'Search by name, owner or flag…'}
          type="search"
          value={queries.vessel}
        />
        <OptionList
          empty={airborne ? 'No aircraft matches that search.' : 'No vessel matches that search.'}
          onSelect={setVesselId}
          options={vesselOptions}
          selectedId={vesselId}
        />
      </Section>

      <Section
        note={[
          resultNote(cargoOptions.length, capped(cargoMatches, CARGO_LIST_LIMIT)),
          realTradeGoods > 0 ? `${realTradeGoods} real trade` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        title="Goods"
      >
        <input
          className="nav-search"
          onChange={setQuery('cargo')}
          placeholder="Search goods…"
          type="search"
          value={queries.cargo}
        />
        {departure && (
          <p className="nav-goods-note">
            All {cargoOptions.length} goods {departure.COUNTRY} exports, biggest trade first
            {arrival && realTradeGoods > 0
              ? ` — ${realTradeGoods} of them really reach ${arrival.COUNTRY}, and pay ${BONUS_LABEL}.`
              : '.'}
          </p>
        )}
        <OptionList
          empty={departure ? 'No good matches that search.' : 'Cargo depends on the departure.'}
          onSelect={setCargoCode}
          options={cargoList}
          selectedId={cargoCode}
        />
      </Section>

      {/* The dispatch board: every owned transport of this mode, with the one thing that
          decides whether it can be sent anywhere — whether it is already under way. */}
      <Section
        note={
          modeEntries.length > 0
            ? `${readyVessels.length} ready · ${modeEntries.length - readyVessels.length} ${airborne ? 'in flight' : 'at sea'}`
            : null
        }
        title="Your fleet"
      >
        {modeEntries.length > 0 ? (
          <ul className="nav-fleet">
            {modeEntries.map((entry) => (
              <li key={entry.id}>
                <button
                  className={`nav-fleet-vessel${entry.busy ? ' at-sea' : ''}${entry.id === vesselId ? ' selected' : ''}`}
                  disabled={entry.busy}
                  onClick={() => setVesselId(entry.id)}
                  type="button"
                >
                  <span className="nav-fleet-name">{entry.vessel.Company_Name}</span>
                  <span className="nav-fleet-meta">
                    {entry.air
                      ? `${entry.vessel.typecode} · ${entry.vessel.classLabel} · ${entry.vessel.payloadTonnes} t payload`
                      : `${vesselClass(entry.vessel.length) ?? '?'} class · ${entry.vessel.ship_name} · ${Number(entry.vessel.gt).toLocaleString()} GT · ${entry.vessel.length} m`}
                  </span>
                  <span className={`nav-fleet-status${entry.busy ? ' at-sea' : ' ready'}`}>
                    {entry.busy
                      ? `${entry.air ? 'In flight' : 'At sea'} → ${entry.voyage.toPort.PORT_NAME}`
                      : departure && arrival
                        ? `Ready · ${departure.PORT_NAME} → ${arrival.PORT_NAME}`
                        : 'Ready to go'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nav-empty">
            {airborne
              ? "You don't own any aircraft yet. Buy one below to start an air fleet."
              : "You don't own any vessels yet. Buy a hull below to start a fleet."}
          </p>
        )}
      </Section>

      <dl className="nav-summary">
        <div>
          <dt>{airborne ? 'Departure airport' : 'Departure port'}</dt>
          <dd>{departure ? departure.PORT_NAME : '—'}</dd>
        </div>
        <div>
          <dt>{airborne ? 'Wanted destination' : 'Wanted destination port'}</dt>
          <dd>{arrival ? arrival.PORT_NAME : '—'}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{distanceKm === null ? '—' : `${Math.round(distanceKm).toLocaleString()} km`}</dd>
        </div>
        {arrival && (
          <div>
            <dt>Course</dt>
            <dd>
              {airborne
                ? 'By air — direct great circle over the land'
                : seaReachable
                  ? 'By sea — runs around the canals'
                  : 'Direct line — this port has no sea route'}
            </dd>
          </div>
        )}
        <div>
          <dt>Crossing</dt>
          <dd>{preview ? formatDuration(preview.durationMs) : '—'}</dd>
        </div>
        <div>
          <dt>Est. freight</dt>
          <dd>{preview ? `$${preview.reward.toLocaleString()}` : '—'}</dd>
        </div>
        {preview && preview.longHaul > 1 && (
          <div>
            <dt>Ocean premium</dt>
            <dd>×{preview.longHaul.toFixed(2)} for the long leg</dd>
          </div>
        )}
        <div>
          <dt>Research</dt>
          <dd>{preview ? `+${preview.points} pts` : '—'}</dd>
        </div>
        <div>
          <dt>Loss risk</dt>
          <dd>{lossRiskPercent(research)}%</dd>
        </div>
        {cargo && (
          <div>
            <dt>Selected cargo</dt>
            <dd>
              {cargo.description}
              {cargo.realTrade && <span className="nav-bonus"> real trade · {BONUS_LABEL}</span>}
            </dd>
          </div>
        )}
        {preview && preview.realTrade && (
          <div>
            <dt>Reality bonus</dt>
            <dd className="nav-bonus">
              +${preview.bonus.toLocaleString()} — {departure.COUNTRY} really exports this to{' '}
              {arrival.COUNTRY}
            </dd>
          </div>
        )}
      </dl>

      {blockedReason && <p className="nav-blocked">{blockedReason}</p>}

      <div className="nav-actions">
        <button className="nav-start" disabled={Boolean(blockedReason)} onClick={start} type="button">
          {vesselCost > 0
            ? airborne
              ? `Buy aircraft & fly ($${vesselCost.toLocaleString()})`
              : `Buy hull & sail ($${vesselCost.toLocaleString()})`
            : airborne
              ? 'Start flight'
              : 'Start navigation'}
        </button>
        <button className="nav-cancel" onClick={onClose} type="button">
          Close
        </button>
      </div>
    </div>
  );
}

export default NavigationPanel;
