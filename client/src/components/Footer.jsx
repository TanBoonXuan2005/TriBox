import { Link } from 'react-router-dom'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.brand}>tribox</span>
        <nav className={styles.links}>
          <a href="#">Docs</a>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Contact</a>
        </nav>
        <span className={styles.copy}>© 2026 Tribox</span>
      </div>
    </footer>
  )
}
