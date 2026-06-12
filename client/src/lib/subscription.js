import { supabase } from './supabase'

// Shared helpers for the account-level subscription state. The server's
// profiles table is the source of truth for "is this user Pro"; these wrap the
// /api/me/subscription and /api/billing-portal endpoints.

// Returns { tier: 'free' | 'pro', has_billing: boolean }, or null if not
// logged in / on error (callers treat null as "unknown, assume free").
export async function fetchSubscription() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  try {
    const res = await fetch('/api/me/subscription', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Opens the Stripe Customer Portal in the current tab. Returns an error string
// on failure, or null on success (the browser navigates away).
export async function openBillingPortal() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'Please log in first.'
  try {
    const res = await fetch('/api/billing-portal', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (res.ok && data.url) {
      window.location.href = data.url
      return null
    }
    return data.error || 'Could not open billing portal.'
  } catch {
    return 'Could not open billing portal.'
  }
}
