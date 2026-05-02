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
        <h2 className={styles.title}>Route Delete Karein?</h2>
        <p className={styles.desc}>
          <strong>"{routeName}"</strong> aur is ke andar ke tamam routes aur stops permanently delete ho jayenge. Yeh action undo nahi ho sakta.
        </p>

        <div className={styles.captchaSection}>
          <p className={styles.captchaLabel}>Delete confirm karne ke liye neeche diya gaya code type karein:</p>
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
          {shaking && <p className={styles.errorMsg}>⚠ Code match nahi hua. Dobara try karein.</p>}
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