import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Imported before index.css so Tailwind's utilities (loaded after) win any
// cascade ties against maplibre-gl's own classes — notably .maplibregl-map's
// `position: relative`, which otherwise silently overrides MapView's
// `absolute inset-0` container and collapses the map to a tiny default size.
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
