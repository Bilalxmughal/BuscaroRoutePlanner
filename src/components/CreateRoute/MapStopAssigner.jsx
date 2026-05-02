// src/components/CreateRoute/MapStopAssigner.jsx
// 
// Shows all stops on a Leaflet map.
// Two modes:
//   PIN MODE    — click individual pins to select, then assign to a vehicle route
//   POLYGON MODE — click on map to draw polygon, close it → all pins inside get selected
//                  then assign selected to a vehicle route
//
// DEPENDENCY: npm install leaflet react-leaflet
// Also add to index.js or App.jsx: import 'leaflet/dist/leaflet.css'

import { useState, useEffect, useRef } from 'react'
import { MousePointer2, Pentagon, Trash2, CheckCircle2 } from 'lucide-react'
import styles from './MapStopAssigner.module.css'

const COLORS = ['#f97316','#2563eb','#16a34a','#9333ea','#dc2626','#0891b2','#d97706','#be185d','#059669','#7c3aed']

// Point-in-polygon ray casting
function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    const intersect = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function coloredDivIcon(color, label, selected) {
  const L = window.L
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${selected ? 20 : 16}px;
      height:${selected ? 20 : 16}px;
      border-radius:50%;
      background:${selected ? '#facc15' : color};
      border:${selected ? '3px solid #b45309' : '2.5px solid #fff'};
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:700;color:#fff;
      transition:all 0.15s;
    ">${selected ? '✓' : ''}</div>`,
    iconSize: [selected ? 20 : 16, selected ? 20 : 16],
    iconAnchor: [selected ? 10 : 8, selected ? 10 : 8],
    popupAnchor: [0, -12],
  })
}

