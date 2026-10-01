import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import 'flag-icons/css/flag-icons.min.css';
import vessels from './assets/vessels.json';
import countryCodes from './assets/country_codes_V202601.json';
import * as api from './api';
import { formatDuration } from './geo';
import { ownedFleetFromDb } from './vesselData';
// The adapted catalog, not the raw dump: it carries the id, price and payload the
// directory and the acquire button need. See aircraftData.js.
import { AIRCRAFT_CATALOG as aircraft } from './aircraftData';


const COUNTRY_CODE_BY_NAME = countryCodes.reduce((codes, country) => {
  codes[country.country_name.toLowerCase()] = country.country_iso2.toLowerCase();
  return codes;
}, {});

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23dcecf1'/%3E%3Cpath d='M94 238h451l-42 42H137z' fill='%230f766e'/%3E%3Cpath d='M174 197h233v41H174zM225 151h101v46H225z' fill='%23164e63'/%3E%3Cpath d='M275 91v60h-39l58-72 58 72h-39V91z' fill='%23f97316'/%3E%3Ccircle cx='120' cy='302' r='9' fill='%23527986'/%3E%3Ccircle cx='520' cy='302' r='9' fill='%23527986'/%3E%3C/svg%3E";

// Aircraft records ship without artwork, so cards fall back to this plane glyph.
const AIRCRAFT_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23dcecf1'/%3E%3Cpath d='M320 78l24 104 92 58v30l-92-28-8 56 32 24v22l-48-16-48 16v-22l32-24-8-56-92 28v-30l92-58z' fill='%23164e63'/%3E%3Ccircle cx='320' cy='78' r='11' fill='%23f97316'/%3E%3C/svg%3E";


const formatNumber = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—';

function FleetCard({ vessel, onSelect, status }) {
  const [imageSrc, setImageSrc] = useState(vessel.fleet_image || FALLBACK_IMAGE);


  const nationName = vessel.fleet_nation || vessel.country_name || vessel.nation || 'Nation not listed';
  const nationValue = String(vessel.fleet_nation_code || vessel.country_code || vessel.nation_code || nationName).trim();
  const nationCode = nationValue.length === 2
    ? nationValue.toLowerCase()
    : COUNTRY_CODE_BY_NAME[nationValue.toLowerCase()] || '';

  return (
    <article
      aria-label={`View details for ${vessel.Company_Name || 'unnamed vessel'}`}
      className="fleet-card"
      onClick={() => onSelect(vessel)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(vessel);
        }
      }}
      role="button"
      tabIndex="0"
    >
      <div className="fleet-card-image-wrap">
        <img
          alt={`${vessel.Company_Name || 'Fleet vessel'} vessel`}
          className="fleet-card-image"
          onError={() => setImageSrc(FALLBACK_IMAGE)}
          src={imageSrc}
        />
        <span className="fleet-card-type">{vessel.ship_name || 'Vessel'}</span>
        {status && (
          <span
            className={`fleet-card-status${status.busy ? ' at-sea' : ' ready'}`}
            title={status.title}
          >
            {status.label}
          </span>
        )}
      </div>
      <div className="fleet-card-content">
        <div className="fleet-card-heading">
          <div>
            <p className="fleet-card-kicker">FLEET VESSEL</p>
            <h2>{vessel.Company_Name || 'Unnamed vessel'}</h2>
          </div>
          <span
            aria-label={`Flag for ${nationName}`}
            className={`fleet-flag fi fi-${nationCode || 'xx'}`}
            title={nationName}
          />
        </div>
        <p className="fleet-card-nation">{nationName}</p>
        <dl className="fleet-card-details">
          <div><dt>Built</dt><dd>{vessel.built_year || '—'}</dd></div>
          <div><dt>Gross tonnage</dt><dd>{formatNumber(vessel.gt)}</dd></div>
          <div><dt>Deadweight</dt><dd>{formatNumber(vessel.dwt)}</dd></div>
          <div><dt>Dimensions</dt><dd>{vessel.length || '—'} × {vessel.width || '—'} m</dd></div>
        </dl>
      </div>
    </article>
  );
}

