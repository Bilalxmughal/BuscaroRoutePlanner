// src/components/LeftPanel/LeftPanel.jsx
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Route, MapPin,
  ChevronLeft, ChevronRight, Bus
} from 'lucide-react'
import styles from './LeftPanel.module.css'

const NAV = [
  { name: 'Dashboard', path: '/',       icon: LayoutDashboard, section: 'Main' },
  { name: 'Routes',    path: '/routes', icon: Route,           section: 'Main' },
  { name: 'Map View',  path: '/map',    icon: MapPin,          section: 'Main' },
]

export default function LeftPanel({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  return (
    <aside className={`${styles.leftPanel} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.open : ''}`}>
      {/* Logo */}
      <div className={styles.logoSection}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}><Bus size={18} /></div>
          {!collapsed && (
            <div className={styles.logoText}>
              <h1>BusCaro</h1>
              <span>Route Planner</span>
            </div>
          )}
        </div>
        <button className={styles.collapseBtn} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Nav */}
      <nav className={styles.navMenu}>
        {NAV.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              data-title={item.name}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => mobileOpen && setMobileOpen(false)}
            >
              <Icon size={17} />
              {!collapsed && <span>{item.name}</span>}
            </NavLink>
          )
        })}
      </nav>

      {!collapsed && (
        <div className={styles.panelFooter}>
          <p>v1.0 · © 2025 BusCaro</p>
        </div>
      )}
    </aside>
  )
}