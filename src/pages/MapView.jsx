// src/pages/MapView.jsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoutes } from '../context/RoutesContext'
import { ArrowLeft, Layers } from 'lucide-react'
import ui from '../components/common/ui.module.css'
import styles from './MapView.module.css'

const COLORS = ['#f97316','#2563eb','#16a34a','#9333ea','#dc2626','#0891b2','#d97706','#be185d','#059669','#7c3aed']

export default function MapView() {
  const { id } = useParams()
  const { routes, loading } = useRoutes()
  const navigate = useNavigate()
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const layersRef = useRef([])
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [leafletReady, setLeafletReady] = useState(false)
  const [allRoutes, setAllRoutes] = useState([])

  // Load Leaflet dynamically
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

  // Determine which routes to show
  useEffect(() => {
    if (!routes.length) return
    if (id) {
      const found = routes.find(r => r.id === id)
      if (found) { setAllRoutes([found]); setSelectedRoute(found) }
    } else {
      setAllRoutes(routes)
    }
  }, [id, routes])

  // Init map
  useEffect(() => {
    if (!leafletReady || !mapRef.current) return
    if (mapInstance.current) return
    const L = window.L
    mapInstance.current = L.map(mapRef.current, { zoomControl: true }).setView([31.5204, 74.3587], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance.current)
  }, [leafletReady])

  // Draw routes on map
  useEffect(() => {
    if (!mapInstance.current || !allRoutes.length || !leafletReady) return
    const L = window.L
    layersRef.current.forEach(l => mapInstance.current.removeLayer(l))
    layersRef.current = []

    const allPts = []
    allRoutes.forEach((rGroup) => {
      rGroup.routes?.forEach((g, vi) => {
        const col = COLORS[vi % COLORS.length]
        const pts = g.stops.map(s => L.latLng(s.lat, s.lng))
        if (rGroup.destLat) pts.push(L.latLng(rGroup.destLat, rGroup.destLng))
        allPts.push(...pts)

        const pl = L.polyline(pts, { color: col, weight: 3.5, opacity: 0.8 }).addTo(mapInstance.current)
        layersRef.current.push(pl)

        g.stops.forEach((s, si) => {
          const ic = L.divIcon({
            html: `<div style="background:${col};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${si + 1}</div>`,
            className: '', iconSize: [28, 28], iconAnchor: [14, 14]
          })
          const mk = L.marker([s.lat, s.lng], { icon: ic }).addTo(mapInstance.current)
          mk.bindPopup(`<div style="font-family:sans-serif;min-width:160px"><b style="font-size:13px">${s.name}</b><br><small style="color:#64748b">${g.name} — Stop ${si + 1}</small><br><code style="font-size:11px;color:#475569">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</code></div>`)
          layersRef.current.push(mk)
        })
      })

      if (rGroup.destLat) {
        const destIc = L.divIcon({
          html: `<div style="background:#dc2626;color:#fff;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap">🏁 DEST</div>`,
          className: '', iconSize: [70, 26], iconAnchor: [35, 13]
        })
        const dm = L.marker([rGroup.destLat, rGroup.destLng], { icon: destIc }).addTo(mapInstance.current)
        dm.bindPopup(`<b>Destination</b><br>${rGroup.dest}`)
        layersRef.current.push(dm)
        allPts.push(L.latLng(rGroup.destLat, rGroup.destLng))
      }
    })

    if (allPts.length) {
      mapInstance.current.fitBounds(window.L.latLngBounds(allPts), { padding: [50, 50] })
    }
  }, [allRoutes, leafletReady])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: 12, flexDirection: 'column' }}>
      <div className={ui.spinner} />
      <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading map...</p>
    </div>
  )

  const displayRoute = selectedRoute || (allRoutes.length === 1 ? allRoutes[0] : null)

  return (
    <div className={styles.wrap}>
      <div className={ui.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`} onClick={() => navigate('/routes')}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <div className={ui.pageTitle}>{displayRoute ? displayRoute.name : 'All Routes — Map View'}</div>
            <div className={ui.pageSubtitle}>{displayRoute ? `📍 ${displayRoute.dest}` : `${allRoutes.length} route groups`}</div>
          </div>
        </div>
        {!id && routes.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {routes.map((r, i) => (
              <button
                key={r.id}
                className={`${ui.btn} ${ui.btnSm}`}
                style={{ borderColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length], background: '#fff' }}
                onClick={() => navigate(`/map/${r.id}`)}
              >{r.name}</button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.mapLayout}>
        {/* Sidebar legend */}
        <div className={styles.legend}>
          <div className={styles.legendTitle}><Layers size={13} /> Route Legend</div>
          {displayRoute ? (
            displayRoute.routes?.map((g, i) => (
              <div key={i} className={styles.legendItem}>
                <div className={styles.legendDot} style={{ background: COLORS[i % COLORS.length] }} />
                <div>
                  <div className={styles.legendName}>{g.name}</div>
                  <div className={styles.legendMeta}>{g.stops.length} stops</div>
                </div>
              </div>
            ))
          ) : (
            allRoutes.map((r, ri) => (
              <div key={r.id}>
                <div className={styles.legendGroup}>{r.name}</div>
                {r.routes?.map((g, vi) => (
                  <div key={vi} className={styles.legendItem} style={{ paddingLeft: 12 }}>
                    <div className={styles.legendDot} style={{ background: COLORS[vi % COLORS.length] }} />
                    <div>
                      <div className={styles.legendName}>{g.name}</div>
                      <div className={styles.legendMeta}>{g.stops.length} stops</div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Map */}
        <div className={styles.mapContainer}>
          {!leafletReady && (
            <div className={styles.mapLoading}>
              <div className={ui.spinner} />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Loading map...</span>
            </div>
          )}
          <div ref={mapRef} className={styles.map} />
        </div>
      </div>
    </div>
  )
}