function AircraftCard({ aircraft: plane, onSelect }) {
  const nationName = plane.nation || 'Nation not listed';
  const nationCode = String(plane.nation_code || '').trim().toLowerCase();

  return (
    <article
      aria-label={`View details for ${plane.model || 'unnamed aircraft'}`}
      className="fleet-card aircraft-card"
      onClick={() => onSelect(plane)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(plane);
        }
      }}
      role="button"
      tabIndex="0"
    >
      <div className="fleet-card-image-wrap">
        <img
          alt={`${plane.model || 'Aircraft'} aircraft`}
          className="fleet-card-image"
          src={plane.fleet_image || AIRCRAFT_FALLBACK_IMAGE}
        />
        <span className="fleet-card-type">{plane.typecode || 'Aircraft'}</span>
      </div>
      <div className="fleet-card-content">
        <div className="fleet-card-heading">
          <div>
            <p className="fleet-card-kicker">AIRCRAFT</p>
            <h2>{plane.model || 'Unknown model'}</h2>
          </div>
          <span
            aria-label={`Flag for ${nationName}`}
            className={`fleet-flag fi fi-${nationCode || 'xx'}`}
            title={nationName}
          />
        </div>
        <p className="fleet-card-nation">{plane.manufacturer || 'Manufacturer not listed'}</p>
        <dl className="fleet-card-details">
          <div><dt>Engines</dt><dd>{plane.engines || '—'}</dd></div>
          <div><dt>Class</dt><dd>{plane.classLabel || plane.aircraftClass || '—'}</dd></div>
          <div><dt>Payload</dt><dd>{plane.payloadTonnes ? `${plane.payloadTonnes} t` : '—'}</dd></div>
          <div><dt>Price</dt><dd>{plane.price ? `$${formatNumber(plane.price)}` : '—'}</dd></div>
        </dl>
      </div>
    </article>
  );
}



const acquire = async (vessel) => {
  if (!api.isSignedIn()) {
    alert('Sign in to acquire vessels.');
    return;
  }

  try {
    await api.acquireVessel(vessel.id_vessel);
    console.log('Acquired', vessel.Company_Name);
  } catch (error) {
    alert(error.message);
  }
}

function VesselModal({ vessel, onClose }) {

  const [imageSrc, setImageSrc] = useState(vessel.fleet_image || FALLBACK_IMAGE);
  const nationName = vessel.fleet_nation || vessel.country_name || vessel.nation || 'Nation not listed';
  const nationValue = String(vessel.fleet_nation_code || vessel.country_code || vessel.nation_code || nationName).trim();
  const nationCode = nationValue.length === 2
    ? nationValue.toLowerCase()
    : COUNTRY_CODE_BY_NAME[nationValue.toLowerCase()] || '';

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fleet-modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-labelledby="vessel-modal-title"
        aria-modal="true"
        className="fleet-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="Close vessel details" className="fleet-modal-close" onClick={onClose} type="button">×</button>
        <div className="fleet-modal-image-wrap">
          <img
            alt={`${vessel.Company_Name || 'Fleet vessel'} vessel`}
            className="fleet-modal-image"
            onError={() => setImageSrc(FALLBACK_IMAGE)}
            src={imageSrc}
          />
        </div>
        <div className="fleet-modal-content">
          <p className="fleet-card-kicker">VESSEL SUMMARY</p>
          <div className="fleet-modal-title-row">
            <div>
              <h2 id="vessel-modal-title">{vessel.Company_Name || 'Unnamed vessel'}</h2>
              <p>{vessel.ship_name || 'Vessel type not listed'}</p>
            </div>
            <span
              aria-label={`Flag for ${nationName}`}
              className={`fleet-flag fi fi-${nationCode || 'xx'}`}
              title={nationName}
            />
          </div>
          <p className="fleet-modal-note">
            {vessel.Company_Name || 'This vessel'} is a {vessel.ship_name || 'registered vessel'} built in {vessel.built_year || 'an unknown year'}.
            It is registered to {nationName} and has a gross tonnage of {formatNumber(vessel.gt)}.
          </p>
          <dl className="fleet-modal-details">
            <div><dt>Registered nation</dt><dd>{nationName}</dd></div>
            <div><dt>Built year</dt><dd>{vessel.built_year || '—'}</dd></div>
            <div><dt>Gross tonnage</dt><dd>{formatNumber(vessel.gt)}</dd></div>
            <div><dt>Deadweight</dt><dd>{formatNumber(vessel.dwt)}</dd></div>
            <div><dt>Length</dt><dd>{vessel.length ? `${vessel.length} m` : '—'}</dd></div>
            <div><dt>Width</dt><dd>{vessel.width ? `${vessel.width} m` : '—'}</dd></div>
          </dl>
          <button class="action-button" style={{color: "#fff", "background-color": "#01bf46"}} onClick={() => {acquire(vessel)} }>Acquire</button>
        </div>
      </section>
    </div>
  );
}

