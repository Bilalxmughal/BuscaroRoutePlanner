// src/pages/Dashboard.jsx
import { useNavigate } from 'react-router-dom'
import { useRoutes } from '../context/RoutesContext'
import { Route, MapPin, Car, Plus, RefreshCw } from 'lucide-react'
import ui from '../components/common/ui.module.css'
import styles from './Dashboard.module.css'

const COLORS = ['#f97316','#2563eb','#16a34a','#9333ea','#dc2626','#0891b2','#d97706','#be185d']

export default function Dashboard() {
  const { routes, loading, error, reload } = useRoutes()
  const navigate = useNavigate()

  const totalRoutes = routes.length
  const totalVehicles = routes.reduce((a, r) => a + (r.routes?.length || 0), 0)
  const totalStops = routes.reduce((a, r) => a + (r.routes?.reduce((b, g) => b + g.stops.length, 0) || 0), 0)

  const stats = [
    { label: 'Route Groups', value: totalRoutes, icon: Route, color: '#f97316', bg: '#fff4ed' },
    { label: 'Total Vehicles', value: totalVehicles, icon: Car, color: '#2563eb', bg: '#eff6ff' },
    { label: 'Total Stops', value: totalStops, icon: MapPin, color: '#16a34a', bg: '#f0fdf4' },
  ]

  if (loading) return (
    <div className={styles.center}>
      <div className={ui.spinner} />
      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 12 }}>Loading...</p>
    </div>
  )

  if (error) return (
    <div className={styles.center}>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '20px 28px', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>⚠ {error}</p>
        <button className={`${ui.btn} ${ui.btnOutline}`} onClick={reload}>
          <RefreshCw size={14} /> Try Again
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div className={ui.pageHeader}>
        <div>
          <div className={ui.pageTitle}>Dashboard</div>
          <div className={ui.pageSubtitle}>BusCaro Route Planner — Overview</div>
        </div>
        <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => navigate('/routes')}>
          <Plus size={15} /> Create Route
        </button>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: s.bg, color: s.color }}>
                <Icon size={20} />
              </div>
              <div className={styles.statNum}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* Recent routes */}
      <div className={styles.sectionTitle}>Recent Routes</div>
      {routes.length === 0 ? (
        <div className={ui.emptyState}>
          <div className={ui.emptyIcon}>🗺</div>
          <div style={{ fontWeight: 600, color: '#475569' }}>Route didn't found</div>
          <p style={{ fontSize: 13 }}>First, Create Route</p>
          <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => navigate('/routes')}>
            <Plus size={14} /> Create Route
          </button>
        </div>
      ) : (
        <div className={styles.recentGrid}>
          {routes.slice(0, 6).map((r, idx) => (
            <div
              key={r.id}
              className={styles.recentCard}
              onClick={() => navigate(`/map/${r.id}`)}
              style={{ borderTop: `3px solid ${COLORS[idx % COLORS.length]}` }}
            >
              <div className={styles.recentName}>{r.name}</div>
              <div className={styles.recentDest}>📍 {r.dest}</div>
              <div className={styles.recentMeta}>
                <span className={`${ui.badge} ${ui.badgeOrange}`}>{r.routes?.length || 0} vehicles</span>
                <span className={`${ui.badge} ${ui.badgeBlue}`}>{r.routes?.reduce((a, g) => a + g.stops.length, 0) || 0} stops</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}