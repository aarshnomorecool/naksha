// Bus tracking is deliberately inactive for the current campus-map scope.
// This module retains the route simulation needed to restore it later.
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
