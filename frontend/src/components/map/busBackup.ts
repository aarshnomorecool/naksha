// Bus tracking is deliberately HIDDEN for the current campus-map scope —
// nothing in the UI imports this module right now. It is preserved (not
// deleted) so the feature can be restored without re-creating anything:
//
// To restore:
//   1. layers.ts — append a ScatterplotLayer fed by live bus positions
//      (working reference: the `busesLayer` in map-demo/campus-map-demo.html).
//   2. mapState.ts — add a `buses` array to MapState + a stepper that moves
//      each bus along `BUS_ROUTES` below (reference: `stepBuses` in the demo).
//   3. useSupabaseData.ts — subscribe to `bus_positions` (table, RLS policy,
//      and seed rows already exist in supabase/) and write into that array.
//   4. App.tsx — re-add the `/driver` route for DriverPage.tsx (file kept,
//      currently unrouted). MOCK_BUSES in lib/mockData.ts is also untouched.
// This module retains the route geometry needed for all of the above.
export interface BusRoute {
  id: string
  label: string
  route_name: string
  waypoints: [number, number][]
}

export const BUS_ROUTES: BusRoute[] = [
  { id: 'bus-1', label: 'Bus 1', route_name: 'Route 1 - Hostel Loop', waypoints: [[79.0875, 21.144], [79.0883, 21.14395], [79.0891, 21.144], [79.0896, 21.1444], [79.0896, 21.145], [79.0891, 21.1452], [79.0883, 21.1452], [79.0875, 21.145], [79.087, 21.1446], [79.0875, 21.144]] },
  { id: 'bus-2', label: 'Bus 2', route_name: 'Route 2 - City Gate Shuttle', waypoints: [[79.09, 21.1445], [79.09, 21.1438], [79.089, 21.1435], [79.088, 21.1435], [79.087, 21.1438], [79.0866, 21.1445], [79.087, 21.1452], [79.088, 21.1455], [79.089, 21.1452], [79.09, 21.1445]] },
  { id: 'bus-3', label: 'Bus 3', route_name: 'Route 3 - North Campus Express', waypoints: [[79.086, 21.1455], [79.0865, 21.1462], [79.0875, 21.1468], [79.0885, 21.147], [79.0895, 21.1468], [79.09, 21.1462], [79.0895, 21.1456], [79.088, 21.1453], [79.0865, 21.1453], [79.086, 21.1455]] },
]