function AircraftModal({ aircraft: plane, onClose }) {
  const nationName = plane.nation || 'Nation not listed';
  const nationCode = String(plane.nation_code || '').trim().toLowerCase();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fleet-modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-labelledby="aircraft-modal-title"
        aria-modal="true"
        className="fleet-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="Close aircraft details" className="fleet-modal-close" onClick={onClose} type="button">×</button>
        <div className="fleet-modal-image-wrap">
          <img
            alt={`${plane.model || 'Aircraft'} aircraft`}
            className="fleet-modal-image"
            src={plane.fleet_image || AIRCRAFT_FALLBACK_IMAGE}
          />
        </div>
        <div className="fleet-modal-content">
          <p className="fleet-card-kicker">AIRCRAFT SUMMARY</p>
          <div className="fleet-modal-title-row">
            <div>
              <h2 id="aircraft-modal-title">{plane.model || 'Unknown model'}</h2>
              <p>{plane.manufacturer || 'Manufacturer not listed'}</p>
            </div>
            <span
              aria-label={`Flag for ${nationName}`}
              className={`fleet-flag fi fi-${nationCode || 'xx'}`}
              title={nationName}
            />
          </div>
          <p className="fleet-modal-note">
            {plane.model || 'This aircraft'} is a {plane.aircraftClass || 'registered'} aircraft built by {plane.manufacturer || 'an unknown manufacturer'}.
            It is registered to {nationName} and is powered by {plane.engines || 'unknown engines'}.
          </p>
          <dl className="fleet-modal-details">
            <div><dt>Manufacturer</dt><dd>{plane.manufacturer || '—'}</dd></div>
            <div><dt>Typecode</dt><dd>{plane.typecode || '—'}</dd></div>
            <div><dt>Engines</dt><dd>{plane.engines || '—'}</dd></div>
            <div><dt>Aircraft class</dt><dd>{plane.classLabel || plane.aircraftClass || '—'}</dd></div>
            <div><dt>Payload</dt><dd>{plane.payloadTonnes ? `${plane.payloadTonnes} t` : '—'}</dd></div>
            <div><dt>Airframes in service</dt><dd>{formatNumber(plane.airframes)}</dd></div>
            <div><dt>Registered nation</dt><dd>{nationName}</dd></div>
          </dl>
          {plane.price ? (
            <button
              className="action-button"
              style={{ color: '#fff', backgroundColor: '#01bf46' }}
              onClick={() => { acquire(plane); }}
            >
              Acquire · ${formatNumber(plane.price)}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Fleet({ fleet = [] }) {
  const [fleetOwned, setFleetOwned] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVessel, setSelectedVessel] = useState(null);

  // The owned fleet comes from the backend, not from this tab: it survives a reload, and
  // a hull acquired anywhere in the game shows up here.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const owned = await ownedFleetFromDb();
        if (!cancelled) setFleetOwned(owned);
      } catch (error) {
        if (!cancelled) alert(error.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Whether a hull is in port or under way, straight from the live voyage state UI.js is
   * ticking — so the badge's ETA counts down while this screen is open.
   */
  const statusOf = (vessel) => {
    if (!fleetOwned.some((owned) => owned.id_vessel === vessel.id_vessel)) return null;

    const live = fleet.find((entry) => entry.vessel?.id_vessel === vessel.id_vessel);
    const air = vessel.kind === 'aircraft' || Boolean(live?.air);

    if (live?.busy) {
      return {
        busy: true,
        label: `${air ? 'In flight' : 'At sea'} · ETA ${formatDuration(live.etaMs)}`,
        title: `${air ? 'Flying' : 'Sailing'} to ${live.toPort.PORT_NAME}`,
      };
    }

    return {
      busy: false,
      label: air ? 'Ready to fly' : 'Ready to sail',
      title: air ? 'On the apron and ready for a route' : 'In port and ready for a route',
    };
  };

  const underway = fleetOwned
    .map((vessel) => ({ vessel, status: statusOf(vessel) }))
    .filter((entry) => entry.status?.busy);
  const nextArrivalMs = fleet
    .filter((entry) => entry.busy)
    .reduce((soonest, entry) => (soonest === null || entry.etaMs < soonest ? entry.etaMs : soonest), null);


  const filteredAircraft = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return aircraft;

    return aircraft.filter((aircraft) =>
      [
        aircraft.model,
        aircraft.manufacturer,
        aircraft.engines,
        aircraft.fleet_nation,
        aircraft.nation,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    );
  }, [searchTerm]);

  const filteredVessels = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return vessels;

    return vessels.filter((vessel) =>
      [
        vessel.Company_Name,
        vessel.ship_name,
        vessel.built_year,
        vessel.fleet_nation,
        vessel.country_name,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    );
  }, [searchTerm]);

  return (
    <main className="fleet-screen" aria-label="Fleet database">
      <header className="fleet-header">
        <div>
          <p className="fleet-kicker">MARITIME DATABASE</p>
          <h1>Transportation structure directory</h1>
          <p className="fleet-summary">Browse vessel records, specifications, and registered nations.</p>
        </div>



        <div className="fleet-count" aria-live="polite">
          <strong>{filteredVessels.length + filteredAircraft.length}</strong>
          <span>transports</span>
        </div>
      </header>

        <div className='fleet-owned'>

          {fleetOwned.length > 0 ? (
            <section className="fleet-owned-grid" >
              <h1>Fleet owned</h1>
              <p className="fleet-owned-summary">
                {fleetOwned.length - underway.length} ready · {underway.length} under way
                {nextArrivalMs !== null ? ` · next arrival in ${formatDuration(nextArrivalMs)}` : ''}
              </p>
              {fleetOwned.map((vessel, index) => (
                vessel.kind === 'aircraft' ? (
                  <AircraftCard
                    aircraft={vessel}
                    key={`${vessel.Company_Name || 'aircraft'}-${index}`}
                    onSelect={setSelectedVessel}
                  />
                ) : (
                  <FleetCard
                    key={`${vessel.Company_Name || 'vessel'}-${index}`}
                    onSelect={setSelectedVessel}
                    status={statusOf(vessel)}
                    vessel={vessel}
                  />
                )
              ))}
            </section>
          ) : <div>
            <h1>You dont own any boat</h1>
            </div>}
        </div>

      <label className="fleet-search" htmlFor="fleet-search-input">
        <span className="fleet-search-icon" aria-hidden="true">⌕</span>
        <input
          id="fleet-search-input"
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by vessel, type, year, or nation..."
          type="search"
          value={searchTerm}
        />
        {searchTerm && (
          <button aria-label="Clear fleet search" className="fleet-search-clear" onClick={() => setSearchTerm('')} type="button">
            ×
          </button>
        )}
      </label>

      {/* Both catalogs render together: the directory lists hulls and aircraft, so a
          search that matches only aircraft still fills the screen. */}
      {filteredVessels.length > 0 && (
        <section className="fleet-grid" aria-label="Fleet results">
          {filteredVessels.map((vessel, index) => (
            <FleetCard
              key={`${vessel.Company_Name || 'vessel'}-${index}`}
              onSelect={setSelectedVessel}
              vessel={vessel}
            />
           ))}
        </section>
      )}

      {filteredAircraft.length > 0 && (
        <section className="aircraft-grid" aria-label="Aircraft results">
          {filteredAircraft.map((plane, index) => (
            <AircraftCard
              key={`${plane.model || 'aircraft'}-${index}`}
              aircraft={plane}
              onSelect={setSelectedVessel}
            />
           ))}
        </section>
      )}

      {filteredVessels.length === 0 && filteredAircraft.length === 0 && (
        <section className="fleet-empty" aria-live="polite">
          <span aria-hidden="true">⌕</span>
          <h2>No structure found</h2>
          <p>Try searching for a different structure name, type, year, or nation.</p>
        </section>
      )}
      {selectedVessel && (
        selectedVessel.typecode ? (
          <AircraftModal aircraft={selectedVessel} onClose={() => setSelectedVessel(null)} />
        ) : (
          <VesselModal onClose={() => setSelectedVessel(null)} vessel={selectedVessel} />
        )
      )}
    </main>
  );
}

export default Fleet;
