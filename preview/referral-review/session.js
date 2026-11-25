// The fixture server supplies a synthetic local staff session. Never shipped.
if (['localhost','127.0.0.1'].includes(location.hostname)) {
  try { sessionStorage.setItem('hope-sojourns-admin-navigation','true'); } catch {}
}
