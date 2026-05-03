// src/pages/Routes.jsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoutes } from '../context/RoutesContext'
import DeleteWarning from '../components/common/DeleteWarning'
import {
  Plus, Map, Edit2, Trash2, RefreshCw, Navigation,
  Search, SortAsc, X, ChevronRight, ArrowLeft,
  MapPin, Bus, Clock, Route, Flag, Download
} from 'lucide-react'
import ui from '../components/common/ui.module.css'
import styles from './Routes.module.css'

const COLORS = [
  '#f97316','#2563eb','#16a34a','#9333ea','#dc2626',
  '#0891b2','#d97706','#be185d','#059669','#7c3aed'
]

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

function fmtDist(m) {
  if (!m) return null
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
function fmtTime(s) {
  if (!s) return null
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

async function shortenUrl(url) {
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`)
    if (res.ok) return await res.text()
  } catch {}
  return url
}

async function exportCSV(route) {
  const rows = [['Vehicle','Route Label','Stop#','Name','Latitude','Longitude','Distance','Est. Time','Google Maps Link']]
  const shortLinks = await Promise.all(
    (route.routes || []).map(g => {
      const url = buildGMapsUrl(g.stops, route.destLat, route.destLng)
      return url ? shortenUrl(url) : Promise.resolve('')
    })
  )
  route.routes?.forEach((g, gi) => {
    const km   = g.distance ? (g.distance / 1000).toFixed(1) + ' km' : '--'
    const time = g.duration ? fmtTime(g.duration) : '--'
    g.stops.forEach((s, si) => {
      rows.push([
        g.name || `Vehicle ${gi+1}`,
        g.routeLabel || '',
        si + 1,
        s.name,
        s.lat?.toFixed(6),
        s.lng?.toFixed(6),
        si === 0 ? km : '',
        si === 0 ? time : '',
        si === 0 ? shortLinks[gi] : ''
      ])
    })
  })
  const csv = rows.map(r => r.map(c => `"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}))
  a.download = `${route.name.replace(/\s+/g,'_')}_routes.csv`
  a.click()
}

function exportPDF(route) {
  const totalDist = route.routes?.reduce((a,g)=>a+(g.distance||0),0)||0
  const totalTime = route.routes?.reduce((a,g)=>a+(g.duration||0),0)||0
  const lines = [
    `ROUTE GROUP: ${route.name}`,
    `DESTINATION: ${route.dest}`,
    `VEHICLES: ${route.routes?.length||0}`,
    `TOTAL STOPS: ${route.routes?.reduce((a,g)=>a+g.stops.length,0)||0}`,
    totalDist ? `TOTAL DISTANCE: ${fmtDist(totalDist)}` : '',
    totalTime ? `EST. TIME: ${fmtTime(totalTime)}` : '',
    ''
  ].filter(l => l !== null)

  route.routes?.forEach((g, gi) => {
    const label = g.routeLabel ? ` | ${g.routeLabel}` : ''
    const km    = g.distance ? ` · ${fmtDist(g.distance)}` : ''
    const time  = g.duration ? ` · ${fmtTime(g.duration)}` : ''
    lines.push(`── ${g.name||`Vehicle ${gi+1}`}${label} (${g.stops.length} stops${km}${time}) ──`)
    g.stops.forEach((s,si) => lines.push(`  ${si+1}. ${s.name}  [${s.lat?.toFixed(5)}, ${s.lng?.toFixed(5)}]`))
    const gm = buildGMapsUrl(g.stops, route.destLat, route.destLng)
    if (gm) lines.push(`  Google Maps: ${gm}`)
    lines.push('')
  })

  const w = window.open('','_blank')
  w.document.write(`<html><head><title>${route.name}</title>
    <style>body{font-family:monospace;font-size:13px;padding:30px}pre{white-space:pre-wrap;line-height:1.8}@media print{button{display:none}}</style>
    </head><body>
    <h2>BusCaro — Route Export</h2>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 18px;background:#f97316;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Print / Save PDF</button>
    <pre>${lines.join('\n')}</pre></body></html>`)
  w.document.close()
}

// ══════════════════════════════════════════════════════════
// ROUTE DETAIL PAGE
// ══════════════════════════════════════════════════════════
function RouteDetail({ route, idx, onBack, onEdit, onDelete, onMapView }) {
  const [expandedVehicle, setExpandedVehicle] = useState(null)
  const totalStops = route.routes?.reduce((a, g) => a + g.stops.length, 0) || 0
  const color = COLORS[idx % COLORS.length]
  const totalDist = route.routes?.reduce((a, g) => a + (g.distance || 0), 0) || 0
  const totalTime = route.routes?.reduce((a, g) => a + (g.duration || 0), 0) || 0

  return (
    <div className={styles.detailPage}>

      {/* ── Detail Top Bar ── */}
      <div className={styles.detailTopBar}>
        <button className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`} onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className={styles.detailTopMeta}>
          <div className={styles.detailTopName}>{route.name}</div>
          <div className={styles.detailTopDest}>
            <MapPin size={11} /> {route.dest}
          </div>
        </div>
        <div className={styles.detailTopActions}>
          <button className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`} onClick={onMapView}>
            <Map size={13} /> Map
          </button>
          <button className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`} onClick={() => exportCSV(route)}>
            <Download size={13} /> CSV
          </button>
          <button className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`} onClick={() => exportPDF(route)}>
            <Download size={13} /> PDF
          </button>
          <button className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`} onClick={onEdit}>
            <Edit2 size={13} /> Edit
          </button>
          <button className={`${ui.btn} ${ui.btnDanger} ${ui.btnSm}`} onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Hero stats band ── */}
      <div className={styles.detailHero} style={{ borderTopColor: color }}>
        <div className={styles.heroStat}>
          <span className={styles.heroVal} style={{ color }}>{route.routes?.length || 0}</span>
          <span className={styles.heroLbl}>Vehicles</span>
        </div>
        <div className={styles.heroDivider} />
        <div className={styles.heroStat}>
          <span className={styles.heroVal} style={{ color }}>{totalStops}</span>
          <span className={styles.heroLbl}>Total Stops</span>
        </div>
        <div className={styles.heroDivider} />
        <div className={styles.heroStat}>
          <span className={styles.heroVal} style={{ color }}>
            {totalStops && route.routes?.length ? Math.round(totalStops / route.routes.length) : 0}
          </span>
          <span className={styles.heroLbl}>Avg / Vehicle</span>
        </div>
        {totalDist > 0 && <>
          <div className={styles.heroDivider} />
          <div className={styles.heroStat}>
            <span className={styles.heroVal} style={{ color }}>{fmtDist(totalDist)}</span>
            <span className={styles.heroLbl}>Total Distance</span>
          </div>
        </>}
        {totalTime > 0 && <>
          <div className={styles.heroDivider} />
          <div className={styles.heroStat}>
            <span className={styles.heroVal} style={{ color }}>{fmtTime(totalTime)}</span>
            <span className={styles.heroLbl}>Est. Time</span>
          </div>
        </>}
      </div>

      {/* ── Vehicle Table ── */}
      <div className={styles.detailBody}>
        <div className={styles.detailSectionTitle}>
          <Bus size={14} /> Vehicle Routes
        </div>

        {/* Table header */}
        <div className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.thVehicle}>Vehicle</div>
            <div className={styles.thRoute}>Route Name</div>
            <div className={styles.thStops}>Stops</div>
            <div className={styles.thDist}>Distance</div>
            <div className={styles.thTime}>Est. Time</div>
            <div className={styles.thActions}>Actions</div>
          </div>

          {route.routes?.map((g, i) => {
            const col    = COLORS[i % COLORS.length]
            const gmUrl  = buildGMapsUrl(g.stops, route.destLat, route.destLng)
            const isOpen = expandedVehicle === i

            return (
              <div key={i} className={styles.tableGroup}>
                {/* Main row */}
                <div
                  className={`${styles.tableRow} ${isOpen ? styles.tableRowOpen : ''}`}
                  onClick={() => setExpandedVehicle(isOpen ? null : i)}
                  style={{ '--vcol': col }}
                >
                  <div className={styles.tdVehicle}>
                    <div className={styles.vColorDot} style={{ background: col }} />
                    <span className={styles.vNameTxt}>{g.name || `Vehicle ${i+1}`}</span>
                  </div>
                  <div className={styles.tdRoute}>
                    {g.routeLabel
                      ? <span className={styles.routeLabelBadge}>{g.routeLabel}</span>
                      : <span className={styles.routeLabelEmpty}>—</span>
                    }
                  </div>
                  <div className={styles.tdStops}>
                    <span className={styles.stopsBadge}>{g.stops.length}</span>
                  </div>
                  <div className={styles.tdDist}>
                    {g.distance ? (
                      <span className={styles.metaVal}>
                        <Route size={11} /> {fmtDist(g.distance)}
                      </span>
                    ) : <span className={styles.metaEmpty}>—</span>}
                  </div>
                  <div className={styles.tdTime}>
                    {g.duration ? (
                      <span className={styles.metaVal}>
                        <Clock size={11} /> {fmtTime(g.duration)}
                      </span>
                    ) : <span className={styles.metaEmpty}>—</span>}
                  </div>
                  <div className={styles.tdActions} onClick={e => e.stopPropagation()}>
                    {gmUrl && (
                      <a href={gmUrl} target="_blank" rel="noopener noreferrer"
                        className={styles.actionBtn} title="Open in Google Maps">
                        <Navigation size={12} />
                      </a>
                    )}
                    <button
                      className={styles.actionBtn}
                      onClick={() => exportCSV({ ...route, routes: [g] })}
                      title="Export CSV">
                      <Download size={12} />
                    </button>
                    <ChevronRight
                      size={14}
                      className={`${styles.tableChevron} ${isOpen ? styles.tableChevronOpen : ''}`}
                      onClick={e => { e.stopPropagation(); setExpandedVehicle(isOpen ? null : i) }}
                    />
                  </div>
                </div>

                {/* Expanded stops */}
                {isOpen && (
                  <div className={styles.stopsExpanded}>
                    <div className={styles.stopsInner}>
                      {g.stops.map((s, si) => (
                        <div key={si} className={styles.stopERow}>
                          <span className={styles.stopENum} style={{ background: col }}>{si + 1}</span>
                          <div className={styles.stopEInfo}>
                            <span className={styles.stopEName}>{s.name}</span>
                            <span className={styles.stopECoord}>{s.lat?.toFixed(5)}, {s.lng?.toFixed(5)}</span>
                          </div>
                        </div>
                      ))}
                      {route.destLat && (
                        <div className={styles.stopERow}>
                          <span className={styles.stopENum} style={{ background: '#dc2626' }}>
                            <Flag size={9} />
                          </span>
                          <div className={styles.stopEInfo}>
                            <span className={styles.stopEName} style={{ color: '#dc2626' }}>{route.dest}</span>
                            <span className={styles.stopECoord}>{route.destLat?.toFixed(5)}, {route.destLng?.toFixed(5)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function Routes() {
  const { routes, loading, error, deleteRoute, reload } = useRoutes()
  const navigate = useNavigate()

  const [selectedRoute, setSelectedRoute] = useState(null)
  const [selectedIdx,   setSelectedIdx]   = useState(0)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [deleting,      setDeleting]      = useState(false)

  const [search,        setSearch]        = useState('')
  const [sortBy,        setSortBy]        = useState('newest')
  const [vehicleFilter, setVehicleFilter] = useState('all')

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteRoute(deleteTarget.id)
      setDeleteTarget(null)
      setSelectedRoute(null)
    } catch { alert('Delete failed. Try again.') }
    finally { setDeleting(false) }
  }

  const filtered = useMemo(() => {
    let list = [...routes]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.dest?.toLowerCase().includes(q)
      )
    }
    if (vehicleFilter !== 'all') {
      list = list.filter(r => {
        const count = r.routes?.length || 0
        if (vehicleFilter === '1')  return count === 1
        if (vehicleFilter === '2')  return count === 2
        if (vehicleFilter === '3')  return count === 3
        if (vehicleFilter === '4+') return count >= 4
        return true
      })
    }
    list.sort((a, b) => {
      if (sortBy === 'name_az')  return (a.name||'').localeCompare(b.name||'')
      if (sortBy === 'name_za')  return (b.name||'').localeCompare(a.name||'')
      if (sortBy === 'vehicles') return (b.routes?.length||0) - (a.routes?.length||0)
      return 0
    })
    return list
  }, [routes, search, sortBy, vehicleFilter])

  if (selectedRoute) {
    return (
      <>
        <RouteDetail
          route={selectedRoute}
          idx={selectedIdx}
          onBack={() => setSelectedRoute(null)}
          onEdit={() => navigate(`/routes/edit/${selectedRoute.id}`)}
          onDelete={() => { setDeleteTarget(selectedRoute); setSelectedRoute(null) }}
          onMapView={() => navigate(`/map/${selectedRoute.id}`)}
        />
        {deleteTarget && (
          <DeleteWarning
            routeName={deleteTarget.name}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            loading={deleting}
          />
        )}
      </>
    )
  }

  if (loading) return (
    <div className={styles.center}>
      <div className={ui.spinner} />
      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 12 }}>Loading routes...</p>
    </div>
  )

  if (error) return (
    <div className={styles.center}>
      <div className={styles.errorBox}>
        <p>⚠ {error}</p>
        <button className={`${ui.btn} ${ui.btnOutline}`} onClick={reload}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    </div>
  )

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <div className={ui.pageTitle}>Route List</div>
          <div className={ui.pageSubtitle}>
            {routes.length} route group{routes.length !== 1 ? 's' : ''} saved
          </div>
        </div>
        <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => navigate('/routes/new')}>
          <Plus size={15} /> New Route
        </button>
      </div>

      {/* Filters */}
      {routes.length > 0 && (
        <div className={styles.filtersBar}>
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search by name or destination..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => setSearch('')}>
                <X size={13} />
              </button>
            )}
          </div>
          <div className={styles.filterGroup}>
            <Bus size={13} style={{ color: '#94a3b8' }} />
            {['all','1','2','3','4+'].map(v => (
              <button key={v}
                className={`${styles.filterChip} ${vehicleFilter === v ? styles.filterChipOn : ''}`}
                onClick={() => setVehicleFilter(v)}>
                {v === 'all' ? 'All' : `${v} vehicle${v==='1'?'':'s'}`}
              </button>
            ))}
          </div>
          <div className={styles.sortWrap}>
            <SortAsc size={13} style={{ color: '#94a3b8' }} />
            <select className={styles.sortSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name_az">Name A → Z</option>
              <option value="name_za">Name Z → A</option>
              <option value="vehicles">Most Vehicles</option>
            </select>
          </div>
          {filtered.length !== routes.length && (
            <span className={styles.resultCount}>{filtered.length} of {routes.length} shown</span>
          )}
        </div>
      )}

      {/* Empty state */}
      {routes.length === 0 && (
        <div className={ui.emptyState}>
          <div className={ui.emptyIcon}>🗺</div>
          <div style={{ fontWeight: 600, color: '#475569', fontSize: 15 }}>No routes found</div>
          <p style={{ fontSize: 13 }}>Create your first route</p>
          <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => navigate('/routes/new')}>
            <Plus size={14} /> Create First Route
          </button>
        </div>
      )}

      {routes.length > 0 && filtered.length === 0 && (
        <div className={ui.emptyState}>
          <div className={ui.emptyIcon}>🔍</div>
          <div style={{ fontWeight: 600, color: '#475569', fontSize: 15 }}>No routes match</div>
          <button className={`${ui.btn} ${ui.btnOutline}`} onClick={() => { setSearch(''); setVehicleFilter('all') }}>
            Clear Filters
          </button>
        </div>
      )}

      {/* ── Route Table ── */}
      {filtered.length > 0 && (
        <div className={styles.routeTableWrap}>
          {/* Table Header */}
          <div className={styles.routeTableHead}>
            <div className={styles.rthName}>Route Group</div>
            <div className={styles.rthDest}>Destination</div>
            <div className={styles.rthVehicles}>Vehicles</div>
            <div className={styles.rthStops}>Stops</div>
            <div className={styles.rthDist}>Distance</div>
            <div className={styles.rthTime}>Est. Time</div>
            <div className={styles.rthActions}>Actions</div>
          </div>

          {/* Table Rows */}
          {filtered.map((r, idx) => {
            const totalStops = r.routes?.reduce((a, g) => a + g.stops.length, 0) || 0
            const totalDist  = r.routes?.reduce((a, g) => a + (g.distance || 0), 0) || 0
            const totalTime  = r.routes?.reduce((a, g) => a + (g.duration || 0), 0) || 0
            const color      = COLORS[idx % COLORS.length]

            return (
              <div key={r.id} className={styles.routeTableRow}
                onClick={() => { setSelectedRoute(r); setSelectedIdx(idx) }}>

                {/* Color accent */}
                <div className={styles.rowAccent} style={{ background: color }} />

                {/* Route Name */}
                <div className={styles.rtdName}>
                  <span className={styles.rtdNameTxt}>{r.name}</span>
                  {/* Mini vehicle labels */}
                  <div className={styles.rtdMiniLabels}>
                    {r.routes?.slice(0, 2).map((g, i) => (
                      <span key={i} className={styles.rtdMiniLabel}
                        style={{ borderColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length] }}>
                        {g.routeLabel || g.name}
                      </span>
                    ))}
                    {(r.routes?.length || 0) > 2 && (
                      <span className={styles.rtdMiniMore}>+{r.routes.length - 2}</span>
                    )}
                  </div>
                </div>

                {/* Destination */}
                <div className={styles.rtdDest}>
                  <MapPin size={11} style={{ color: '#94a3b8', flexShrink: 0 }} />
                  <span>{r.dest}</span>
                </div>

                {/* Vehicles */}
                <div className={styles.rtdVehicles}>
                  <span className={styles.vehiclesBadge}>
                    <Bus size={11} /> {r.routes?.length || 0}
                  </span>
                </div>

                {/* Stops */}
                <div className={styles.rtdStops}>
                  <span className={styles.stopsTxt}>{totalStops}</span>
                </div>

                {/* Distance */}
                <div className={styles.rtdDist}>
                  {totalDist > 0
                    ? <span className={styles.distTxt}>{fmtDist(totalDist)}</span>
                    : <span className={styles.emptyTxt}>—</span>
                  }
                </div>

                {/* Time */}
                <div className={styles.rtdTime}>
                  {totalTime > 0
                    ? <span className={styles.timeTxt}>{fmtTime(totalTime)}</span>
                    : <span className={styles.emptyTxt}>—</span>
                  }
                </div>

                {/* Actions */}
                <div className={styles.rtdActions} onClick={e => e.stopPropagation()}>
                  <button className={styles.rtActionBtn} title="Export CSV"
                    onClick={() => exportCSV(r)}>
                    <Download size={13} />
                  </button>
                  <button className={styles.rtActionBtn} title="Export PDF"
                    onClick={() => exportPDF(r)}>
                    PDF
                  </button>
                  <button className={styles.rtActionBtn} title="Edit"
                    onClick={() => navigate(`/routes/edit/${r.id}`)}>
                    <Edit2 size={13} />
                  </button>
                  <button className={`${styles.rtActionBtn} ${styles.rtActionDel}`} title="Delete"
                    onClick={() => setDeleteTarget(r)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteWarning
          routeName={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}