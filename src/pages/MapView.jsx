// src/pages/MapView.jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoutes } from '../context/RoutesContext'
import {
  ArrowLeft, Eye, EyeOff, Camera, Route,
  Clock, Bus, ChevronRight, ChevronDown,
  MapPin, Navigation, Layers
} from 'lucide-react'
import ui from '../components/common/ui.module.css'
import styles from './MapView.module.css'

const COLORS = [
  '#f97316','#2563eb','#16a34a','#9333ea','#dc2626',
  '#0891b2','#d97706','#be185d','#059669','#7c3aed'
]

function fmtDist(m) {
  if (!m) return null
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
function fmtTime(s) {
  if (!s) return null
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function buildGMapsUrl(stops, destLat, destLng) {
  const valid = (stops || []).filter(s => s.lat && s.lng)
  if (!valid.length || !destLat) return null
  const origin      = `${valid[0].lat},${valid[0].lng}`
  const destination = `${destLat},${destLng}`
  const wps         = valid.slice(1).map(s => `${s.lat},${s.lng}`).join('|')
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
  if (wps) url += `&waypoints=${encodeURIComponent(wps)}`
  return url
}

async function fetchOsrmLine(stops, destLat, destLng) {
  const pts = [...stops, ...(destLat ? [{ lat: destLat, lng: destLng }] : [])]
  if (pts.length < 2) return null
  try {
    const coordStr = pts.map(p => `${p.lng},${p.lat}`).join(';')
    const data = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
    ).then(r => r.json())
    if (data.routes?.[0]) {
      return {
        coords: data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distance: data.routes[0].distance,
        duration: data.routes[0].duration
      }
    }
  } catch {}
  return null
}

export default function MapView() {
  const { id } = useParams()
  const { routes, loading } = useRoutes()
  const navigate = useNavigate()

  const mapRef       = useRef(null)
  const mapInst      = useRef(null)
  const layersRef    = useRef({}) // { `${rgi}-${vi}`: [layers] }
  const [leafletReady, setLeafletReady] = useState(false)

  // Which route group is selected in sidebar
  const [activeGroupIdx, setActiveGroupIdx] = useState(0)
  // Which vehicles are hidden: Set of `${rgi}-${vi}`
  const [hidden, setHidden] = useState(new Set())
  // OSRM route data: { `${rgi}-${vi}`: { distance, duration } }
  const [routeData, setRouteData] = useState({})
  // Screenshot state
  const [screenshotting, setScreenshotting] = useState(false)
  // Expanded vehicle in sidebar
  const [expandedVehicle, setExpandedVehicle] = useState(null)

  const displayRoutes = id
    ? routes.filter(r => r.id === id)
    : routes

  const activeGroup = displayRoutes[activeGroupIdx] || displayRoutes[0]

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
    if (!leafletReady || !mapRef.current || mapInst.current) return
    const L = window.L
    mapInst.current = L.map(mapRef.current, { zoomControl: true }).setView([31.5204, 74.3587], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(mapInst.current)
  }, [leafletReady])

  // Draw map when active group or hidden changes
  const drawMap = useCallback(async () => {
    const L = window.L
    const map = mapInst.current
    if (!L || !map || !activeGroup) return

    // Clear all layers
    Object.values(layersRef.current).forEach(layers =>
      layers.forEach(l => { try { map.removeLayer(l) } catch {} })
    )
    layersRef.current = {}

    const allPts = []

    // Draw each vehicle
    for (let vi = 0; vi < (activeGroup.routes?.length || 0); vi++) {
      const g   = activeGroup.routes[vi]
      const col = COLORS[vi % COLORS.length]
      const key = `${activeGroupIdx}-${vi}`
      const isHidden = hidden.has(key)

      layersRef.current[key] = []

      if (isHidden) continue

      const pts = g.stops.map(s => [s.lat, s.lng])
      if (activeGroup.destLat) pts.push([activeGroup.destLat, activeGroup.destLng])

      // Road line (use saved OSRM coords if available, else straight)
      const rd = routeData[key]
      const lineCoords = rd?.coords || pts
      const pl = L.polyline(lineCoords, { color: col, weight: 4, opacity: 0.75 }).addTo(map)
      layersRef.current[key].push(pl)

      // Stop markers
      g.stops.forEach((s, si) => {
        allPts.push([s.lat, s.lng])
        const ic = L.divIcon({
          html: `<div style="
            background:${col};color:#fff;border-radius:50%;
            width:26px;height:26px;display:flex;align-items:center;justify-content:center;
            font-size:11px;font-weight:700;border:2.5px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,.3);">${si + 1}</div>`,
          className: '', iconSize: [26, 26], iconAnchor: [13, 13]
        })
        const mk = L.marker([s.lat, s.lng], { icon: ic }).addTo(map)
        mk.bindPopup(`
          <div style="font-family:sans-serif;min-width:180px;line-height:1.6">
            <b style="font-size:13px">${s.name}</b><br>
            <span style="color:${col};font-weight:600;font-size:11px">● ${g.name} — Stop ${si + 1}/${g.stops.length}</span><br>
            <code style="font-size:10px;color:#94a3b8">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</code>
            ${buildGMapsUrl([s], activeGroup.destLat, activeGroup.destLng)
              ? `<br><a href="${buildGMapsUrl(g.stops.slice(si), activeGroup.destLat, activeGroup.destLng)}"
                  target="_blank" style="color:#f97316;font-size:11px;font-weight:600;">↗ Navigate from here</a>`
              : ''}
          </div>
        `)
        layersRef.current[key].push(mk)
      })
    }

    // Destination marker
    if (activeGroup.destLat) {
      allPts.push([activeGroup.destLat, activeGroup.destLng])
      const destIc = window.L.divIcon({
        html: `<div style="
          background:#dc2626;color:#fff;border-radius:8px;
          padding:4px 10px;font-size:11px;font-weight:700;
          border:2px solid #fff;box-shadow:0 2px 10px rgba(220,38,38,.4);
          white-space:nowrap">🏁 ${activeGroup.dest}</div>`,
        className: '', iconSize: [120, 28], iconAnchor: [60, 14]
      })
      const dm = window.L.marker([activeGroup.destLat, activeGroup.destLng], { icon: destIc, zIndexOffset: 1000 }).addTo(map)
      dm.bindPopup(`<b>Destination</b><br>${activeGroup.dest}`)
      layersRef.current['dest'] = [dm]
    }

    if (allPts.length) {
      map.fitBounds(window.L.latLngBounds(allPts), { padding: [48, 48] })
    }
  }, [activeGroup, activeGroupIdx, hidden, routeData])

  // Fetch OSRM lines for active group
  useEffect(() => {
    if (!activeGroup) return
    activeGroup.routes?.forEach(async (g, vi) => {
      const key = `${activeGroupIdx}-${vi}`
      if (routeData[key]) return // already fetched
      const rd = await fetchOsrmLine(g.stops, activeGroup.destLat, activeGroup.destLng)
      if (rd) {
        setRouteData(prev => ({ ...prev, [key]: rd }))
      }
    })
  }, [activeGroup, activeGroupIdx])

  useEffect(() => {
    if (leafletReady && mapInst.current) drawMap()
  }, [drawMap, leafletReady])

  // Toggle vehicle visibility
  const toggleHide = (key) => {
    setHidden(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  // Screenshot
  const takeScreenshot = async () => {
    setScreenshotting(true)
    try {
      // Dynamically load html2canvas
      if (!window.html2canvas) {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      }
      const canvas = await window.html2canvas(mapRef.current, { useCORS: true, allowTaint: true })
      const a = document.createElement('a')
      a.download = `${activeGroup?.name || 'route'}_map.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } catch(e) {
      alert('Screenshot failed. Try again.')
    }
    setScreenshotting(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'80vh', flexDirection:'column', gap:12 }}>
      <div className={ui.spinner} />
      <p style={{ color:'#94a3b8', fontSize:13 }}>Loading map...</p>
    </div>
  )

  return (
    <div className={styles.wrap}>

      {/* ── Top Bar ── */}
      <div className={styles.topBar}>
        <button className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`} onClick={() => navigate('/routes')}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className={styles.topMeta}>
          <div className={styles.topTitle}>{activeGroup?.name || 'Map View'}</div>
          <div className={styles.topSub}><MapPin size={11} /> {activeGroup?.dest}</div>
        </div>
        <div className={styles.topActions}>
          {activeGroup && (
            <a
              href={buildGMapsUrl(
                activeGroup.routes?.flatMap(g => g.stops) || [],
                activeGroup.destLat, activeGroup.destLng
              ) || '#'}
              target="_blank" rel="noopener noreferrer"
              className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`}>
              <Navigation size={13} /> Google Maps
            </a>
          )}
          <button
            className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`}
            onClick={takeScreenshot}
            disabled={screenshotting}>
            <Camera size={13} /> {screenshotting ? 'Capturing...' : 'Screenshot'}
          </button>
        </div>
      </div>

      <div className={styles.layout}>

        {/* ── LEFT SIDEBAR ── */}
        <div className={styles.sidebar}>

          {/* Route Group Switcher (only if multiple groups) */}
          {displayRoutes.length > 1 && (
            <div className={styles.groupSwitcher}>
              <div className={styles.sidebarLabel}><Layers size={11} /> Route Groups</div>
              {displayRoutes.map((r, ri) => (
                <button
                  key={r.id}
                  className={`${styles.groupBtn} ${ri === activeGroupIdx ? styles.groupBtnActive : ''}`}
                  onClick={() => { setActiveGroupIdx(ri); setExpandedVehicle(null) }}>
                  <div className={styles.groupDot} style={{ background: COLORS[ri % COLORS.length] }} />
                  <span className={styles.groupName}>{r.name}</span>
                  <ChevronRight size={12} className={styles.groupArrow} />
                </button>
              ))}
            </div>
          )}

          {/* Stats Summary */}
          {activeGroup && (
            <div className={styles.statsBand}>
              <div className={styles.statItem}>
                <Bus size={12} />
                <span>{activeGroup.routes?.length || 0} vehicles</span>
              </div>
              <div className={styles.statItem}>
                <MapPin size={12} />
                <span>{activeGroup.routes?.reduce((a, g) => a + g.stops.length, 0) || 0} stops</span>
              </div>
              {(() => {
                const totalDist = Object.values(routeData).reduce((a, r) => a + (r.distance || 0), 0)
                const totalTime = Object.values(routeData).reduce((a, r) => a + (r.duration || 0), 0)
                return <>
                  {totalDist > 0 && <div className={styles.statItem}><Route size={12}/><span>{fmtDist(totalDist)}</span></div>}
                  {totalTime > 0 && <div className={styles.statItem}><Clock size={12}/><span>{fmtTime(totalTime)}</span></div>}
                </>
              })()}
            </div>
          )}

          {/* Vehicle List */}
          <div className={styles.sidebarLabel}><Bus size={11} /> Vehicles</div>
          <div className={styles.vehicleList}>
            {activeGroup?.routes?.map((g, vi) => {
              const col     = COLORS[vi % COLORS.length]
              const key     = `${activeGroupIdx}-${vi}`
              const isHide  = hidden.has(key)
              const rd      = routeData[key]
              const isOpen  = expandedVehicle === vi
              const gmUrl   = buildGMapsUrl(g.stops, activeGroup.destLat, activeGroup.destLng)

              return (
                <div key={vi} className={`${styles.vCard} ${isHide ? styles.vCardHidden : ''}`}
                  style={{ '--vcol': col }}>

                  {/* Vehicle header */}
                  <div className={styles.vHead}
                    onClick={() => setExpandedVehicle(isOpen ? null : vi)}>
                    <div className={styles.vDot} style={{ background: isHide ? '#cbd5e1' : col }} />
                    <div className={styles.vInfo}>
                      <div className={styles.vName}>{g.name}</div>
                      {g.routeLabel && <div className={styles.vLabel}>{g.routeLabel}</div>}
                    </div>
                    <div className={styles.vRight}>
                      <span className={styles.vCount}>{g.stops.length}</span>
                      {/* Hide/Show toggle */}
                      <button
                        className={`${styles.hideBtn} ${isHide ? styles.hideBtnOn : ''}`}
                        onClick={e => { e.stopPropagation(); toggleHide(key) }}
                        title={isHide ? 'Show on map' : 'Hide from map'}>
                        {isHide ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <ChevronDown size={13}
                        className={`${styles.vChevron} ${isOpen ? styles.vChevronOpen : ''}`} />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className={styles.vStats}>
                    {rd?.distance
                      ? <span className={styles.vStat}><Route size={10}/> {fmtDist(rd.distance)}</span>
                      : <span className={styles.vStatEmpty}>Fetching...</span>}
                    {rd?.duration && <span className={styles.vStat}><Clock size={10}/> {fmtTime(rd.duration)}</span>}
                    {gmUrl && (
                      <a href={gmUrl} target="_blank" rel="noopener noreferrer"
                        className={styles.vMapsBtn} onClick={e => e.stopPropagation()}>
                        <Navigation size={10}/> Maps
                      </a>
                    )}
                  </div>

                  {/* Stops list — collapsible */}
                  {isOpen && (
                    <div className={styles.stopsList}>
                      {g.stops.map((s, si) => (
                        <div key={si} className={styles.stopRow}
                          onClick={() => {
                            if (mapInst.current) {
                              mapInst.current.setView([s.lat, s.lng], 15)
                            }
                          }}>
                          <span className={styles.stopNum} style={{ background: col }}>{si + 1}</span>
                          <div className={styles.stopInfo}>
                            <span className={styles.stopName}>{s.name}</span>
                            <span className={styles.stopCoord}>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── MAP ── */}
        <div className={styles.mapWrap}>
          {!leafletReady && (
            <div className={styles.mapLoading}>
              <div className={ui.spinner} />
              <span>Loading map...</span>
            </div>
          )}
          <div ref={mapRef} className={styles.map} />

          {/* Floating hide-all / show-all */}
          <div className={styles.mapControls}>
            <button className={styles.mapCtrlBtn}
              onClick={() => {
                const allKeys = activeGroup?.routes?.map((_, vi) => `${activeGroupIdx}-${vi}`) || []
                const allHidden = allKeys.every(k => hidden.has(k))
                if (allHidden) {
                  setHidden(prev => { const n = new Set(prev); allKeys.forEach(k => n.delete(k)); return n })
                } else {
                  setHidden(prev => { const n = new Set(prev); allKeys.forEach(k => n.add(k)); return n })
                }
              }}>
              {activeGroup?.routes?.every((_, vi) => hidden.has(`${activeGroupIdx}-${vi}`))
                ? <><Eye size={12}/> Show All</>
                : <><EyeOff size={12}/> Hide All</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}