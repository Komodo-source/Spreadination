import React, { useEffect, useMemo, useRef, useState } from 'react';
import Map from './map';
import NavigationPanel from './NavigationPanel';
import Fleet from './Fleet';
import portsData from './assets/ports.json';
import vesselsData from './assets/vessels.json';
import './App.css';
import "flag-icons/css/flag-icons.min.css";
import * as api from './api';
import { navigate } from './router';
import { NAVIGATION_TICK_MS, formatDuration } from './geo';
import { seaRoute } from './seaRoute';
import Research, { EMPTY_RESEARCH, PORT_TECHNOLOGIES, nextLevelCost, techLevel } from './Research';
import { STARTER_VESSEL, STARTER_VESSEL_ID, ownedFleetFromDb, vesselById } from './vesselData';
import { airRoute } from './aircraftData';
import { REAL_TRADE_BONUS_SHARE, hullPrice, resolveVoyage } from './voyage';

const BASE_MONEY = 5000;
const BASE_PORTS = 0;

const RESEARCH_STORAGE_KEY = 'sea-builder.research';

function loadResearchProgress() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RESEARCH_STORAGE_KEY) ?? 'null');
    const levels = PORT_TECHNOLOGIES.reduce((result, technology) => {
      result[technology.id] = techLevel(stored?.levels, technology.id);
      return result;
    }, {});
    const points = Number(stored?.points);

    return { levels, points: Number.isFinite(points) && points > 0 ? Math.floor(points) : 0 };
  } catch (error) {
    console.warn('Ignoring unreadable research progress:', error.message);
    return { levels: { ...EMPTY_RESEARCH }, points: 0 };
  }
}

function saveResearchProgress({ levels, points }) {
  try {
    window.localStorage.setItem(RESEARCH_STORAGE_KEY, JSON.stringify({ levels, points }));
  } catch (error) {
    console.warn('Could not save research progress:', error.message);
  }
}

const portCost = (port) => {
  switch (port.HARBORSIZE) {
    case 'L': return 5000;
    case 'M': return 3000;
    case 'S': return 1000;
    case 'V': return 500;
    default: return 1000;
  }
};

