// src/components/Layout/Layout.jsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import LeftPanel from '../LeftPanel/LeftPanel'
import styles from './Layout.module.css'
import { Menu } from 'lucide-react'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className={`${styles.layout} ${collapsed ? styles.sidebarCollapsed : ''}`}>
      <LeftPanel
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      {mobileOpen && (
        <div className={`${styles.mobileOverlay} ${styles.open}`} onClick={() => setMobileOpen(false)} />
      )}
      <button className={styles.mobileMenuBtn} onClick={() => setMobileOpen(true)}>
        <Menu size={18} />
      </button>
      <div className={styles.mainContent}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}