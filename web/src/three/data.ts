// Plain data shared by the 3D scenes and the page sections. No three.js import here, so the page can use it
// without downloading the 3D engine.

export type Quality = 'high' | 'low'
export type GunId = 'pistol' | 'rifle' | 'smg' | 'awm'
type V3 = [number, number, number]

// A CONCEPT layout of the ARENA11 training ground. Move these to match the real arena once a floor plan arrives.
export const LAYOUT = {
  size: { x: 46, z: 32 },
  redBase: { x: -19, z: 0 },
  blueBase: { x: 19, z: 0 },
  watchtower: { x: 13, z: -11 },
  prepArea: { x: -13, z: 12 },
  entrance: { x: 0, z: 16 },
}

/**
 * ARENA11's four blasters, in display order. `id` is the kit gun slot shared with the server and firmware
 * (pistol = 0, rifle = 1, smg = 2, awm = 3); the slot names are historical, the names below are what players see.
 * `model` picks the 3D concept model for "Inspect 3D". `supplied` marks images ARENA11 supplied (not concept renders).
 */
export const WEAPONS: { id: GunId; name: string; damage: number; role: string; blurb: string; shotsToKill: number; fireMode: string; image: string; supplied: boolean; model: GunId }[] = [
  { id: 'rifle', name: 'AR15', damage: 25, role: 'Assault rifle', blurb: 'Tan AR15 with an optic. The all-rounder: steady damage at every range the arena has.', shotsToKill: 4, fireMode: 'Semi / Auto', image: '/media/gun-rifle.webp', supplied: true, model: 'rifle' },
  { id: 'awm', name: 'Tactical M4', damage: 25, role: 'Assault rifle', blurb: 'Black M4 with a suppressor, red dot and magnifier. Same punch as the AR15, built for longer lanes.', shotsToKill: 4, fireMode: 'Semi / Auto', image: '/media/gun-m4-tactical.webp', supplied: true, model: 'rifle' },
  { id: 'smg', name: 'Vector', damage: 15, role: 'SMG', blurb: 'Compact and fast. Lower damage per hit, highest pressure. Built for container corners.', shotsToKill: 7, fireMode: 'Auto', image: '/media/gun-smg.webp', supplied: true, model: 'smg' },
  { id: 'pistol', name: 'UMP45', damage: 15, role: 'SMG', blurb: 'Folding-stock SMG with a foregrip. Keep moving and keep the pressure on.', shotsToKill: 7, fireMode: 'Auto', image: '/media/gun-ump.webp', supplied: true, model: 'smg' },
]

/** Named camera stops for the walkthrough, in order: camera position and look-at target in metres. */
export const TOUR_STOPS: { id: string; title: string; caption: string; pos: V3; look: V3; hold: number }[] = [
  { id: 'aerial', title: 'Aerial approach', caption: 'The full arena from above: two bases, one contested centre.', pos: [-4, 30, 30], look: [0, 0, -1], hold: 5 },
  { id: 'descent', title: 'Drone descent', caption: 'Dropping in over the entrance gate.', pos: [2, 18, 30], look: [0, 0, 4], hold: 4.5 },
  { id: 'wide', title: 'The battlefield', caption: 'Containers, sandbag nests and barricades break every sight line.', pos: [-20, 9, 18], look: [2, 0, -2], hold: 5 },
  { id: 'cover', title: 'Barricade flyover', caption: 'Low over the sandbag walls and jersey barriers.', pos: [-9, 2.2, 8], look: [4, 0.8, -4], hold: 4.5 },
  { id: 'tower', title: 'Watchtower', caption: 'The overwatch post. High ground, no cover from the back.', pos: [6, 6.5, -4], look: [13, 5, -11], hold: 4.5 },
  { id: 'lanes', title: 'Movement lanes', caption: 'Flanking routes run between the container rows.', pos: [-1, 1.8, 14], look: [0, 1, -12], hold: 4.5 },
  { id: 'red', title: 'Red zone', caption: 'RED WOLVES deploy from the west base.', pos: [-11, 3.2, 6], look: [-19, 1, 0], hold: 4 },
  { id: 'blue', title: 'Blue zone', caption: 'BLUE FALCONS deploy from the east base.', pos: [11, 3.2, -6], look: [19, 1, 0], hold: 4 },
  { id: 'prep', title: 'Equipment prep', caption: 'Kits are issued and checked here before every mission.', pos: [-7, 3, 18], look: [-13, 1, 11], hold: 4 },
  { id: 'entrance', title: 'Main gate', caption: 'The ARENA11 board between two watchtowers. Marshals check every player in and out.', pos: [0, 2.2, 28], look: [0, 4.2, 16], hold: 4.5 },
]

/** Walkthrough scenes on the home page, in order. Images are rendered from SHOTS in walkthrough.ts. */
export const ARENA_SCENES: { id: string; code: string; title: string; caption: string }[] = [
  { id: 'gate', code: 'Gate', title: 'The main gate', caption: 'Your mission starts under the ARENA11 board, flanked by two watchtowers. Marshals check every kit at the line.' },
  { id: 'sandbags', code: 'Cover', title: 'Sandbag nests', caption: 'Chest-high sandbag walls ring the forward positions. Hold them or flank them.' },
  { id: 'tyres', code: 'Obstacles', title: 'Tyres and drums', caption: 'Tyre stacks and oil drums break the sight lines in the mid field and make every corner a gamble.' },
  { id: 'pallets', code: 'Approach', title: 'Pallets and camo', caption: 'Pallet barricades and camouflage nets cover the approach. Move fast between them.' },
  { id: 'tower', code: 'Overwatch', title: 'The watchtower', caption: 'High ground with a long view of the field, and nowhere to hide from the back.' },
  { id: 'bases', code: 'Deploy', title: 'Team bases', caption: 'RED WOLVES deploy from the west base and BLUE FALCONS from the east. Respawn here after 8 seconds.' },
]
