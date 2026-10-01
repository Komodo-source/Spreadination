import { catalogUuid } from './api';
import { STARTER_VESSEL, STARTER_VESSEL_ID, ownedFleetFromDb, vesselById } from './vesselData';

describe('vessel catalog joins', () => {
  it('resolves hulls by catalog id, and nothing for an unknown one', () => {
    expect(vesselById(STARTER_VESSEL_ID)).toBe(STARTER_VESSEL);
    expect(vesselById(99999)).toBeNull();
    expect(vesselById(undefined)).toBeNull();
  });

  it('points the starter boat at the id the backend seed grants', () => {
    // The auto-grant writes player_vessel.vessel_id = catalogUuid(STARTER_VESSEL_ID). If
    // this ever drifts from the seed the insert fails on the foreign key, and the boat is
    // only ever owned locally.
    expect(STARTER_VESSEL).not.toBeNull();
    expect(catalogUuid(STARTER_VESSEL_ID)).toBe('00000000-0000-4000-8000-0000000000c9');
  });

  it('reads an empty fleet when nobody is signed in', async () => {
    // So callers can use it unconditionally, without a session guard of their own.
    await expect(ownedFleetFromDb()).resolves.toEqual([]);
  });
});
