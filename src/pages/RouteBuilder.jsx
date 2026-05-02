// src/pages/RouteBuilder.jsx
// Routes: /routes/new  |  /routes/edit/:id
//
// npm install papaparse xlsx

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRoutes } from '../context/RoutesContext'
import {
  ArrowLeft, Plus, Trash2, Upload, RefreshCw,
  ChevronRight, ChevronLeft, Check, Navigation,
  Download, Wand2, AlertTriangle, GripVertical,
  MapPin, Pentagon, MousePointer2, X, Clock, Route,
  ArrowUp, ArrowDown
} from 'lucide-react'
import ui from '../components/common/ui.module.css'
import styles from './RouteBuilder.module.css'

// ─── Config ───────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY'

const COLORS = [
  '#f97316','#2563eb','#16a34a','#9333ea','#dc2626',
  '#0891b2','#d97706','#be185d','#059669','#7c3aed'
]
const PER_VEHICLE_OPTS = [2, 4, 6, 8, 10, 12]

// ─── Helpers ──────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9)

function parseLatLng(str) {
  const p = String(str).split(',').map(s => parseFloat(s.trim()))
  if (p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) return { lat: p[0], lng: p[1] }
  return null
}

// Haversine distance in km
function dist(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))
}

// ── Smart Clustering ──────────────────────────────────────
function smartCluster(stops, k, dest) {
  if (!stops.length || k <= 0) return []
  if (k >= stops.length) return stops.map(s => [s])

  const centroids = [stops[Math.floor(stops.length / 2)]]
  while (centroids.length < k) {
    let maxDist = -1, next = stops[0]
    stops.forEach(s => {
      const minD = Math.min(...centroids.map(c => dist(s, c)))
      if (minD > maxDist) { maxDist = minD; next = s }
    })
    centroids.push(next)
  }

  let assignments = new Array(stops.length).fill(0)
  for (let iter = 0; iter < 10; iter++) {
    assignments = stops.map(s =>
      centroids.reduce((best, c, ci) =>
        dist(s, c) < dist(s, centroids[best]) ? ci : best, 0)
    )
    for (let ci = 0; ci < k; ci++) {
      const members = stops.filter((_, i) => assignments[i] === ci)
      if (!members.length) continue
      centroids[ci] = {
        lat: members.reduce((a, s) => a + s.lat, 0) / members.length,
        lng: members.reduce((a, s) => a + s.lng, 0) / members.length
      }
    }
  }

  const groups = Array.from({ length: k }, () => [])
  stops.forEach((s, i) => groups[assignments[i]].push(s))
  return groups.filter(g => g.length > 0).map(g => seqTowardDest(g, dest))
}

// ── Sequence stops toward destination ──
function seqTowardDest(stops, dest) {
  if (stops.length <= 1) return [...stops]
  const rem = [...stops]
  let startIdx = 0
  if (dest) {
    let maxD = -1
    rem.forEach((s, i) => { const d = dist(s, dest); if (d > maxD) { maxD = d; startIdx = i } })
  }
  const ordered = [rem.splice(startIdx, 1)[0]]
  while (rem.length) {
    const last = ordered[ordered.length - 1]
    let bestIdx = 0, bestScore = Infinity
    rem.forEach((s, i) => {
      const score = dist(last, s) + (dest ? dist(s, dest) * 0.3 : 0)
      if (score < bestScore) { bestScore = score; bestIdx = i }
    })
    ordered.push(rem.splice(bestIdx, 1)[0])
  }
  return ordered
}

// ── Move stop within same group ──────────────────────────
function moveInGroup(grp, stopId, dir) {
  const arr = [...grp]
  const i = arr.findIndex(s => s.id === stopId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= arr.length) return arr
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  return arr
}

function splitGroups(stops, perVehicle) {
  if (!stops.length || !perVehicle) return []
  const groups = []
  for (let i = 0; i < stops.length; i += perVehicle) groups.push(stops.slice(i, i + perVehicle))
  return groups
}

function buildGMapsUrl(stops, destLat, destLng) {
  const valid = (stops || []).filter(s => s.lat && s.lng)
  if (!valid.length || !destLat) return null
  const origin = `${valid[0].lat},${valid[0].lng}`
  const destination = `${destLat},${destLng}`
  const wps = valid.slice(1).map(s => `${s.lat},${s.lng}`).join('|')
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
  if (wps) url += `&waypoints=${encodeURIComponent(wps)}`
  return url
}

function pointInPoly(pt, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
    if (((yi > pt[1]) !== (yj > pt[1])) && pt[0] < ((xj-xi)*(pt[1]-yi)/(yj-yi)+xi))
      inside = !inside
  }
  return inside
}

