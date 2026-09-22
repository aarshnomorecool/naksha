// Preserved for the hidden bus feature only (DriverPage.tsx is unrouted — see
// busBackup.ts). Nothing routed in the app may import fake students or demo
// lists from here: every visible surface reads real Supabase data, and pages
// without a backend table yet (consent) use free-text input instead of a
// made-up dropdown.

export interface MockBus {
  id: string
  label: string
  routeName: string
}

export const MOCK_BUSES: MockBus[] = [
  { id: 'bus-1', label: 'Bus 1', routeName: 'Hostel Loop' },
  { id: 'bus-2', label: 'Bus 2', routeName: 'City Gate Express' },
  { id: 'bus-3', label: 'Bus 3', routeName: 'North Campus Shuttle' },
]
