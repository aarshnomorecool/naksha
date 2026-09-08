// Mock data for surfaces whose backend shape isn't decided yet (check-in,
// driver broadcast, consent). Once each flow's real table/auth model is
// designed, these get replaced by Supabase reads/writes the same way
// riskDashboard.ts already reads real data — until then, nothing here
// touches the database.

export interface MockStudent {
  rollNumber: string
  fullName: string
  program: string
  year: number
}

export const MOCK_STUDENTS: MockStudent[] = [
  { rollNumber: 'NKS24CS041', fullName: 'Ananya Deshmukh', program: 'B.Tech CSE', year: 2 },
  { rollNumber: 'NKS24CS017', fullName: 'Rohan Kulkarni', program: 'B.Tech CSE', year: 2 },
  { rollNumber: 'NKS23EC008', fullName: 'Sneha Patil', program: 'B.Tech ECE', year: 3 },
  { rollNumber: 'NKS24ME022', fullName: 'Vikram Rao', program: 'B.Tech Mech', year: 1 },
  { rollNumber: 'NKS22CS063', fullName: 'Ishita Sharma', program: 'B.Tech CSE', year: 4 },
]

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

export interface ConsentRecord {
  id: string
  guardianName: string
  relationship: string
  studentRollNumber: string
  purposes: string[]
  submittedAt: string
}
