// src/components/CreateRoute/CreateRoutePanel.jsx
import { useState, useRef } from 'react'
import { X, Plus, Trash2, RefreshCw, Upload, ChevronRight, ChevronLeft, Map } from 'lucide-react'
import { useRoutes } from '../../context/RoutesContext'
import MapStopAssigner from './MapStopAssigner'
import ui from '../common/ui.module.css'
import styles from './CreateRoutePanel.module.css'

const COLORS = ['#f97316','#2563eb','#16a34a','#9333ea','#dc2626','#0891b2','#d97706','#be185d','#059669','#7c3aed']
const VEHICLE_OPTIONS = [2, 4, 6, 8, 10, 12]

function parseCoord(str) {
  const parts = str.split(',').map(s => parseFloat(s.trim()))
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return { lat: parts[0], lng: parts[1] }
  return null
}

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function CreateRoutePanel({ onClose, editData = null }) {
  const { addRoute, updateRoute } = useRoutes()
  const isEdit = !!editData

  // Step 1 = Info + Stops, Step 2 = Name Routes, Step 3 = Map View
  const [step, setStep] = useState(1)
  const [name, setName] = useState(editData?.name || '')
  const [dest, setDest] = useState(editData?.dest || '')
  const [destCoord, setDestCoord] = useState(
    editData?.destLat ? `${editData.destLat}, ${editData.destLng}` : ''
  )

  // Stops: each stop has { id, name, lat, lng }
  const [stops, setStops] = useState(
    editData?.routes?.flatMap(r => r.stops.map(s => ({ id: generateId(), ...s }))) || []
  )
  const [stopName, setStopName] = useState('')
  const [stopCoord, setStopCoord] = useState('')
  const [perVehicle, setPerVehicle] = useState(editData?.routes?.[0]?.stops?.length || 6)
  const [customVehicle, setCustomVehicle] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [routeNames, setRouteNames] = useState([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const actualPerVehicle = useCustom ? (parseInt(customVehicle) || 1) : perVehicle

  const groups = () => {
    if (!stops.length) return []
    const result = []
    for (let i = 0; i < stops.length; i += actualPerVehicle) {
      result.push(stops.slice(i, i + actualPerVehicle))
    }
    return result
  }

  // ── Manual stop add ──────────────────────────────────────
  const addStop = () => {
    const err = {}
    const coord = parseCoord(stopCoord)
    if (!coord) err.stopCoord = 'Format: 31.5204, 74.3587'
    if (Object.keys(err).length) { setErrors(err); return }
    setStops(prev => [...prev, {
      id: generateId(),
      name: stopName.trim() || `Stop ${prev.length + 1}`,
      lat: coord.lat,
      lng: coord.lng
    }])
    setStopName(''); setStopCoord(''); setErrors({})
  }

  const removeStop = (id) => setStops(prev => prev.filter(s => s.id !== id))

  const moveStop = (id, dir) => {
    setStops(prev => {
      const idx = prev.findIndex(s => s.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  // ── Bulk Upload ──────────────────────────────────────────
  const handleFileUpload = async (file) => {
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop().toLowerCase()

    try {
      let rows = []

      if (ext === 'csv') {
        const text = await file.text()
        const Papa = (await import('papaparse')).default
        const result = Papa.parse(text, { header: true, skipEmptyLines: true })
        rows = result.data
      } else if (['xlsx', 'xls'].includes(ext)) {
        const XLSX = await import('xlsx')
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(ws)
      } else {
        setErrors({ upload: 'Only CSV or Excel (.xlsx/.xls) files supported.' })
        return
      }

      const parsed = rows
        .map(r => {
          // normalize keys: lowercase
          const norm = {}
          Object.keys(r).forEach(k => { norm[k.toLowerCase().trim()] = r[k] })
          const lat = parseFloat(norm.lat)
          const lng = parseFloat(norm.lng ?? norm.long ?? norm.longitude)
          if (isNaN(lat) || isNaN(lng)) return null
          return {
            id: generateId(),
            name: String(norm.label ?? norm.name ?? norm.stop ?? '').trim() || `Stop ${stops.length + 1}`,
            lat,
            lng
          }
        })
        .filter(Boolean)

      if (!parsed.length) {
        setErrors({ upload: 'No valid rows found. Columns needed: label (or name), lat, lng' })
        return
      }

      setStops(prev => [...prev, ...parsed])
      setErrors({})
    } catch (e) {
      setErrors({ upload: 'File read error: ' + e.message })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Step navigation ──────────────────────────────────────
  const goToStep2 = () => {
    const err = {}
    if (!name.trim()) err.name = 'Route group name is required'
    if (!dest.trim()) err.dest = 'Destination name is required'
    if (!stops.length) err.stops = 'Add at least one stop'
    if (Object.keys(err).length) { setErrors(err); return }
    const g = groups()
    setRouteNames(
      isEdit && editData.routes
        ? g.map((_, i) => editData.routes[i]?.name || `Vehicle ${i + 1}`)
        : g.map((_, i) => `Vehicle ${i + 1}`)
    )
    setStep(2)
  }

  const goToMap = () => {
    setStep(3)
  }

  // Called from MapStopAssigner when user reassigns stops via map
  const handleMapUpdate = (updatedStops) => {
    setStops(updatedStops)
  }

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      const g = groups()
      const destParsed = parseCoord(destCoord)
      const payload = {
        name: name.trim(),
        dest: dest.trim(),
        destLat: destParsed?.lat || null,
        destLng: destParsed?.lng || null,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        routes: g.map((grp, i) => ({
          name: routeNames[i] || `Vehicle ${i + 1}`,
          stops: grp.map(({ id, ...rest }) => rest), // strip local id before saving
          color: COLORS[i % COLORS.length]
        }))
      }
      if (isEdit) await updateRoute(editData.id, payload)
      else await addRoute(payload)
      onClose()
    } catch (e) {
      console.error(e)
      alert('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>
              {isEdit ? '✏ Edit Route' : '+ New Route Group'}
            </h2>
            <p className={styles.headerSub}>
              Step {step} of 3 — {
                step === 1 ? 'Stops & Settings' :
                step === 2 ? 'Name Vehicle Routes' :
                'Map View — Assign Stops'
              }
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={17} /></button>
        </div>

        {/* Progress bar */}
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }} />
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* ── STEP 1: Info + Stops ── */}
          {step === 1 && (
            <>
              <div className={styles.sectionTitle}>Basic Info</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Route Group Name *</label>
                  <input className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Morning Shift A" />
                  {errors.name && <span className={styles.err}>{errors.name}</span>}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Destination Name *</label>
                  <input className={`${styles.input} ${errors.dest ? styles.inputError : ''}`}
                    value={dest} onChange={e => setDest(e.target.value)}
                    placeholder="e.g. BusCaro Office" />
                  {errors.dest && <span className={styles.err}>{errors.dest}</span>}
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Destination Lat, Lng (optional)</label>
                <input className={styles.input} value={destCoord} onChange={e => setDestCoord(e.target.value)}
                  placeholder="31.5204, 74.3587" style={{ fontFamily: 'monospace', fontSize: 13 }} />
              </div>

              <div className={styles.divider} />

              {/* Stops */}
              <div className={styles.sectionTitle}>Pickup Stops</div>
              <div className={styles.alert}>
                Paste Lat, Lng and click Add — e.g. <code>31.5204, 74.3587</code>
              </div>

              {/* Manual add row */}
              <div className={styles.addStopRow}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label className={styles.label}>Stop Name (optional)</label>
                  <input className={styles.input} value={stopName} onChange={e => setStopName(e.target.value)}
                    placeholder="e.g. Home A" onKeyDown={e => e.key === 'Enter' && addStop()} />
                </div>
                <div className={styles.formGroup} style={{ flex: 2 }}>
                  <label className={styles.label}>Lat, Lng *</label>
                  <input className={`${styles.input} ${errors.stopCoord ? styles.inputError : ''}`}
                    value={stopCoord} onChange={e => setStopCoord(e.target.value)}
                    placeholder="31.5204, 74.3587" style={{ fontFamily: 'monospace', fontSize: 12 }}
                    onKeyDown={e => e.key === 'Enter' && addStop()} />
                  {errors.stopCoord && <span className={styles.err}>{errors.stopCoord}</span>}
                </div>
                <button className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`} onClick={addStop} style={{ alignSelf: 'flex-end' }}>
                  <Plus size={14} /> Add
                </button>
              </div>

              {/* Bulk upload */}
              <div className={styles.bulkRow}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={e => handleFileUpload(e.target.files[0])}
                />
                <button
                  className={`${ui.btn} ${ui.btnSm} ${styles.uploadBtn}`}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload size={13} />
                  {uploading ? 'Uploading...' : 'Bulk Upload (CSV / Excel)'}
                </button>
                <span className={styles.uploadHint}>Columns needed: <code>label, lat, lng</code></span>
              </div>
              {errors.upload && <div className={styles.errBlock}>{errors.upload}</div>}

              {errors.stops && <div className={styles.errBlock}>{errors.stops}</div>}

              {/* Stops list */}
              {stops.length > 0 ? (
                <div className={styles.stopsList}>
                  {stops.map((s, i) => (
                    <div key={s.id} className={styles.stopRow}>
                      <div className={styles.stopNum}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div className={styles.stopName}>{s.name}</div>
                        <div className={styles.stopCoord}>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</div>
                      </div>
                      <div className={styles.stopReorder}>
                        <button className={styles.reorderBtn} onClick={() => moveStop(s.id, -1)} disabled={i === 0} title="Move up">↑</button>
                        <button className={styles.reorderBtn} onClick={() => moveStop(s.id, 1)} disabled={i === stops.length - 1} title="Move down">↓</button>
                      </div>
                      <button className={styles.removeBtn} onClick={() => removeStop(s.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyStops}>No stops yet — add manually or bulk upload above</div>
              )}

              <div className={styles.divider} />

              {/* Stops per vehicle */}
              <div className={styles.sectionTitle}>Stops Per Vehicle</div>
              <p className={styles.hint}>
                Total {stops.length} stops ÷ {actualPerVehicle} = <strong>{stops.length ? Math.ceil(stops.length / actualPerVehicle) : 0} vehicles (routes)</strong>
              </p>
              <div className={styles.vehicleOpts}>
                {VEHICLE_OPTIONS.map(n => (
                  <button key={n}
                    className={`${styles.vehicleOpt} ${!useCustom && perVehicle === n ? styles.vehicleOptSel : ''}`}
                    onClick={() => { setPerVehicle(n); setUseCustom(false) }}>
                    {n}
                  </button>
                ))}
                <button
                  className={`${styles.vehicleOpt} ${useCustom ? styles.vehicleOptSel : ''}`}
                  onClick={() => setUseCustom(true)}>
                  Custom
                </button>
              </div>
              {useCustom && (
                <input className={styles.input} type="number" min="1" max="50"
                  value={customVehicle} onChange={e => setCustomVehicle(e.target.value)}
                  placeholder="Enter number" style={{ width: 140, marginTop: 8 }} />
              )}

              {/* Preview */}
              {stops.length > 0 && (
                <>
                  <div className={styles.divider} />
                  <div className={styles.sectionTitle}>Preview</div>
                  <div className={styles.previewGrid}>
                    {groups().map((g, i) => (
                      <div key={i} className={styles.previewCard}>
                        <div className={styles.previewHeader} style={{ borderLeft: `3px solid ${COLORS[i % COLORS.length]}` }}>
                          <span className={styles.previewTitle}>Route {i + 1}</span>
                          <span className={`${ui.badge} ${ui.badgeOrange}`}>{g.length} stops</span>
                        </div>
                        <div className={styles.previewBody}>
                          {g.map((s, si) => (
                            <div key={si} className={styles.previewStop}>
                              <span style={{ color: COLORS[i % COLORS.length], fontWeight: 700, fontSize: 11 }}>{si + 1}.</span>
                              <span>{s.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── STEP 2: Name Routes ── */}
          {step === 2 && (
            <>
              <div className={styles.sectionTitle}>Name Vehicle Routes</div>
              <div className={styles.alert}>
                <strong>{dest}</strong> — {groups().length} vehicle routes will be created. Give each a name.
              </div>
              <div className={styles.namesList}>
                {groups().map((g, i) => (
                  <div key={i} className={styles.nameRow}>
                    <div className={styles.nameColorDot} style={{ background: COLORS[i % COLORS.length] }} />
                    <input
                      className={styles.input}
                      style={{ flex: 1 }}
                      value={routeNames[i] || ''}
                      onChange={e => {
                        const upd = [...routeNames]
                        upd[i] = e.target.value
                        setRouteNames(upd)
                      }}
                      placeholder={`Vehicle ${i + 1}`}
                    />
                    <span className={`${ui.badge} ${ui.badgeBlue}`}>{g.length} stops</span>
                  </div>
                ))}
              </div>

              <div className={styles.mapHint}>
                <Map size={14} />
                <span>Next step: view all stops on the map and re-assign them to vehicle routes by clicking pins or drawing a polygon area.</span>
              </div>
            </>
          )}

          {/* ── STEP 3: Map View ── */}
          {step === 3 && (
            <MapStopAssigner
              stops={stops}
              groups={groups()}
              routeNames={routeNames}
              colors={COLORS}
              perVehicle={actualPerVehicle}
              onUpdate={handleMapUpdate}
            />
          )}

        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {step > 1 && (
            <button className={`${ui.btn} ${ui.btnOutline}`} onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={14} /> Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className={`${ui.btn} ${ui.btnOutline}`} onClick={onClose}>Cancel</button>

          {step === 1 && (
            <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={goToStep2}>
              Next <ChevronRight size={14} />
            </button>
          )}
          {step === 2 && (
            <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={goToMap}>
              <Map size={14} /> Open Map View
            </button>
          )}
          {step === 3 && (
            <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={handleSave} disabled={saving}>
              {saving
                ? <><RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Saving...</>
                : '💾 Save Route'
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}