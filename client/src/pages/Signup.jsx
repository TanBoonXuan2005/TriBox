import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const styles = {
  page: {
    minHeight: '100vh',
    background: '#09090b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
  },
  card: {
    background: '#111113',
    border: '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
  },
  logo: {
    display: 'block',
    textAlign: 'center',
    fontSize: '22px',
    fontWeight: '700',
    color: '#fafafa',
    textDecoration: 'none',
    marginBottom: '32px',
    letterSpacing: '-0.5px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '6px',
  },
  input: {
    background: '#161618',
    border: '0.5px solid rgba(255,255,255,0.1)',
    color: '#fafafa',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '16px',
  },
  button: {
    background: '#e4e4e7',
    color: '#09090b',
    fontWeight: '500',
    borderRadius: '8px',
    width: '100%',
    padding: '11px',
    fontSize: '14px',
    border: 'none',
    cursor: 'pointer',
    marginTop: '4px',
  },
  buttonDisabled: {
    opacity: '0.6',
    cursor: 'not-allowed',
  },
  error: {
    color: '#f87171',
    fontSize: '13px',
    marginTop: '10px',
    textAlign: 'center',
  },
  success: {
    color: '#4ade80',
    fontSize: '13px',
    marginTop: '10px',
    textAlign: 'center',
    lineHeight: '1.5',
  },
  footer: {
    textAlign: 'center',
    marginTop: '24px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.35)',
  },
  link: {
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    marginLeft: '4px',
  },
}

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function validate() {
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirm) return 'Passwords do not match.'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  function focusBorder(e) {
    e.target.style.borderColor = 'rgba(255,255,255,0.3)'
  }
  function blurBorder(e) {
    e.target.style.borderColor = 'rgba(255,255,255,0.1)'
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <Link to="/" style={styles.logo}>tribox</Link>

        {success ? (
          <p style={styles.success}>
            Check your email to confirm your account.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={styles.label}>Full name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Smith"
              required
              style={styles.input}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />

            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={styles.input}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />

            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              style={styles.input}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />

            <label style={styles.label}>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />

            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            {error && <p style={styles.error}>{error}</p>}
          </form>
        )}

        <p style={styles.footer}>
          Already have an account?
          <Link to="/login" style={styles.link}>Log in</Link>
        </p>
      </div>
    </div>
  )
}
