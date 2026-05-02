// src/components/common/DeleteWarning.jsx
import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import ui from './ui.module.css'
import styles from './DeleteWarning.module.css'

function generateCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function DeleteWarning({ routeName, onConfirm, onCancel, loading }) {
  const [captcha, setCaptcha] = useState('')
  const [input, setInput] = useState('')
  const [shaking, setShaking] = useState(false)

  useEffect(() => { setCaptcha(generateCaptcha()) }, [])

  const handleConfirm = () => {
    if (input.trim().toUpperCase() !== captcha) {
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      return
    }
    onConfirm()
  }

  const refresh = () => { setCaptcha(generateCaptcha()); setInput('') }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.iconWrap}>
          <AlertTriangle size={28} color="#dc2626" />
        </div>
        <h2 className={styles.title}>Route Delete?</h2>
        <p className={styles.desc}>
          <strong>"{routeName}"</strong> and all the routes and stops inside it will be permanently deleted. This action cannot be undone.
        </p>

        <div className={styles.captchaSection}>
          <p className={styles.captchaLabel}>To confirm deletion, please type the code given below.:</p>
          <div className={`${styles.captchaBox} ${shaking ? styles.shake : ''}`}>
            <span className={styles.captchaText}>{captcha}</span>
            <button className={styles.refreshBtn} onClick={refresh} title="Naya code">↻</button>
          </div>
          <input
            className={`${styles.captchaInput} ${shaking ? styles.shake : ''}`}
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder="Yahan code type karein"
            maxLength={6}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
          />
          {shaking && <p className={styles.errorMsg}>⚠ The code did not match. Please try again..</p>}
        </div>

        <div className={styles.actions}>
          <button className={`${ui.btn} ${ui.btnOutline}`} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className={`${ui.btn} ${ui.btnDanger}`}
            onClick={handleConfirm}
            disabled={loading || input.length < 6}
          >
            {loading ? 'Deleting...' : '🗑 Haan, Delete Karein'}
          </button>
        </div>
      </div>
    </div>
  )
}