function fmtTime(seconds) {
  if (!seconds) return '--'
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDist(meters) {
  if (!meters) return '--'
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

// ── Fetch road distance via OSRM (free) ──────────────────
async function fetchRouteLine(stops, destLat, destLng, googleKey) {
  const allPoints = [...stops, ...(destLat ? [{ lat: destLat, lng: destLng }] : [])]
  if (allPoints.length < 2) return { coords: null, distance: null, duration: null }

  if (googleKey && googleKey !== 'YOUR_GOOGLE_MAPS_API_KEY') {
    try {
      const origin = `${allPoints[0].lat},${allPoints[0].lng}`
      const dest   = `${allPoints[allPoints.length-1].lat},${allPoints[allPoints.length-1].lng}`
      const wps    = allPoints.slice(1,-1).map(p=>`${p.lat},${p.lng}`).join('|')
      let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&travelmode=driving&key=${googleKey}`
      if (wps) url += `&waypoints=${encodeURIComponent(wps)}`
      const data = await fetch(url).then(r => r.json())
      if (data.routes?.[0]) {
        const legs = data.routes[0].legs || []
        return {
          coords: decodePolyline(data.routes[0].overview_polyline.points),
          distance: legs.reduce((a, l) => a + (l.distance?.value || 0), 0),
          duration: legs.reduce((a, l) => a + (l.duration?.value || 0), 0)
        }
      }
    } catch(e) {}
  }

  try {
    const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')
    const data = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
    ).then(r => r.json())
    if (data.routes?.[0]) {
      const r = data.routes[0]
      return {
        coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distance: r.distance,
        duration: r.duration
      }
    }
  } catch(e) {}

  return { coords: allPoints.map(p => [p.lat, p.lng]), distance: null, duration: null }
}

function decodePolyline(encoded) {
  const poly = []; let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : result >> 1
    poly.push([lat / 1e5, lng / 1e5])
  }
  return poly
}

async function doExportCSV(routeName, dest, groups, vNames) {
  const rows = [['Vehicle','Stop#','Name','Latitude','Longitude','GoogleMapsLink']]
  groups.forEach((g, gi) => {
    g.forEach((s, si) => {
      rows.push([vNames[gi]||`Vehicle ${gi+1}`, si+1, s.name, s.lat.toFixed(6), s.lng.toFixed(6), ''])
    })
  })
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}))
  a.download = `${routeName.replace(/\s+/g,'_')}_routes.csv`
  a.click()
}

function doExportPDF(routeName, dest, groups, vNames, destLat, destLng, routeInfo) {
  const lines = [
    `ROUTE GROUP: ${routeName}`, `DESTINATION: ${dest}`,
    `VEHICLES: ${groups.length}`, `TOTAL STOPS: ${groups.reduce((a,g)=>a+g.length,0)}`, ''
  ]
  groups.forEach((g, gi) => {
    const info = routeInfo?.[gi]
    lines.push(`── ${vNames[gi]||`Vehicle ${gi+1}`} (${g.length} stops${info?.distance?` · ${fmtDist(info.distance)}`:''}${info?.duration?` · ${fmtTime(info.duration)}`:''}) ──`)
    g.forEach((s,si) => lines.push(`  ${si+1}. ${s.name}  [${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}]`))
    const gm = buildGMapsUrl(g, destLat, destLng)
    if (gm) lines.push(`  Google Maps: ${gm}`)
    lines.push('')
  })
  const w = window.open('', '_blank')
  w.document.write(`<html><head><title>${routeName}</title>
    <style>body{font-family:monospace;font-size:13px;padding:30px}pre{white-space:pre-wrap;line-height:1.8}@media print{button{display:none}}</style>
    </head><body>
    <h2>BusCaro — Route Export</h2>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 18px;background:#f97316;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Print / Save PDF</button>
    <pre>${lines.join('\n')}</pre></body></html>`)
  w.document.close()
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function RouteBuilder() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { routes, addRoute, updateRoute } = useRoutes()
  const isEdit    = !!id
  const editData  = isEdit ? routes.find(r => r.id === id) : null

  // ── Step 1 ──
  const [step,       setStep]       = useState(1)
  const [name,       setName]       = useState('')
  const [dest,       setDest]       = useState('')
  const [destCoord,  setDestCoord]  = useState('')
  const [stops,      setStops]      = useState([])
  const [perVehicle, setPerVehicle] = useState(6)
  const [useCustom,  setUseCustom]  = useState(false)
  const [customVal,  setCustomVal]  = useState('')
  const [stopName,   setStopName]   = useState('')
  const [stopCoord,  setStopCoord]  = useState('')
  const [uploading,  setUploading]  = useState(false)
  const [errors,     setErrors]     = useState({})
  const fileRef = useRef(null)

  // ── Step 2 ──
  const [groups,        setGroups]        = useState([])
  const [vNames,        setVNames]        = useState([])
  const [mapMode,       setMapMode]       = useState('pin')
  const [selStops,      setSelStops]      = useState(new Set())
  const [polyPts,       setPolyPts]       = useState([])
  const [saving,        setSaving]        = useState(false)
  const [routeLines,    setRouteLines]    = useState([])
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [stopsPool,     setStopsPool]     = useState([])

  // ── FIX: Track whether groups were restored from edit data ──
  // groupsRestored = true  → Step 2 pe jaate waqt re-cluster mat karo
  // groupsRestored = false → fresh route ya user ne stops modify kiye → re-cluster karo
  const [groupsRestored, setGroupsRestored] = useState(false)

  // ── Per-vehicle inline add-stop form state ──
  const [addForms, setAddForms] = useState({})

  // Leaflet refs
  const mapRef      = useRef(null)
  const mapInst     = useRef(null)
  const layersRef   = useRef([])
  const polyDrawRef = useRef(null)
  const polyFillRef = useRef(null)
  const [leafletReady, setLeafletReady] = useState(false)

  const actualPer  = useCustom ? (parseInt(customVal) || 1) : perVehicle
  const destParsed = parseLatLng(destCoord)

  // ── FIX: Load edit data — groups bhi restore karo, sirf flat stops nahi ──
  useEffect(() => {
    if (!editData) return

    setName(editData.name || '')
    setDest(editData.dest || '')
    setDestCoord(editData.destLat ? `${editData.destLat}, ${editData.destLng}` : '')

    // Step 1 ke liye flat stops
    const flat = editData.routes?.flatMap(r =>
      r.stops.map(s => ({ id: uid(), ...s }))
    ) || []
    setStops(flat)
    setPerVehicle(editData.routes?.[0]?.stops?.length || 6)

    // Step 2 ke liye — groups directly restore karo with UIDs
    if (editData.routes?.length) {
      const restoredGroups = editData.routes.map(r =>
        r.stops.map(s => ({ id: uid(), ...s }))
      )
      setGroups(restoredGroups)
      setVNames(editData.routes.map((r, i) => r.name || `Vehicle ${i + 1}`))
      setGroupsRestored(true) // flag: re-cluster mat karna
    }
  }, [editData?.id])

  // ── Load Leaflet ──
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

  // ── Init map ──
  useEffect(() => {
    if (step !== 2 || !leafletReady) return
    setTimeout(() => {
      if (!mapRef.current) return
      if (!mapInst.current) {
        const L = window.L
        delete L.Icon.Default.prototype._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        })
        const allStops = groups.flat()
        const center = allStops.length
          ? [allStops.reduce((a,s)=>a+s.lat,0)/allStops.length, allStops.reduce((a,s)=>a+s.lng,0)/allStops.length]
          : [31.5204, 74.3587]
        mapInst.current = L.map(mapRef.current, { zoomControl: true }).setView(center, 12)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(mapInst.current)

        mapInst.current.on('click', e => {
          if (mapModeRef.current !== 'polygon') return
          setPolyPts(prev => {
            const next = [...prev, [e.latlng.lat, e.latlng.lng]]
            drawPolyLine(next)
            return next
          })
        })
      }
      drawMap()
    }, 100)
  }, [step, leafletReady])

  const mapModeRef = useRef(mapMode)
  useEffect(() => { mapModeRef.current = mapMode }, [mapMode])

  useEffect(() => {
    if (step === 2 && mapInst.current) drawMap()
  }, [groups, selStops, routeLines, stopsPool, step])

  const drawPolyLine = (pts) => {
    const L = window.L, map = mapInst.current
    if (!L || !map) return
    if (polyDrawRef.current) map.removeLayer(polyDrawRef.current)
    if (pts.length > 1) polyDrawRef.current = L.polyline(pts, { color:'#f97316', weight:2, dashArray:'6 3' }).addTo(map)
  }

  // ── Main map draw ──────────────────────────────────────
  const drawMap = useCallback(() => {
    const L = window.L, map = mapInst.current
    if (!L || !map) return
    layersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    layersRef.current = []

    routeLines.forEach((info, gi) => {
      if (!info?.coords?.length) return
      const pl = L.polyline(info.coords, { color: COLORS[gi % COLORS.length], weight: 4, opacity: 0.7 }).addTo(map)
      layersRef.current.push(pl)
    })

    if (destParsed) {
      const ic = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:36px;position:relative;display:flex;align-items:flex-start;justify-content:center;pointer-events:none">
          <div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#dc2626;border:3px solid #fff;box-shadow:0 3px 10px rgba(220,38,38,.5);transform:rotate(-45deg)"></div>
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;background:rgba(220,38,38,.3)"></div>
        </div>`,
        iconSize: [22, 36], iconAnchor: [11, 36]
      })
      const dm = L.marker([destParsed.lat, destParsed.lng], { icon: ic, zIndexOffset: 2000 }).addTo(map)
      dm.bindTooltip(`<b>Destination</b><br>${dest}`, { direction: 'top', offset: [0, -36] })
      layersRef.current.push(dm)
    }

    stopsPool.forEach(s => {
      const ic = L.divIcon({
        className: '',
        html: `<div style="
          width:24px;height:24px;border-radius:50%;
          background:#94a3b8;border:2.5px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,.35);
          display:flex;align-items:center;justify-content:center;
          font-size:11px;color:#fff;font-weight:800;cursor:pointer;
        ">?</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12]
      })
      const mk = L.marker([s.lat, s.lng], { icon: ic, zIndexOffset: 500 }).addTo(map)
      mk.bindTooltip(
        `<div style="font-family:sans-serif;font-size:12px;line-height:1.6;min-width:160px">
          <b>${s.name}</b><br>
          <span style="color:#f97316;font-weight:600">⚠ Unassigned Pool</span><br>
          <span style="color:#64748b">Kisi vehicle mein assign nahi hua</span><br>
          <code style="font-size:10px;color:#94a3b8">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</code>
        </div>`,
        { direction: 'top', offset: [0, -12], permanent: false }
      )
      const assignBtns = groups.map((_, ti) =>
        `<button onclick="window.__assignFromPool('${s.id}',${ti})"
          style="padding:4px 12px;font-size:11px;font-weight:600;border-radius:12px;cursor:pointer;
          background:#fff;border:1.5px solid ${COLORS[ti%COLORS.length]};color:${COLORS[ti%COLORS.length]};margin:2px;"
        >${vNames[ti]||`V${ti+1}`}</button>`
      ).join('')
      mk.bindPopup(`
        <div style="font-family:sans-serif;min-width:180px">
          <b style="font-size:13px">${s.name}</b><br>
          <span style="color:#f97316;font-size:11px">⚠ Unassigned Pool</span>
          <div style="margin-top:8px;font-size:11px;color:#64748b;font-weight:600">Vehicle mein assign karo:</div>
          <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px">${assignBtns}</div>
        </div>
      `, { maxWidth: 260 })
      layersRef.current.push(mk)
    })

    groups.forEach((grp, gi) => {
      const col = COLORS[gi % COLORS.length]
      const vName = vNames[gi] || `Vehicle ${gi+1}`

      grp.forEach((s, si) => {
        const isSel = selStops.has(s.id)
        const size = isSel ? 26 : 20
        const ic = L.divIcon({
          className: '',
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${isSel?'#facc15':col};
            border:${isSel?'3px solid #b45309':'2.5px solid #fff'};
            box-shadow:0 2px 8px rgba(0,0,0,.3);
            display:flex;align-items:center;justify-content:center;
            font-size:${isSel?11:10}px;font-weight:700;
            color:${isSel?'#7c2d12':'#fff'};cursor:pointer;
          ">${si+1}</div>`,
          iconSize: [size, size], iconAnchor: [size/2, size/2]
        })

        const mk = L.marker([s.lat, s.lng], { icon: ic }).addTo(map)

        mk.bindTooltip(`
          <div style="font-family:sans-serif;font-size:12px;line-height:1.6;min-width:160px">
            <b style="font-size:13px">${s.name}</b><br>
            <span style="color:${col};font-weight:600">● ${vName}</span><br>
            <span style="color:#64748b">Stop ${si+1} of ${grp.length}</span><br>
            <code style="font-size:10px;color:#94a3b8">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</code>
          </div>
        `, { direction: 'top', offset: [0, -(size/2+4)], sticky: false })

        const upBtn = si > 0
          ? `<button onclick="window.__moveStop('${s.id}',${gi},-1)"
              style="padding:3px 10px;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer;
              background:#fff;border:1.5px solid #e2e8f0;color:#475569;margin:2px;">↑ Up</button>`
          : `<button disabled style="padding:3px 10px;font-size:11px;border-radius:8px;background:#f8fafc;border:1.5px solid #f1f5f9;color:#cbd5e1;margin:2px;">↑ Up</button>`
        const dnBtn = si < grp.length - 1
          ? `<button onclick="window.__moveStop('${s.id}',${gi},1)"
              style="padding:3px 10px;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer;
              background:#fff;border:1.5px solid #e2e8f0;color:#475569;margin:2px;">↓ Down</button>`
          : `<button disabled style="padding:3px 10px;font-size:11px;border-radius:8px;background:#f8fafc;border:1.5px solid #f1f5f9;color:#cbd5e1;margin:2px;">↓ Down</button>`

        const assignBtns = groups.map((_, ti) =>
          `<button onclick="window.__assignStop('${s.id}',${gi},${ti})"
            style="padding:3px 10px;font-size:11px;font-weight:600;border-radius:12px;cursor:pointer;
            background:${ti===gi?'#f1f5f9':'#fff'};border:1.5px solid ${COLORS[ti%COLORS.length]};
            color:${COLORS[ti%COLORS.length]};margin:2px;${ti===gi?'opacity:0.5;cursor:default':''}"
          >${vNames[ti]||`V${ti+1}`}</button>`
        ).join('')

        mk.bindPopup(`
          <div style="font-family:sans-serif;min-width:210px">
            <b style="font-size:13px">${s.name}</b><br>
            <span style="color:${col};font-size:11px;font-weight:600">● ${vName} — Stop ${si+1}/${grp.length}</span><br>
            <code style="font-size:10px;color:#94a3b8">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</code>
            <div style="margin-top:8px;font-size:11px;color:#64748b;font-weight:600">Isi route mein move karo:</div>
            <div style="margin-top:3px;display:flex;gap:4px">${upBtn}${dnBtn}</div>
            <div style="margin-top:8px;font-size:11px;color:#64748b;font-weight:600">Doosre vehicle mein transfer:</div>
            <div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:2px">${assignBtns}</div>
          </div>
        `, { maxWidth: 290 })

        mk.on('click', () => {
          if (mapModeRef.current === 'pin') {
            setSelStops(prev => {
              const n = new Set(prev)
              n.has(s.id) ? n.delete(s.id) : n.add(s.id)
              return n
            })
          }
        })
        layersRef.current.push(mk)
      })
    })
  }, [groups, selStops, routeLines, stopsPool, vNames, dest, destParsed])

  // ── Window helpers for map popup buttons ──────────────
  useEffect(() => {
    window.__moveStop = (stopId, gi, dir) => {
      setGroups(prev => {
        const next = prev.map(g => [...g])
        next[gi] = moveInGroup(next[gi], stopId, dir)
        return next
      })
      mapInst.current?.closePopup()
      setTimeout(() => setGroups(g => [...g]), 100)
    }

    window.__assignStop = (stopId, fromGi, toGi) => {
      if (fromGi === toGi) { mapInst.current?.closePopup(); return }
      const dp = parseLatLng(destCoord)
      setGroups(prev => {
        const next = prev.map(g => [...g])
        const stopObj = next[fromGi].find(s => s.id === stopId)
        if (!stopObj) return prev
        next[fromGi] = seqTowardDest(next[fromGi].filter(s => s.id !== stopId), dp)
        next[toGi]   = seqTowardDest([...next[toGi], stopObj], dp)
        return next
      })
      mapInst.current?.closePopup()
    }

    window.__assignFromPool = (stopId, toGi) => {
      const stop = stopsPool.find(s => s.id === stopId)
      if (!stop) return
      const dp = parseLatLng(destCoord)
      setStopsPool(prev => prev.filter(s => s.id !== stopId))
      setGroups(prev => {
        const next = prev.map(g => [...g])
        next[toGi] = seqTowardDest([...next[toGi], stop], dp)
        return next
      })
      mapInst.current?.closePopup()
    }

    return () => {
      delete window.__moveStop
      delete window.__assignStop
      delete window.__assignFromPool
    }
  }, [destCoord, groups, stopsPool, vNames])

  // ── Route line fetching ──
  const fetchAllRouteLines = useCallback(async (grps) => {
    if (!grps.length) return
    setLoadingRoutes(true)
    const lines = await Promise.all(
      grps.map(grp => fetchRouteLine(grp, destParsed?.lat, destParsed?.lng, GOOGLE_MAPS_API_KEY))
    )
    setRouteLines(lines)
    setLoadingRoutes(false)
  }, [destParsed?.lat, destParsed?.lng])

  const routeRefreshTimer = useRef(null)
  useEffect(() => {
    if (step !== 2 || !groups.length) return
    clearTimeout(routeRefreshTimer.current)
    routeRefreshTimer.current = setTimeout(() => fetchAllRouteLines(groups), 700)
    return () => clearTimeout(routeRefreshTimer.current)
  }, [groups, step])

  // ── FIX: goToStep2 — edit mode mein restored groups use karo, re-cluster mat karo ──
  const goToStep2 = () => {
    const err = {}
    if (!name.trim()) err.name = 'Route name required'
    if (!dest.trim()) err.dest = 'Destination required'
    if (!destCoord.trim() || !parseLatLng(destCoord)) err.destCoord = 'Valid coordinates required'
    if (!stops.length) err.stops = 'Add at least one stop'
    if (Object.keys(err).length) { setErrors(err); return }
    setErrors({})

    const dp = parseLatLng(destCoord)

    // Edit mode + groups already restored from Firebase → re-cluster mat karo
    if (isEdit && groupsRestored) {
      setStopsPool([])
      setStep(2)
      fetchAllRouteLines(groups)
      return
    }

    // Fresh route ya user ne stops modify kiye → smart cluster
    const clustered = smartCluster(stops, Math.ceil(stops.length / actualPer), dp)
    setGroups(clustered)
    setStopsPool([])
    setVNames(clustered.map((_, i) => `Vehicle ${i+1}`))
    setStep(2)
    fetchAllRouteLines(clustered)
  }

  // ── Step 1 stop management ──
  // FIX: jab user stop add kare → groupsRestored reset karo taake next Step 2 pe re-cluster ho
  const addStopManual = () => {
    const coord = parseLatLng(stopCoord)
    if (!coord) { setErrors({ stopCoord: 'Format: 31.5204, 74.3587' }); return }
    setStops(prev => [...prev, { id: uid(), name: stopName.trim() || `Stop ${prev.length+1}`, lat: coord.lat, lng: coord.lng }])
    setStopName(''); setStopCoord(''); setErrors({})
    setGroupsRestored(false) // stops changed → re-cluster on next Step 2
  }

  const removeStop = (sid) => {
    setStops(prev => prev.filter(s => s.id !== sid))
    setGroupsRestored(false) // stops changed → re-cluster on next Step 2
  }

  const moveStop = (sid, dir) => {
    setStops(prev => {
      const arr = [...prev], i = arr.findIndex(s => s.id === sid), j = i + dir
      if (j < 0 || j >= arr.length) return prev
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
  }

  // ── Bulk upload ──
  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop().toLowerCase()
    try {
      let rows = []
      if (ext === 'csv') {
        const Papa = (await import('papaparse')).default
        rows = Papa.parse(await file.text(), { header:true, skipEmptyLines:true }).data
      } else if (['xlsx','xls'].includes(ext)) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type:'array' })
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      } else { setErrors({ upload:'Only CSV or Excel.' }); return }

      const parsed = rows.map(r => {
        const n = {}; Object.keys(r).forEach(k => n[k.toLowerCase().trim()] = r[k])
        const lat = parseFloat(n.lat), lng = parseFloat(n.lng ?? n.long ?? n.longitude)
        if (isNaN(lat) || isNaN(lng)) return null
        return { id: uid(), name: String(n.label ?? n.name ?? n.stop ?? '').trim() || 'Stop', lat, lng }
      }).filter(Boolean)

      if (!parsed.length) { setErrors({ upload:'No valid rows. Need: label, lat, lng' }); return }
      setStops(prev => [...prev, ...parsed])
      setGroupsRestored(false) // stops changed → re-cluster on next Step 2
      setErrors({})
    } catch(e) { setErrors({ upload: 'File error: ' + e.message }) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  // ── Polygon selection ──
  const closePolygon = () => {
    if (polyPts.length < 3) return
    const L = window.L, map = mapInst.current
    if (polyFillRef.current) map.removeLayer(polyFillRef.current)
    if (polyDrawRef.current) map.removeLayer(polyDrawRef.current)
    polyFillRef.current = L.polygon(polyPts, { color:'#f97316', fillOpacity:0.12, weight:2 }).addTo(map)
    setSelStops(new Set(groups.flat().filter(s => pointInPoly([s.lat, s.lng], polyPts)).map(s => s.id)))
  }

  const clearSelection = () => {
    const map = mapInst.current
    if (polyDrawRef.current && map) { map.removeLayer(polyDrawRef.current); polyDrawRef.current = null }
    if (polyFillRef.current && map) { map.removeLayer(polyFillRef.current); polyFillRef.current = null }
    setPolyPts([]); setSelStops(new Set())
  }

  // ── Assign selected stops to vehicle ──
  const assignSelected = (toGi) => {
    if (!selStops.size) return
    const dp = parseLatLng(destCoord)
    setGroups(prev => {
      const next = prev.map(g => [...g])
      const toMove = []
      next.forEach((g, gi) => {
        if (gi === toGi) return
        const moving = g.filter(s => selStops.has(s.id))
        if (moving.length) { toMove.push(...moving); next[gi] = g.filter(s => !selStops.has(s.id)) }
      })
      const poolMoving = stopsPool.filter(s => selStops.has(s.id))
      if (poolMoving.length) { toMove.push(...poolMoving); setStopsPool(prev => prev.filter(s => !selStops.has(s.id))) }
      next[toGi] = seqTowardDest([...next[toGi], ...toMove], dp)
      return next
    })
    clearSelection()
  }

  // ── Remove stop from group → Unassigned Pool ──
  const removeFromGroup = (gi, sid) => {
    const stop = groups[gi]?.find(s => s.id === sid)
    if (!stop) return
    setGroups(prev => prev.map((g, i) => {
      if (i !== gi) return g
      return seqTowardDest(g.filter(s => s.id !== sid), parseLatLng(destCoord))
    }))
    setStopsPool(prev => [...prev, stop])
  }

  const removeFromPool = (sid) => setStopsPool(prev => prev.filter(s => s.id !== sid))

  // ── Sidebar drag & drop ──
  const dragInfo = useRef(null)
  const onDragStart     = (e, stopId, fromGi) => { dragInfo.current = { stopId, fromGi }; e.dataTransfer.effectAllowed = 'move' }
  const onPoolDragStart = (e, stopId)         => { dragInfo.current = { stopId, fromGi: 'pool' }; e.dataTransfer.effectAllowed = 'move' }
  const onDragOver      = e => e.preventDefault()

  const onDrop = (e, toGi) => {
    e.preventDefault()
    const { stopId, fromGi } = dragInfo.current || {}
    if (!stopId) return
    const dp = parseLatLng(destCoord)

    if (fromGi === 'pool') {
      const stop = stopsPool.find(s => s.id === stopId)
      if (!stop) return
      setStopsPool(prev => prev.filter(s => s.id !== stopId))
      setGroups(prev => { const n = prev.map(g=>[...g]); n[toGi] = seqTowardDest([...n[toGi], stop], dp); return n })
    } else if (fromGi !== toGi) {
      setGroups(prev => {
        const n = prev.map(g=>[...g])
        const s = n[fromGi].find(x => x.id === stopId); if (!s) return prev
        n[fromGi] = seqTowardDest(n[fromGi].filter(x => x.id !== stopId), dp)
        n[toGi]   = seqTowardDest([...n[toGi], s], dp)
        return n
      })
    }
    dragInfo.current = null
  }

  // ── Inline add stop to vehicle (Step 2) ──────────
  const toggleAddForm = (gi) => {
    setAddForms(prev => ({
      ...prev,
      [gi]: prev[gi] ? null : { name: '', coord: '', error: '' }
    }))
  }

  const handleInlineAdd = (gi) => {
    const form = addForms[gi]
    if (!form) return
    const coord = parseLatLng(form.coord)
    if (!coord) {
      setAddForms(prev => ({ ...prev, [gi]: { ...form, error: 'Format: 31.5204, 74.3587' } }))
      return
    }
    const newStop = { id: uid(), name: form.name.trim() || `Stop ${groups[gi].length + 1}`, lat: coord.lat, lng: coord.lng }
    const dp = parseLatLng(destCoord)
    setGroups(prev => {
      const n = prev.map(g=>[...g])
      n[gi] = seqTowardDest([...n[gi], newStop], dp)
      return n
    })
    setAddForms(prev => ({ ...prev, [gi]: null }))
  }

  // ── Save ──
  const handleSave = async () => {
    setSaving(true)
    try {
      const dp = parseLatLng(destCoord)
      const payload = {
        name: name.trim(), dest: dest.trim(),
        destLat: dp?.lat || null, destLng: dp?.lng || null,
        routes: groups.map((g, i) => ({
          name: vNames[i] || `Vehicle ${i+1}`,
          stops: g.map(({ id, ...rest }) => rest),
          color: COLORS[i % COLORS.length],
          distance: routeLines[i]?.distance || null,
          duration: routeLines[i]?.duration || null,
        }))
      }
      if (isEdit) await updateRoute(id, payload)
      else await addRoute(payload)
      navigate('/routes')
    } catch(e) { setErrors({ save: 'Save failed. Try again.' }) }
    finally { setSaving(false) }
  }

  const rawGroups   = splitGroups(stops, actualPer)
  const totalDist   = routeLines.reduce((a, r) => a + (r?.distance || 0), 0)
  const totalTime   = routeLines.reduce((a, r) => a + (r?.duration || 0), 0)

  // ══════════════════════════════════════════════════════
  return (
    <div className={styles.page}>

      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`} onClick={() => navigate('/routes')}>
          <ArrowLeft size={14} /> Back
        </button>
        <span className={styles.topTitle}>{isEdit ? '✏ Edit Route' : '+ New Route'}</span>
        <div className={styles.stepPills}>
          {['1. Add Stops', '2. Map & Assign'].map((lbl, i) => (
            <div key={i} className={`${styles.pill} ${step===i+1?styles.pillActive:''} ${step>i+1?styles.pillDone:''}`}>
              {step > i+1 ? '✓ ' : ''}{lbl}
            </div>
          ))}
        </div>
      </div>

      {/* ══════════ STEP 1 ══════════ */}
      {step === 1 && (
        <div className={styles.body}>
          <div className={styles.twoCol}>

            {/* Left: Route config */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Route Info</div>

              <label className={styles.lbl}>Route Group Name *</label>
              <input className={`${styles.inp} ${errors.name?styles.inpErr:''}`}
                value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Morning Shift A" />
              {errors.name && <span className={styles.err}>{errors.name}</span>}

              <label className={styles.lbl} style={{marginTop:12}}>Destination Name *</label>
              <input className={`${styles.inp} ${errors.dest?styles.inpErr:''}`}
                value={dest} onChange={e=>setDest(e.target.value)} placeholder="e.g. BusCaro Office, DHA" />
              {errors.dest && <span className={styles.err}>{errors.dest}</span>}

              <label className={styles.lbl} style={{marginTop:12}}>Destination Lat, Lng *</label>
              <input className={`${styles.inp} ${errors.destCoord?styles.inpErr:''}`}
                value={destCoord} onChange={e=>setDestCoord(e.target.value)}
                placeholder="31.4750, 74.4012" style={{fontFamily:'monospace',fontSize:13}} />
              {errors.destCoord && <span className={styles.err}>{errors.destCoord}</span>}

              <div className={styles.divider} />
              <div className={styles.cardTitle}>Stops Per Vehicle</div>
              <p className={styles.hint}>
                {stops.length} stops → <strong>{stops.length ? Math.ceil(stops.length/actualPer) : 0} vehicles</strong> ({actualPer} stops each)
              </p>
              <div className={styles.chipRow}>
                {PER_VEHICLE_OPTS.map(n => (
                  <button key={n} className={`${styles.chip} ${!useCustom&&perVehicle===n?styles.chipOn:''}`}
                    onClick={()=>{setPerVehicle(n);setUseCustom(false)}}>{n}</button>
                ))}
                <button className={`${styles.chip} ${useCustom?styles.chipOn:''}`} onClick={()=>setUseCustom(true)}>Custom</button>
              </div>
              {useCustom && (
                <input type="number" min="1" max="100" className={styles.inp}
                  value={customVal} onChange={e=>setCustomVal(e.target.value)}
                  placeholder="e.g. 7" style={{width:120,marginTop:8}} />
              )}
              <div className={styles.divider} />

              {/* Edit mode indicator */}
              {isEdit && groupsRestored && (
                <div className={styles.editRestoreNote}>
                  ✅ Saved vehicle assignments loaded — Step 2 pe existing grouping restore hogi
                </div>
              )}

              <div className={styles.smartBadge}>
                <Wand2 size={12} /> Smart geographic clustering + destination-aware sequencing on Next
              </div>
            </div>

            {/* Right: Add stops */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Pickup Stops</div>
              <div className={styles.addRow}>
                <input className={styles.inp} value={stopName}
                  onChange={e=>setStopName(e.target.value)} placeholder="Stop name (optional)"
                  onKeyDown={e=>e.key==='Enter'&&addStopManual()} style={{flex:1}} />
                <input className={`${styles.inp} ${errors.stopCoord?styles.inpErr:''}`}
                  value={stopCoord} onChange={e=>setStopCoord(e.target.value)}
                  placeholder="31.5204, 74.3587" style={{flex:1.4,fontFamily:'monospace',fontSize:12}}
                  onKeyDown={e=>e.key==='Enter'&&addStopManual()} />
                <button className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`} onClick={addStopManual} style={{flexShrink:0}}>
                  <Plus size={14}/> Add
                </button>
              </div>
              {errors.stopCoord && <span className={styles.err}>{errors.stopCoord}</span>}

              <div className={styles.bulkRow}>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
                  style={{display:'none'}} onChange={e=>handleUpload(e.target.files[0])} />
                <button className={styles.uploadBtn} disabled={uploading} onClick={()=>fileRef.current?.click()}>
                  <Upload size={13}/> {uploading?'Reading...':'Bulk Upload (CSV / Excel)'}
                </button>
                <span className={styles.uploadHint}>Columns: <code>label, lat, lng</code></span>
              </div>
              {errors.upload && <div className={styles.errBox}>{errors.upload}</div>}
              {errors.stops  && <div className={styles.errBox}>{errors.stops}</div>}

              <div className={styles.listHeader}>
                <span>{stops.length} stop{stops.length!==1?'s':''}</span>
                {stops.length > 0 && (
                  <button className={styles.clearBtn} onClick={()=>window.confirm('Clear all stops?')&&setStops([])}>Clear all</button>
                )}
              </div>
              <div className={styles.stopsList}>
                {stops.length === 0 && <div className={styles.empty}>No stops yet — add above or bulk upload</div>}
                {stops.map((s, i) => (
                  <div key={s.id} className={styles.stopRow}>
                    <span className={styles.stopNum}>{i+1}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div className={styles.stopName}>{s.name}</div>
                      <div className={styles.stopCoord}>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</div>
                    </div>
                    <button className={styles.reorderBtn} onClick={()=>moveStop(s.id,-1)} disabled={i===0}>↑</button>
                    <button className={styles.reorderBtn} onClick={()=>moveStop(s.id,1)} disabled={i===stops.length-1}>↓</button>
                    <button className={styles.removeBtn} onClick={()=>removeStop(s.id)}><Trash2 size={12}/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          {stops.length > 0 && (
            <div className={styles.card} style={{marginTop:16}}>
              <div className={styles.cardTitle}>
                Preview — {rawGroups.length} vehicle{rawGroups.length!==1?'s':''}
                <span className={styles.previewNote}> (smart cluster will re-sequence on Next)</span>
              </div>
              <div className={styles.previewGrid}>
                {rawGroups.map((g,i) => (
                  <div key={i} className={styles.previewCard} style={{borderTopColor:COLORS[i%COLORS.length]}}>
                    <div className={styles.previewHead}>
                      <span style={{color:COLORS[i%COLORS.length],fontWeight:700,fontSize:12}}>Vehicle {i+1}</span>
                      <span className={`${ui.badge} ${ui.badgeOrange}`}>{g.length} stops</span>
                    </div>
                    {g.slice(0,4).map((s,si) => (
                      <div key={si} className={styles.previewStop}>
                        <span style={{color:COLORS[i%COLORS.length],fontWeight:700,fontSize:10}}>{si+1}.</span>
                        <span>{s.name}</span>
                      </div>
                    ))}
                    {g.length > 4 && <div className={styles.previewMore}>+{g.length-4} more</div>}
                    <div className={styles.previewDest}>→ 🏁 {dest || 'Destination'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.footer}>
            <div style={{flex:1}}/>
            <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={goToStep2}>
              <Wand2 size={14}/> {isEdit && groupsRestored ? 'Edit Assignments' : 'Smart Cluster & Next'} <ChevronRight size={15}/>
            </button>
          </div>
        </div>
      )}

      {/* ══════════ STEP 2 ══════════ */}
      {step === 2 && (
        <div className={styles.mapPage}>

          {/* Sidebar */}
          <div className={styles.sidebar}>

            {loadingRoutes && (
              <div className={styles.sidebarTop}>
                <span className={styles.loadingTxt}>
                  <RefreshCw size={11} style={{animation:'spin .7s linear infinite'}}/> Fetching road data...
                </span>
              </div>
            )}

            {(totalDist > 0 || totalTime > 0) && (
              <div className={styles.routeStats}>
                <div className={styles.statItem}><Route size={12}/> Total: {fmtDist(totalDist)}</div>
                <div className={styles.statItem}><Clock size={12}/> Est: {fmtTime(totalTime)}</div>
              </div>
            )}

            <div className={styles.kmNote}>
              ℹ KM = OSRM road distance. Google Maps may show slight variation due to different routing engine.
            </div>

            <div className={styles.modeRow}>
              <button className={`${styles.modeBtn} ${mapMode==='pin'?styles.modeSel:''}`}
                onClick={()=>{setMapMode('pin');clearSelection()}}>
                <MousePointer2 size={13}/> Click Pin
              </button>
              <button className={`${styles.modeBtn} ${mapMode==='polygon'?styles.modeSel:''}`}
                onClick={()=>{setMapMode('polygon');setSelStops(new Set())}}>
                <Pentagon size={13}/> Draw Area
              </button>
              {(polyPts.length > 0 || selStops.size > 0) && (
                <button className={styles.clearSelBtn} onClick={clearSelection}><X size={12}/> Clear</button>
              )}
            </div>

            {mapMode === 'polygon' && (
              <div className={styles.hintBox}>
                Map pe click karke polygon draw karo.{' '}
                {polyPts.length >= 3 && (
                  <button className={styles.closePolyBtn} onClick={closePolygon}>
                    Close & Select ({polyPts.length} pts)
                  </button>
                )}
              </div>
            )}
            {mapMode === 'pin' && (
              <div className={styles.hintBox}>
                Pin click = select. Popup mein ↑↓ se isi route mein move ya doosre vehicle mein transfer karo.
              </div>
            )}

            {selStops.size > 0 && (
              <div className={styles.assignBox}>
                <div className={styles.assignLabel}>{selStops.size} selected — assign to:</div>
                <div className={styles.assignBtns}>
                  {groups.map((_, gi) => (
                    <button key={gi} className={styles.assignBtn}
                      style={{borderColor:COLORS[gi%COLORS.length],color:COLORS[gi%COLORS.length]}}
                      onClick={()=>assignSelected(gi)}>
                      {vNames[gi]||`Vehicle ${gi+1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stopsPool.length > 0 && (
              <div className={styles.poolBox}>
                <div className={styles.poolTitle}>
                  <AlertTriangle size={12} color="#d97706"/>
                  <span>Unassigned Pool</span>
                  <span className={styles.poolCount}>{stopsPool.length}</span>
                </div>
                <p className={styles.poolSubtitle}>
                  Map par grey (?) pins ke tor par dikh rahe hain — drag karke assign karo
                </p>
                {stopsPool.map(s => (
                  <div key={s.id} className={styles.poolStop}
                    draggable onDragStart={e=>onPoolDragStart(e,s.id)}>
                    <GripVertical size={11} color="#cbd5e1"/>
                    <span className={styles.dragName}>{s.name}</span>
                    <button className={styles.dragDel} onClick={()=>removeFromPool(s.id)} title="Delete permanently">
                      <Trash2 size={10}/>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Vehicle cards */}
            <div className={styles.vehicleList}>
              {groups.map((grp, gi) => {
                const info   = routeLines[gi]
                const gmUrl  = buildGMapsUrl(grp, destParsed?.lat, destParsed?.lng)
                const form   = addForms[gi]

                return (
                  <div key={gi} className={styles.vCard}
                    onDragOver={onDragOver}
                    onDrop={e => onDrop(e, gi)}>

                    <div className={styles.vHead}>
                      <span className={styles.vDot} style={{background:COLORS[gi%COLORS.length]}}/>
                      <input className={styles.vNameInp}
                        value={vNames[gi]||''} placeholder={`Vehicle ${gi+1}`}
                        onChange={e=>{const u=[...vNames];u[gi]=e.target.value;setVNames(u)}} />
                      <span className={`${ui.badge} ${ui.badgeBlue}`} style={{flexShrink:0}}>
                        {grp.length} stops
                      </span>
                      {gmUrl && (
                        <a href={gmUrl} target="_blank" rel="noopener noreferrer"
                          className={styles.gmBtn} title="Open in Google Maps">
                          <Navigation size={11}/>
                        </a>
                      )}
                    </div>

                    {(info?.distance || info?.duration) && (
                      <div className={styles.vStats}>
                        {info.distance && <span><Route size={10}/> {fmtDist(info.distance)}</span>}
                        {info.duration && <span><Clock size={10}/> {fmtTime(info.duration)}</span>}
                      </div>
                    )}

                    <div className={styles.destIndicator}>
                      <span>Stop 1 → … → Stop {grp.length} → 🏁 {dest}</span>
                    </div>

                    <div className={styles.dragList}>
                      {grp.map((s, si) => (
                        <div key={s.id} className={styles.dragStop}
                          draggable onDragStart={e=>onDragStart(e,s.id,gi)}>
                          <GripVertical size={11} color="#cbd5e1"/>
                          <span style={{color:COLORS[gi%COLORS.length],fontWeight:700,fontSize:10,minWidth:14,flexShrink:0}}>{si+1}</span>
                          <span className={styles.dragName}>{s.name}</span>
                          <button className={styles.seqBtn}
                            disabled={si === 0}
                            onClick={()=>setGroups(prev=>{const n=prev.map(g=>[...g]);n[gi]=moveInGroup(n[gi],s.id,-1);return n})}
                            title="Move up">
                            <ArrowUp size={9}/>
                          </button>
                          <button className={styles.seqBtn}
                            disabled={si === grp.length - 1}
                            onClick={()=>setGroups(prev=>{const n=prev.map(g=>[...g]);n[gi]=moveInGroup(n[gi],s.id,1);return n})}
                            title="Move down">
                            <ArrowDown size={9}/>
                          </button>
                          <button className={styles.dragDel}
                            onClick={()=>removeFromGroup(gi,s.id)}
                            title="Remove → Unassigned Pool">
                            <X size={10}/>
                          </button>
                        </div>
                      ))}
                      {grp.length === 0 && <div className={styles.dropHere}>Drop stops here</div>}
                    </div>

                    {form ? (
                      <div className={styles.inlineAddForm}>
                        <input
                          className={styles.inlineInp}
                          placeholder="Name (optional)"
                          value={form.name}
                          onChange={e=>setAddForms(p=>({...p,[gi]:{...p[gi],name:e.target.value}}))}
                          onKeyDown={e=>e.key==='Enter'&&handleInlineAdd(gi)}
                        />
                        <input
                          className={`${styles.inlineInp} ${form.error?styles.inpErr:''}`}
                          placeholder="31.5204, 74.3587"
                          value={form.coord}
                          style={{fontFamily:'monospace',fontSize:11}}
                          onChange={e=>setAddForms(p=>({...p,[gi]:{...p[gi],coord:e.target.value,error:''}}))}
                          onKeyDown={e=>e.key==='Enter'&&handleInlineAdd(gi)}
                        />
                        {form.error && <span className={styles.inlineErr}>{form.error}</span>}
                        <div className={styles.inlineActions}>
                          <button className={styles.inlineAddBtn} onClick={()=>handleInlineAdd(gi)}>
                            <Check size={11}/> Add
                          </button>
                          <button className={styles.inlineCancelBtn} onClick={()=>toggleAddForm(gi)}>
                            <X size={11}/> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className={styles.addStopToRouteBtn} onClick={()=>toggleAddForm(gi)}>
                        <Plus size={11}/> Add Stop to This Route
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Map */}
          <div className={styles.mapWrap}>
            {!leafletReady && (
              <div className={styles.mapLoading}><div className={ui.spinner}/><span>Loading map...</span></div>
            )}
            <div ref={mapRef} className={styles.map} />
          </div>
        </div>
      )}

      {/* Step 2 footer */}
      {step === 2 && (
        <div className={styles.mapFooter}>
          <button className={`${ui.btn} ${ui.btnOutline}`} onClick={()=>setStep(1)}>
            <ChevronLeft size={14}/> Back
          </button>
          <div style={{flex:1}}/>
          {stopsPool.length > 0 && (
            <div className={styles.poolWarn}>
              <AlertTriangle size={13}/> {stopsPool.length} stop{stopsPool.length!==1?'s':''} unassigned
            </div>
          )}
          <button className={styles.exportBtn} onClick={()=>doExportCSV(name,dest,groups,vNames)}>
            <Download size={13}/> CSV
          </button>
          <button className={styles.exportBtn} onClick={()=>doExportPDF(name,dest,groups,vNames,destParsed?.lat,destParsed?.lng,routeLines)}>
            <Download size={13}/> PDF
          </button>
          {errors.save && <div className={styles.saveErr}><AlertTriangle size={13}/> {errors.save}</div>}
          <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={handleSave} disabled={saving}>
            {saving
              ? <><RefreshCw size={14} style={{animation:'spin 0.7s linear infinite'}}/> Saving...</>
              : <><Check size={14}/> Save Route</>}
          </button>
        </div>
      )}
    </div>
  )
}