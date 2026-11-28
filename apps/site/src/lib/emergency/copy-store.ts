import { remove, SNAPSHOTS } from '../training/idb';
import { loadSnapshot, saveSnapshot, type Snapshot } from '../training/snapshot';
import type { EmergencyCopy } from './copy';

// The phone's copy, in the same IndexedDB store as the registrar's snapshots.

const KEY = 'emergency-contacts';

export const saveCopy = (copy: EmergencyCopy): Promise<void> => saveSnapshot(KEY, copy);

export const loadCopy = (): Promise<Snapshot<EmergencyCopy> | undefined> => loadSnapshot<EmergencyCopy>(KEY);

export const forgetCopy = (): Promise<void> => remove(SNAPSHOTS, KEY);