export default function MapStopAssigner({ stops, groups, routeNames, colors, perVehicle, onUpdate }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef({}) // stopId → marker
  const polylineRef = useRef(null)
  const polygonRef = useRef(null)
  const polyPointsRef = useRef([])
  const [leafletReady, setLeafletReady] = useState(false)
  const [mode, setMode] = useState('pin') // 'pin' | 'polygon'
  const [selected, setSelected] = useState(new Set()) // Set of stop ids
  const [polyPoints, setPolyPoints] = useState([]) // for re-render of button states
  const [localGroups, setLocalGroups] = useState(groups)
  const [notification, setNotification] = useState('')

  // Group lookup: stopId → groupIndex
  const stopGroupMap = useRef({})
  useEffect(() => {
    const map = {}
    groups.forEach((g, gi) => g.forEach(s => { map[s.id] = gi }))
    stopGroupMap.current = map
  }, [groups])

  // Load Leaflet
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.js'
    script.onload = () => setLeafletReady(true)
    document.head.appendChild(script)
  }, [])

  // Init map
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstance.current) return
    const L = window.L

    // Fix default icon path issue
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    const center = stops.length
      ? [stops.reduce((a, s) => a + s.lat, 0) / stops.length,
         stops.reduce((a, s) => a + s.lng, 0) / stops.length]
      : [31.5204, 74.3587]

    const map = L.map(mapRef.current, { zoomControl: true }).setView(center, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map)
    mapInstance.current = map

    // Map click for polygon mode
    map.on('click', (e) => {
      if (modeRef.current !== 'polygon') return
      const pt = [e.latlng.lat, e.latlng.lng]
      polyPointsRef.current = [...polyPointsRef.current, pt]
      setPolyPoints([...polyPointsRef.current])
      redrawPolyline()
    })

    // Add markers
    stops.forEach(s => {
      const gi = stopGroupMap.current[s.id] ?? 0
      const color = COLORS[gi % COLORS.length]
      const marker = L.marker([s.lat, s.lng], { icon: coloredDivIcon(color, s.name, false) })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:150px">
            <b style="font-size:13px">${s.name}</b><br>
            <small style="color:#64748b">Group: ${routeNames[gi] || `Vehicle ${gi+1}`}</small><br>
            <code style="font-size:10px;color:#94a3b8">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</code>
          </div>
        `)

      marker.on('click', () => {
        if (modeRef.current !== 'pin') return
        toggleSelect(s.id)
      })

      markersRef.current[s.id] = marker
    })

    // Fit bounds
    if (stops.length) {
      const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [leafletReady])

  // Mode ref for closure access
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  const redrawPolyline = () => {
    const L = window.L
    const map = mapInstance.current
    if (!map) return
    if (polylineRef.current) map.removeLayer(polylineRef.current)
    if (polyPointsRef.current.length > 1) {
      polylineRef.current = L.polyline(polyPointsRef.current, {
        color: '#f97316', weight: 2.5, dashArray: '6 4', opacity: 0.9
      }).addTo(map)
    }
  }

  const toggleSelect = (stopId) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(stopId)) next.delete(stopId)
      else next.add(stopId)
      updateMarkerIcons(next)
      return next
    })
  }

  const updateMarkerIcons = (selectedSet) => {
    stops.forEach(s => {
      const marker = markersRef.current[s.id]
      if (!marker) return
      const gi = stopGroupMap.current[s.id] ?? 0
      const color = COLORS[gi % COLORS.length]
      marker.setIcon(coloredDivIcon(color, s.name, selectedSet.has(s.id)))
    })
  }

  // Close polygon → select stops inside
  const closePolygon = () => {
    const L = window.L
    const map = mapInstance.current
    const pts = polyPointsRef.current
    if (pts.length < 3 || !map) return

    // Draw filled polygon
    if (polygonRef.current) map.removeLayer(polygonRef.current)
    polygonRef.current = L.polygon(pts, {
      color: '#f97316', fillOpacity: 0.15, weight: 2
    }).addTo(map)

    // Find stops inside
    const inside = new Set(
      stops.filter(s => pointInPolygon([s.lat, s.lng], pts)).map(s => s.id)
    )
    setSelected(inside)
    updateMarkerIcons(inside)
    setNotification(`${inside.size} stop${inside.size !== 1 ? 's' : ''} selected inside polygon`)
  }

  // Clear polygon + selection
  const clearAll = () => {
    const map = mapInstance.current
    if (polylineRef.current && map) map.removeLayer(polylineRef.current)
    if (polygonRef.current && map) map.removeLayer(polygonRef.current)
    polyPointsRef.current = []
    setPolyPoints([])
    setSelected(new Set())
    updateMarkerIcons(new Set())
    setNotification('')
  }

  // Assign selected stops to a vehicle group
  const assignToGroup = (targetGi) => {
    if (!selected.size) return

    // Re-build stops with updated group assignment
    // We don't physically move stops, we just update group labels
    // The actual grouping is done by order + perVehicle in parent
    // So we need to reorder stops: move selected to be in targetGi's block

    const currentStops = [...stops]
    const selectedIds = [...selected]

    // Separate selected and non-selected
    const selectedStops = currentStops.filter(s => selectedIds.includes(s.id))
    const otherStops = currentStops.filter(s => !selectedIds.includes(s.id))

    // Calculate where targetGi starts
    const targetStart = targetGi * perVehicle

    // Re-insert selected stops at targetGi position
    const newStops = [...otherStops]
    newStops.splice(targetStart, 0, ...selectedStops)

    // Update parent
    onUpdate(newStops)

    // Update group map
    newStops.forEach((s, idx) => {
      stopGroupMap.current[s.id] = Math.floor(idx / perVehicle)
    })

    // Update marker colors
    updateMarkerIcons(new Set())
    newStops.forEach(s => {
      const marker = markersRef.current[s.id]
      if (!marker) return
      const gi = stopGroupMap.current[s.id] ?? 0
      marker.setIcon(coloredDivIcon(COLORS[gi % COLORS.length], s.name, false))
    })

    clearAll()
    setNotification(`${selectedIds.length} stop${selectedIds.length !== 1 ? 's' : ''} moved to ${routeNames[targetGi] || `Vehicle ${targetGi + 1}`}`)
    setTimeout(() => setNotification(''), 3000)
  }

  const switchMode = (newMode) => {
    clearAll()
    setMode(newMode)
  }

  return (
    <div className={styles.wrapper}>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button
          className={`${styles.modeBtn} ${mode === 'pin' ? styles.active : ''}`}
          onClick={() => switchMode('pin')}>
          <MousePointer2 size={14} /> Select Pins
        </button>
        <button
          className={`${styles.modeBtn} ${mode === 'polygon' ? styles.active : ''}`}
          onClick={() => switchMode('polygon')}>
          <Pentagon size={14} /> Draw Area
        </button>

        {mode === 'polygon' && polyPoints.length >= 3 && (
          <button className={styles.closePolyBtn} onClick={closePolygon}>
            Close Polygon ({polyPoints.length} pts)
          </button>
        )}

        {(polyPoints.length > 0 || selected.size > 0) && (
          <button className={styles.clearBtn} onClick={clearAll}>
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      {/* Instruction */}
      <div className={styles.hint}>
        {mode === 'pin'
          ? 'Click pins on the map to select them, then assign to a vehicle below.'
          : 'Click on the map to place polygon points. After 3+ points, click "Close Polygon" to select all stops inside.'}
      </div>

      {/* Notification */}
      {notification && (
        <div className={styles.notification}>
          <CheckCircle2 size={14} /> {notification}
        </div>
      )}

      {/* Assign panel — shows when stops are selected */}
      {selected.size > 0 && (
        <div className={styles.assignPanel}>
          <span className={styles.assignLabel}>{selected.size} stop{selected.size !== 1 ? 's' : ''} selected → Assign to:</span>
          <div className={styles.assignBtns}>
            {groups.map((g, gi) => (
              <button
                key={gi}
                className={styles.assignBtn}
                style={{ borderColor: COLORS[gi % COLORS.length], color: COLORS[gi % COLORS.length] }}
                onClick={() => assignToGroup(gi)}>
                {routeNames[gi] || `Vehicle ${gi + 1}`}
                <span style={{ opacity: 0.6, fontSize: 11 }}> ({g.length} stops)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className={styles.map} />

      {/* Legend */}
      <div className={styles.legend}>
        {groups.map((g, gi) => (
          <div key={gi} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: COLORS[gi % COLORS.length] }} />
            <span className={styles.legendName}>{routeNames[gi] || `Vehicle ${gi + 1}`}</span>
            <span className={styles.legendCount}>{g.length} stops</span>
          </div>
        ))}
      </div>
    </div>
  )
}