function UI() {
  const [money, setMoney] = useState(BASE_MONEY);
  const [moneyUnits, setMoneyUnits] = useState('');
  const [portsCount, setPortsCount] = useState(BASE_PORTS);
  const [activeTab, setActiveTab] = useState('Ports');
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipMode, setTooltipMode] = useState(null); // null, 'claim-port', 'build-vessel', 'navigation'
  const [claimedPorts, setClaimedPorts] = useState([]); // array of port id_port values
  // Every player starts with the simple test boat (see vesselData.js), so a new game can
  // sail without a purchase. Offline it is simply the initial state; signed in, the load
  // effect below asks the backend for it once.
  const [builtVessels, setBuiltVessels] = useState(() => (STARTER_VESSEL ? [STARTER_VESSEL] : []));
  // One entry per occupied vessel: { id, fromPort, toPort, ship, good, distanceKm,
  // durationMs, realTrade, startedAt, progress }. The fleet can have several under way at
  // once, so this is a list rather than a single route.
  const [voyages, setVoyages] = useState([]);
  const [research, setResearch] = useState(loadResearchProgress);

  // Dedupes delivery: React may run the completion effect more than once for the same
  // voyage, and a crossing must only ever pay out once.
  const deliveredVoyageIds = useRef(new Set());

  const signedIn = api.isSignedIn();

  useEffect(() => {
    saveResearchProgress(research);
  }, [research]);

  // Restore the saved game from the backend once, when signed in.
  useEffect(() => {
    if (!signedIn) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const [savedMoney, savedPorts, savedVessels, savedMoneyUnits] = await Promise.all([
          api.getMoney(),
          api.listPorts(),
          api.listVessels(),
          api.getMoneyUnits(),
        ]);

        if (cancelled) return;

        setMoney(savedMoney);
        setMoneyUnits(savedMoneyUnits);
        setClaimedPorts(savedPorts);

        // Every account is granted the simple test boat, so travel works from the first
        // login without buying a hull. The backend is asked to persist it, but the boat is
        // given locally either way: a server that has not been seeded yet should not take
        // the one thing a new game needs away.
        let vesselIds = savedVessels;

        if (STARTER_VESSEL && !vesselIds.includes(STARTER_VESSEL_ID)) {
          try {
            await api.acquireVessel(STARTER_VESSEL_ID);
          } catch (error) {
            console.warn('Could not persist the starter test boat:', error.message);
          }

          vesselIds = [...vesselIds, STARTER_VESSEL_ID];
        }

        if (cancelled) return;

        // vesselIds are the backend's player_vessel rows (plus the starter boat): the
        // catalog turns each id into the hull the navigation panel dispatches.
        setBuiltVessels(vesselIds.map((id) => vesselById(id)).filter(Boolean));
        setPortsCount(BASE_PORTS + savedPorts.length);
      } catch (error) {
        console.error('Could not load saved game state:', error.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  // Tooltip handlers
  const openTooltip = (mode) => {
    setTooltipVisible(true);
    setTooltipMode(mode);
  };

  const closeTooltip = () => {
    setTooltipVisible(false);
    setTooltipMode(null);
  };

  // Claim a port
  const claimPort = async (port) => {
    const cost = portCost(port);

    if (money < cost) {
      alert('Not enough money!');
      return;
    }

    try {
      if (signedIn) {
        await api.claimPort(port.id_port);
        setMoney(await api.addMoney(-cost));
      } else {
        setMoney(money - cost);
      }

      setClaimedPorts([...claimedPorts, port.id_port]);
      setPortsCount(prev => prev + 1);
      closeTooltip();
    } catch (error) {
      alert(error.message);
    }
  };

  // Build a vessel
  const buildVessel = async (vessel) => {
    // The directory lists every catalog hull, owned ones included, so guard against
    // paying a second time for a ship already in the fleet — the starter boat especially.
    if (builtVessels.some((owned) => owned.id_vessel === vessel.id_vessel)) {
      alert(`${vessel.Company_Name} (${vessel.ship_name}) is already in your fleet.`);
      return;
    }

    const cost = hullPrice(vessel.gt);

    if (money < cost) {
      alert('Not enough money!');
      return;
    }

    try {
      if (signedIn) {
        await api.acquireVessel(vessel.id_vessel);
        setMoney(await api.addMoney(-cost));
        setBuiltVessels(await ownedFleetFromDb());
      } else {
        setMoney(money - cost);
        setBuiltVessels([...builtVessels, vessel]);
      }

      closeTooltip();
    } catch (error) {
      alert(error.message);
    }
  };

  // Dev shortcut: clicking the money readout adds 1000.
  const addDebugMoney = () => {
    if (signedIn) {
      api.addMoney(1000).then(setMoney).catch((error) => console.error(error.message));
    } else {
      setMoney(prev => prev + 1000);
    }
  };

  // Buy the next level of a port technology with research points.
  const buyTechnology = (id) => {
    const cost = nextLevelCost(research.levels, id);

    if (cost === null) return;

    if (cost > research.points) {
      alert(`Not enough research points: ${cost} needed, ${research.points} available.`);
      return;
    }

    setResearch((current) => ({
      points: current.points - cost,
      levels: { ...current.levels, [id]: techLevel(current.levels, id) + 1 },
    }));
  };

  /**
   * Dispatch a voyage or flight planned in the navigation panel.
   *
   * The panel already blocks the obvious dead ends, but this is the authoritative
   * check: it is the side that holds the money and the fleet, and it is reachable without
   * the panel. Only the transport's own occupancy stops a dispatch — the rest of the fleet
   * keeps sailing or flying. A ship must leave a port the player owns; an aircraft leaves
   * any airport, because airports are public infrastructure.
   */
  const startVoyage = async ({ fromPort, toPort, ship, good, realTrade, mode }) => {
    const airborne = mode === 'air';

    // Ports are claimable and a voyage has to leave one you own; airports are public, so a
    // flight needs no infrastructure claim at all — just an aircraft.
    if (!airborne && !claimedPorts.includes(fromPort.id_port)) {
      alert('You must own the departure port to sail from it.');
      return;
    }

    if (voyages.some((voyage) => voyage.ship.id_vessel === ship.id_vessel)) {
      alert(
        `${ship.Company_Name} is already ${airborne ? 'in flight' : 'at sea'}. Give the route to a ${airborne ? 'ready aircraft' : 'vessel that is in port'}.`
      );
      return;
    }

    const shipOwned = builtVessels.some((vessel) => vessel.id_vessel === ship.id_vessel);
    const cost = shipOwned ? 0 : (airborne ? ship.price : hullPrice(ship.gt));

    if (cost > money) {
      alert(`Not enough money for this ${airborne ? 'aircraft' : 'hull'}: $${cost.toLocaleString()} needed.`);
      return;
    }

    // The course is worked out once, here, and kept on the voyage: the map draws exactly
    // this line, the timer is paid off it, and the panel quoted its distance. A ship's route
    // comes from the sea grid; a flight is the direct great circle over whatever lies between.
    // One route, no drift between the three.
    const { distanceKm, points: route } = airborne ? airRoute(fromPort, toPort) : seaRoute(fromPort, toPort);

    const { durationMs } = resolveVoyage({
      cargoValueK: good.value,
      distanceKm,
      lossRoll: 100,
      realTrade,
      research: research.levels,
      air: airborne,
    });

    try {
      if (cost > 0) {
        if (signedIn) {
          await api.acquireVessel(ship.id_vessel);
          setMoney(await api.addMoney(-cost));
          setBuiltVessels(await ownedFleetFromDb());
        } else {
          setMoney((current) => current - cost);
          setBuiltVessels((current) => [...current, ship]);
        }
      }

      setVoyages((current) => [
        ...current,
        {
          id: `${ship.id_vessel}-${Date.now()}`,
          air: airborne,
          fromPort,
          toPort,
          ship,
          good,
          distanceKm,
          durationMs,
          realTrade: Boolean(realTrade),
          route,
          // Wall-clock start: progress is derived from it, so a slow frame, a zoom or a
          // trip to another tab cannot make the crossing take longer than it should.
          startedAt: performance.now(),
          progress: 0,
        },
      ]);
    } catch (error) {
      alert(error.message);
    }
  };

  /** Calls off one vessel's crossing and puts that hull back in port. */
  const cancelVoyage = (id) => {
    setVoyages((current) => current.filter((voyage) => voyage.id !== id));
  };

  // Advance every occupied vessel from wall-clock time rather than a fixed step per tick,
  // so a crossing takes as long as its distance says it should. One interval drives the
  // whole fleet — rather than one timer each — and the timer only runs while something is
  // still under way. Driving it from an effect means cancelling really does stop it, and
  // StrictMode's double-invoked updaters cannot double the progress.
  useEffect(() => {
    if (voyages.length === 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      const now = performance.now();

      setVoyages((current) =>
        current.map((voyage) =>
          voyage.progress >= 100
            ? voyage
            : {
                ...voyage,
                progress: Math.min(100, ((now - voyage.startedAt) / voyage.durationMs) * 100),
              }
        )
      );
    }, NAVIGATION_TICK_MS);

    return () => clearInterval(timer);
  }, [voyages.length]);

  // Deliver every cargo that has arrived, exactly once, and pay the fleet's freight for
  // the crossing in one go.
  useEffect(() => {
    const arrived = voyages.filter(
      (voyage) => voyage.progress >= 100 && !deliveredVoyageIds.current.has(voyage.id)
    );

    if (arrived.length === 0) {
      return;
    }

    arrived.forEach((voyage) => deliveredVoyageIds.current.add(voyage.id));
    setVoyages((current) => current.filter((voyage) => !deliveredVoyageIds.current.has(voyage.id)));

    const settled = arrived.map((voyage) => ({
      voyage,
      outcome: resolveVoyage({
        cargoValueK: voyage.good.value,
        distanceKm: voyage.distanceKm,
        research: research.levels,
        lossRoll: Math.random() * 100,
        realTrade: voyage.realTrade,
        // Settled with the same rules it was dispatched under: an air delivery pays air
        // rates, not the sea rates a missing flag would fall back to.
        air: Boolean(voyage.air),
      }),
    }));

    const totalReward = settled.reduce((sum, { outcome }) => sum + outcome.reward, 0);
    const totalPoints = settled.reduce((sum, { outcome }) => sum + outcome.points, 0);

    setResearch((current) => ({ ...current, points: current.points + totalPoints }));

    (async () => {
      try {
        if (signedIn) {
          await api.addMoney(totalReward);
          setMoney(await api.getMoney()); // Refresh money from backend
        } else {
          setMoney((current) => current + totalReward);
        }
      } catch (error) {
        console.error('Error adding reward money:', error.message);
      }
    })();

    alert(
      settled
        .map(({ voyage, outcome }) =>
          [
            `${voyage.good.description} delivered to ${voyage.toPort.PORT_NAME}.`,
            outcome.realTrade
              ? `Real trade bonus ${Math.round(REAL_TRADE_BONUS_SHARE * 100)}%: +$${outcome.bonus.toLocaleString()}.`
              : null,
            outcome.lost
              ? `Cargo was hit in transit: -$${outcome.lostAmount.toLocaleString()}.`
              : 'The cargo arrived intact.',
            `Freight earned: $${outcome.reward.toLocaleString()}.`,
            `Research: +${outcome.points} points.`,
          ]
            .filter(Boolean)
            .join('\n')
        )
        .join('\n\n')
    );
  }, [research.levels, signedIn, voyages]);

  /**
   * Live per-vessel status: every hull the backend says the player owns, paired with the
   * voyage occupying it (if any) and how long that voyage has left to run.
   *
   * Re-derived from `voyages` on every progress tick, so the ETA in the top bar counts
   * down with the ships rather than being frozen at the moment the trip started.
   */
  const fleet = useMemo(
    () =>
      builtVessels.map((vessel) => {
        const voyage = voyages.find((entry) => entry.ship.id_vessel === vessel.id_vessel) ?? null;

        return {
          vessel,
          voyage,
          busy: Boolean(voyage),
          air: Boolean(voyage?.air),
          toPort: voyage ? voyage.toPort : null,
          etaMs: voyage ? Math.max(0, voyage.durationMs * (1 - voyage.progress / 100)) : null,
        };
      }),
    [builtVessels, voyages]
  );

  const atSea = fleet.filter((entry) => entry.busy);
  const readyShips = fleet.length - atSea.length;
  const nextArrivalMs = atSea.reduce(
    (soonest, entry) => (soonest === null || entry.etaMs < soonest ? entry.etaMs : soonest),
    null
  );
  // One line per hull, for the readout's hover text: the same information the fleet
  // screen's cards carry, without leaving the map.
  const fleetTitle = fleet
    .map((entry) =>
      entry.busy
        ? `${entry.vessel.Company_Name} — ${entry.air ? 'in flight to' : 'at sea to'} ${entry.toPort.PORT_NAME}, ETA ${formatDuration(entry.etaMs)}`
        : `${entry.vessel.Company_Name} — ready to ${entry.vessel.kind === 'aircraft' ? 'fly' : 'sail'}`
    )
    .join('\n');

  const renderContent = () => {
    switch (activeTab) {
      case 'Research':
        return (
          <Research
            onBuy={buyTechnology}
            points={research.points}
            research={research.levels}
          />
        );
      case 'Structure':
        return <Fleet fleet={fleet} />;
      default:
        return (
          <>
            <Map
              claimedPorts={claimedPorts}
              onClaimPort={claimPort}
              voyages={voyages}
            />
            {voyages.length > 0 && (
              <div className="navigation-info">
                <h3>
                  {voyages.length === 1 ? 'Voyage in progress' : `${voyages.length} voyages in progress`}
                </h3>
                {voyages.map((voyage) => (
                  <div className="navigation-voyage" key={voyage.id}>
                    <p>{voyage.fromPort.PORT_NAME} → {voyage.toPort.PORT_NAME}</p>
                    <p>
                      {voyage.ship.Company_Name} · {voyage.good.description}
                      {voyage.air ? ' · air' : ''}
                      {voyage.realTrade ? ' · real trade' : ''}
                    </p>
                    <p>
                      {Math.round(voyage.progress)}% ·{' '}
                      {Math.max(0, Math.round(voyage.distanceKm * (1 - voyage.progress / 100))).toLocaleString()} km to run
                    </p>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => cancelVoyage(voyage.id)}>
                      Cancel voyage
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        );
    }
  };

  // Filter ports that are not claimed
  const unclaimedPorts = portsData.filter(port => !claimedPorts.includes(port.id_port));

  return (
    <div className="app">
      <div className="top-bar">
        <div className="money" onClick={addDebugMoney}>
          ${money.toLocaleString()} {moneyUnits}
        </div>
        <div
          className="Vessels"
          onClick={() => openTooltip('build-vessel')}
          title={fleetTitle || 'You do not own any vessels yet'}
        >
          Fleet: {builtVessels.length}
          {fleet.length > 0 && (
            <span className="vessel-status">
              <span className="vessel-status-ready">{readyShips} ready</span>
              <span className={atSea.length > 0 ? 'vessel-status-sea' : 'vessel-status-ready'}>
                {atSea.length} under way
              </span>
              {nextArrivalMs !== null && (
                <span className="vessel-status-eta">next arrival {formatDuration(nextArrivalMs)}</span>
              )}
            </span>
          )}
        </div>
        <div className="ports" onClick={() => openTooltip('claim-port')}>
          Ports: {portsCount}
        </div>
        <div className="navigation" onClick={() => openTooltip('navigation')}>
          Navigation
        </div>
        <div className="home" onClick={() => navigate('/')} title="Back to the home screen">
          Home
        </div>
      </div>
      <div className="map-container">
        {renderContent()}
      </div>
      <div className="bottom-bar">
        <div
          className={`tab ${activeTab === 'Ports' ? 'active' : ''}`}
          onClick={() => setActiveTab('Ports')}
        >
          Ports
        </div>

        <div
          className={`tab ${activeTab === 'Structure' ? 'active' : ''}`}
          onClick={() => setActiveTab('Structure')}
        >
          Structure
        </div>

        <div
          className={`tab ${activeTab === 'Trade' ? 'active' : ''}`}
          onClick={() => setActiveTab('Trade')}
        >
          Trade
        </div>
        <div
          className={`tab ${activeTab === 'Research' ? 'active' : ''}`}
          onClick={() => setActiveTab('Research')}
        >
          Research
        </div>
        <div
          className={`tab ${activeTab === 'Company' ? 'active' : ''}`}
          onClick={() => setActiveTab('Company')}
        >
          Company
        </div>
      </div>

      {/* Tooltip */}
      {tooltipVisible && (
        <div className="tooltip-overlay" onClick={closeTooltip}>
          <div className="tooltip-content" onClick={e => e.stopPropagation()}>
            {tooltipMode === null ? (
              <div>
                <h3>What would you like to do?</h3>
                <button className="tooltip-btn" onClick={() => openTooltip('claim-port')}>
                  Claim Port
                </button>
                <button className="tooltip-btn" onClick={() => openTooltip('build-vessel')}>
                  Build Vessel
                </button>
                <button className="tooltip-btn" onClick={() => openTooltip('navigation')}>
                  Navigation
                </button>
              </div>
            ) : tooltipMode === 'claim-port' ? (
              <div>
                <h3>Select a Port to Claim</h3>
                {unclaimedPorts.map(port => (
                  <div
                    key={port.id_port}
                    className="tooltip-port"
                    onClick={() => claimPort(port)}
                  >
                    <h4>{port.PORT_NAME}, {port.COUNTRY}</h4>
                    <p>Harbor Size: {port.HARBORSIZE}</p>
                  </div>
                ))}
                <button className="tooltip-btn" onClick={closeTooltip}>
                  Cancel
                </button>
              </div>
            ) : tooltipMode === 'build-vessel' ? (
              <div>
                <h3>Select a Vessel to Build</h3>
                {vesselsData.map(vessel => (
                  <div
                    key={vessel.id_vessel}
                    className="tooltip-vessel"
                    onClick={() => buildVessel(vessel)}
                  >
                    <h4>{vessel.ship_name} ({vessel.Company_Name})</h4>
                    <p>Type: {vessel.ship_name.split(' ')[0]}</p>
                    <p>GT: {vessel.gt.toLocaleString()}</p>
                    <p>Price: ${hullPrice(vessel.gt).toLocaleString()}</p>
                  </div>
                ))}
                <button className="tooltip-btn" onClick={closeTooltip}>
                  Cancel
                </button>
              </div>
            ) : tooltipMode === 'navigation' ? (
              <NavigationPanel
                fleet={fleet}
                money={money}
                onClose={closeTooltip}
                onStart={startVoyage}
                ownedPortIds={claimedPorts}
                research={research.levels}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default UI;
