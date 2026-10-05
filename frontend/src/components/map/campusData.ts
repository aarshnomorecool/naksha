// Placeholder campus geometry, ported from map-demo/campus-map-demo.html so
// the standalone demo and the React app agree visually. Hand-authored
// rectangles, NOT traced from satellite imagery — replace by digitizing real
// building footprints in QGIS/geojson.io. Coordinates match supabase/seed.sql.

export const CAMPUS_CENTER: [number, number] = [79.0882, 21.1458]

export interface Building {
  id: string
  name: string
  shortLabel: string
  height: number
  // Storeys drawn on the map. Raised automatically if a classroom sits on a
  // higher floor (see floorCount in campusGeometry.ts).
  floors: number
  ring: [number, number][]
}

// Rings match supabase/seed.sql's buildings.footprint exactly — classrooms are
// grouped by building *name*, so a ring under the wrong name puts that
// building's rooms in someone else's footprint.
export const BUILDINGS: Building[] = [
  { id: 'main-academic', name: 'Main Academic Block', shortLabel: 'B-1', height: 14, floors: 3, ring: [[79.08682, 21.14646], [79.08718, 21.14646], [79.08718, 21.14674], [79.08682, 21.14674]] },
  { id: 'library', name: 'Library', shortLabel: 'B-2', height: 14, floors: 2, ring: [[79.08802, 21.14646], [79.08838, 21.14646], [79.08838, 21.14674], [79.08802, 21.14674]] },
  { id: 'cs-block', name: 'Computer Science Block', shortLabel: 'B-3', height: 14, floors: 3, ring: [[79.08922, 21.14646], [79.08958, 21.14646], [79.08958, 21.14674], [79.08922, 21.14674]] },
  { id: 'admin', name: 'Administration Block', shortLabel: 'B-4', height: 14, floors: 2, ring: [[79.08682, 21.14486], [79.08718, 21.14486], [79.08718, 21.14514], [79.08682, 21.14514]] },
  { id: 'cafeteria', name: 'Cafeteria', shortLabel: 'Cafeteria', height: 14, floors: 1, ring: [[79.08802, 21.14486], [79.08838, 21.14486], [79.08838, 21.14514], [79.08802, 21.14514]] },
  { id: 'hostel', name: 'Hostel Block', shortLabel: 'Hostel', height: 14, floors: 4, ring: [[79.08922, 21.14486], [79.08958, 21.14486], [79.08958, 21.14514], [79.08922, 21.14514]] },
]

export interface ClassroomSeed {
  id: string
  building: string
  room: string
  floor: number
  capacity: number
  lng: number
  lat: number
}

export const CLASSROOMS: ClassroomSeed[] = [
  { id: 'r101', building: 'Main Academic Block', room: '101', floor: 1, capacity: 70, lng: 79.08688, lat: 21.14650 },
  { id: 'r102', building: 'Main Academic Block', room: '102', floor: 1, capacity: 70, lng: 79.08694, lat: 21.14650 },
  { id: 'r103', building: 'Main Academic Block', room: '103', floor: 1, capacity: 60, lng: 79.08700, lat: 21.14650 },
  { id: 'r201', building: 'Main Academic Block', room: '201', floor: 2, capacity: 65, lng: 79.08690, lat: 21.14668 },
  { id: 'r202', building: 'Main Academic Block', room: '202', floor: 2, capacity: 65, lng: 79.08706, lat: 21.14668 },
  { id: 'cs101', building: 'Computer Science Block', room: 'CS-101', floor: 1, capacity: 40, lng: 79.08928, lat: 21.14650 },
  { id: 'cs102', building: 'Computer Science Block', room: 'CS-102', floor: 1, capacity: 40, lng: 79.08934, lat: 21.14650 },
  { id: 'cs201', building: 'Computer Science Block', room: 'CS-201', floor: 2, capacity: 45, lng: 79.08940, lat: 21.14650 },
  { id: 'cslab1', building: 'Computer Science Block', room: 'CS-Lab-1', floor: 1, capacity: 35, lng: 79.08930, lat: 21.14668 },
  { id: 'cslab2', building: 'Computer Science Block', room: 'CS-Lab-2', floor: 2, capacity: 35, lng: 79.08946, lat: 21.14668 },
  { id: 'lib-reading', building: 'Library', room: 'Reading Hall', floor: 1, capacity: 100, lng: 79.08808, lat: 21.14656 },
  { id: 'lib-ref', building: 'Library', room: 'Reference Section', floor: 1, capacity: 50, lng: 79.08820, lat: 21.14656 },
  { id: 'lib-digital', building: 'Library', room: 'Digital Library', floor: 2, capacity: 40, lng: 79.08832, lat: 21.14656 },
]

