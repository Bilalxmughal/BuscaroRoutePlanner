// src/pages/Routes.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoutes } from '../context/RoutesContext'
import DeleteWarning from '../components/common/DeleteWarning'
import { Plus, Map, Edit2, Trash2, RefreshCw, Navigation } from 'lucide-react'
import ui from '../components/common/ui.module.css'
import styles from './Routes.module.css'

const COLORS = ['#f97316','#2563eb','#16a34a','#9333ea','#dc2626','#0891b2','#d97706','#be185d','#059669','#7c3aed']

function buildGoogleMapsUrl(stops, destLat, destLng) {
  if (!stops || !stops.length) return null
  const validStops = stops.filter(s => s.lat && s.lng)
  if (!validStops.length) return null
  const origin = `${validStops[0].lat},${validStops[0].lng}`
  const lastStop = validStops[validStops.length - 1]
  const destination = destLat ? `${destLat},${destLng}` : `${lastStop.lat},${lastStop.lng}`
  const midStops = validStops.slice(1, destLat ? undefined : -1)
  const waypoints = midStops.map(s => `${s.lat},${s.lng}`).join('|')
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`
  return url
}

export default function Routes() {
  const { routes, loading, error, deleteRoute, reload } = useRoutes()
  const navigate = useNavigate()
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [expandedRoute, setExpandedRoute] = useState(null)

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteRoute(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      alert('Delete failed. Please try again.')
    } finally {
      setDeleting(false)
    }
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
        <button className={`${ui.btn} ${ui.btnOutline}`} onClick={reload}><RefreshCw size={14} /> Retry</button>
      </div>
    </div>
  )

  return (
    <div>
      <div className={ui.pageHeader}>
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

      {routes.length === 0 ? (
        <div className={ui.emptyState}>
          <div className={ui.emptyIcon}>🗺</div>
          <div style={{ fontWeight: 600, color: '#475569', fontSize: 15 }}>No routes found</div>
          <p style={{ fontSize: 13 }}>Create your first route</p>
          <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => navigate('/routes/new')}>
            <Plus size={14} /> Create First Route
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {routes.map((r, idx) => {
            const totalStops = r.routes?.reduce((a, g) => a + g.stops.length, 0) || 0
            const isExpanded = expandedRoute === r.id
            return (
              <div key={r.id} className={styles.card}>
                <div className={styles.cardTop} style={{ borderTop: `3px solid ${COLORS[idx % COLORS.length]}` }}>
                  <div className={styles.cardName}>{r.name}</div>
                  <div className={styles.cardDest}>📍 {r.dest}</div>
                  <div className={styles.cardBadges}>
                    <span className={`${ui.badge} ${ui.badgeOrange}`}>{r.routes?.length || 0} vehicles</span>
                    <span className={`${ui.badge} ${ui.badgeBlue}`}>{totalStops} stops</span>
                  </div>
                </div>

                {/* Vehicle routes list */}
                <div className={styles.subRoutes}>
                  {r.routes?.map((g, i) => {
                    const gmUrl = buildGoogleMapsUrl(g.stops, r.destLat, r.destLng)
                    return (
                      <div key={i} className={styles.subRouteRow}>
                        <div className={styles.subDot} style={{ background: COLORS[i % COLORS.length] }} />
                        <span className={styles.subName}>{g.name}</span>
                        <span className={styles.subCount}>{g.stops.length} stops</span>
                        {gmUrl && (
                          <a
                            href={gmUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.gmapsBtn}
                            title="Open in Google Maps"
                          >
                            <Navigation size={10} /> Maps
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className={styles.cardActions}>
                  <button
                    className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`}
                    onClick={() => navigate(`/map/${r.id}`)}>
                    <Map size={13} /> Map View
                  </button>
                  <button
                    className={`${ui.btn} ${ui.btnOutline} ${ui.btnSm}`}
                    onClick={() => navigate(`/routes/edit/${r.id}`)}>
                    <Edit2 size={13} /> Edit
                  </button>
                  <button
                    className={`${ui.btn} ${ui.btnDanger} ${ui.btnSm}`}
                    style={{ marginLeft: 'auto' }}
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