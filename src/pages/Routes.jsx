// src/pages/Routes.jsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoutes } from '../context/RoutesContext'
import DeleteWarning from '../components/common/DeleteWarning'
import {
  Plus, Map, Edit2, Trash2, RefreshCw, Navigation,
  Search, SortAsc, X, ChevronRight, ArrowLeft,
  MapPin, Bus, Clock, Route, Flag
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

      {/* ── Vehicle cards grid ── */}
      <div className={styles.detailBody}>
        <div className={styles.detailSectionTitle}>
          <Bus size={14} /> Vehicle Routes
        </div>

        <div className={styles.vehicleGrid}>
          {route.routes?.map((g, i) => {
            const col    = COLORS[i % COLORS.length]
            const gmUrl  = buildGMapsUrl(g.stops, route.destLat, route.destLng)
            const isOpen = expandedVehicle === i

            return (
              <div key={i} className={`${styles.vBlock} ${isOpen ? styles.vBlockOpen : ''}`}
                style={{ '--vcol': col }}>

                {/* Vehicle header */}
                <div className={styles.vBlockHead}
                  onClick={() => setExpandedVehicle(isOpen ? null : i)}>
                  <div className={styles.vColorBar} style={{ background: col }} />
                  <div className={styles.vBlockInfo}>
                    <div className={styles.vBlockName}>{g.name}</div>
                    <div className={styles.vBlockMeta}>
                      {g.distance && <span><Route size={10} /> {fmtDist(g.distance)}</span>}
                      {g.duration && <span><Clock size={10} /> {fmtTime(g.duration)}</span>}
                    </div>
                  </div>
                  <div className={styles.vBlockRight}>
                    <span className={`${ui.badge} ${ui.badgeBlue}`}>{g.stops.length} stops</span>
                    {gmUrl && (
                      <a href={gmUrl} target="_blank" rel="noopener noreferrer"
                        className={styles.gmBtn}
                        onClick={e => e.stopPropagation()}
                        title="Open in Google Maps">
                        <Navigation size={11} /> Maps
                      </a>
                    )}
                    <ChevronRight size={14} className={`${styles.vChevron} ${isOpen ? styles.vChevronOpen : ''}`} />
                  </div>
                </div>

                {/* Stops list — collapsible */}
                {isOpen && (
                  <div className={styles.vStopsList}>
                    {g.stops.map((s, si) => (
                      <div key={si} className={styles.vStopRow}>
                        <span className={styles.vStopNum} style={{ background: col }}>{si + 1}</span>
                        <div className={styles.vStopInfo}>
                          <span className={styles.vStopName}>{s.name}</span>
                          <span className={styles.vStopCoord}>{s.lat?.toFixed(5)}, {s.lng?.toFixed(5)}</span>
                        </div>
                      </div>
                    ))}
                    {/* Destination endpoint */}
                    {route.destLat && (
                      <div className={styles.vStopRow} style={{ opacity: 0.8 }}>
                        <span className={styles.vStopNum} style={{ background: '#dc2626', fontSize: 11 }}>
                          <Flag size={10} />
                        </span>
                        <div className={styles.vStopInfo}>
                          <span className={styles.vStopName} style={{ color: '#dc2626', fontWeight: 700 }}>
                            {route.dest}
                          </span>
                          <span className={styles.vStopCoord}>
                            {route.destLat?.toFixed(5)}, {route.destLng?.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    )}
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

  // Filters
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

  // ── If a route is selected, show full detail page ──────
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

  // ── List view ──────────────────────────────────────────
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

      {/* Filters bar */}
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
                {v === 'all' ? 'All' : `${v}${v==='4+'?'':''} vehicle${v==='1'?'':'s'}`}
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
            <span className={styles.resultCount}>
              {filtered.length} of {routes.length} shown
            </span>
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

      {/* No results after filter */}
      {routes.length > 0 && filtered.length === 0 && (
        <div className={ui.emptyState}>
          <div className={ui.emptyIcon}>🔍</div>
          <div style={{ fontWeight: 600, color: '#475569', fontSize: 15 }}>No routes match</div>
          <button className={`${ui.btn} ${ui.btnOutline}`} onClick={() => { setSearch(''); setVehicleFilter('all') }}>
            Clear Filters
          </button>
        </div>
      )}

      {/* Route cards grid */}
      {filtered.length > 0 && (
        <div className={styles.grid}>
          {filtered.map((r, idx) => {
            const totalStops = r.routes?.reduce((a, g) => a + g.stops.length, 0) || 0
            const color      = COLORS[idx % COLORS.length]

            return (
              <div key={r.id} className={styles.card}
                onClick={() => { setSelectedRoute(r); setSelectedIdx(idx) }}>

                <div className={styles.colorBar} style={{ background: color }} />

                <div className={styles.cardBody}>
                  <div className={styles.cardTop}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.cardName}>{r.name}</div>
                      <div className={styles.cardDest}>
                        <MapPin size={11} /> {r.dest}
                      </div>
                    </div>
                    <ChevronRight size={16} className={styles.cardArrow} />
                  </div>

                  <div className={styles.cardBadges}>
                    <span className={`${ui.badge} ${ui.badgeOrange}`}>
                      <Bus size={10} /> {r.routes?.length || 0} vehicles
                    </span>
                    <span className={`${ui.badge} ${ui.badgeBlue}`}>
                      {totalStops} stops
                    </span>
                  </div>

                  <div className={styles.miniRoutes}>
                    {r.routes?.slice(0, 3).map((g, i) => (
                      <div key={i} className={styles.miniRow}>
                        <div className={styles.miniDot} style={{ background: COLORS[i % COLORS.length] }} />
                        <span className={styles.miniName}>{g.name}</span>
                        <span className={styles.miniCount}>{g.stops.length}</span>
                      </div>
                    ))}
                    {(r.routes?.length || 0) > 3 && (
                      <div className={styles.miniMore}>+{r.routes.length - 3} more vehicles</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
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