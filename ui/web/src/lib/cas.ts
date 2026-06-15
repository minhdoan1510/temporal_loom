// CAS SSO redirect helpers.
//
// The CAS server redirects back to `${origin}/sso/cas?ticket=...` after login.
// Note the app uses HashRouter, so this is a *real* path + query string (not a
// hash route); the callback is handled imperatively in TokenGate.

export const CAS_SSO_URL =
  import.meta.env.VITE_CAS_SSO_URL ?? "https://zlpdev-platform-cas.zalopay.vn/sso";

/** The service URL CAS redirects back to. Must match what's sent to /api/sso/cas. */
export const casServiceUrl = () => `${window.location.origin}/sso/cas`;

/** Full CAS login URL to redirect the browser to. */
export const casRedirectUrl = () =>
  `${CAS_SSO_URL}?service=${encodeURIComponent(casServiceUrl())}`;
