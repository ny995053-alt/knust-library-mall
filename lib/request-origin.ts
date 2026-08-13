const httpProtocols = new Set(["http:", "https:"]);

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function parseHttpOrigin(value: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (!httpProtocols.has(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseHost(value: string | null) {
  const candidate = firstHeaderValue(value);
  if (!candidate || /[\s/@\\]/.test(candidate)) return null;

  try {
    const parsed = new URL(`http://${candidate}`);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    return parsed.host;
  } catch {
    return null;
  }
}

function parseForwardedProtocol(value: string | null) {
  const protocol = firstHeaderValue(value)?.toLowerCase();
  return protocol === "http" || protocol === "https" ? `${protocol}:` : null;
}

function requestUrl(request: Request) {
  try {
    const parsed = new URL(request.url);
    return httpProtocols.has(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function originFrom(protocol: string, host: string) {
  try {
    return new URL(`${protocol}//${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * Return origins that are tied to the actual request authority.
 *
 * A reverse proxy may rewrite Request.url to its internal listener while
 * retaining the browser-facing Host header. We therefore reconstruct the
 * public origin from Host plus X-Forwarded-Proto. X-Forwarded-Port is
 * deliberately ignored: Next/ngrok can expose the internal port (3000) there
 * even when the browser used the normal HTTPS port.
 *
 * X-Forwarded-Host is accepted only when it agrees with Host. This prevents a
 * direct client from turning a spoofed forwarding header into a trusted CSRF
 * origin or authentication redirect target.
 */
export function getRequestOrigins(request: Request) {
  const candidates = new Set<string>();
  const parsedRequestUrl = requestUrl(request);
  const host = parseHost(request.headers.get("host"));
  const forwardedHost = parseHost(request.headers.get("x-forwarded-host"));
  const forwardedProtocol = parseForwardedProtocol(request.headers.get("x-forwarded-proto"));

  if (host) {
    const forwardingAuthorityMatches = forwardedHost === host;
    const protocol = (forwardingAuthorityMatches ? forwardedProtocol : null) || parsedRequestUrl?.protocol;
    const publicOrigin = protocol ? originFrom(protocol, host) : null;
    if (publicOrigin) candidates.add(publicOrigin);

    // When Host and X-Forwarded-Host agree, an explicitly forwarded host port
    // is authoritative. Never graft the separate X-Forwarded-Port header onto
    // a public hostname because it may describe only the internal listener.
    if (forwardingAuthorityMatches && forwardedHost && forwardedProtocol) {
      const forwardedOrigin = originFrom(forwardedProtocol, forwardedHost);
      if (forwardedOrigin) candidates.add(forwardedOrigin);
    }
  }

  if (parsedRequestUrl) candidates.add(parsedRequestUrl.origin);
  return Array.from(candidates);
}

export function isSameOriginRequest(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    // Modern browsers identify cross-site navigations even when Origin is
    // omitted. Keep non-browser/server clients working while rejecting that
    // explicit cross-site signal.
    return request.headers.get("sec-fetch-site")?.toLowerCase() !== "cross-site";
  }

  const parsedOrigin = parseHttpOrigin(originHeader);
  if (!parsedOrigin) return false;
  return getRequestOrigins(request).includes(parsedOrigin);
}

export function resolveRequestOrigin(request: Request) {
  const requestOrigins = getRequestOrigins(request);
  const suppliedOrigin = parseHttpOrigin(request.headers.get("origin"));

  // A browser Origin that already passed the Host-correlated candidate check
  // is the most precise public URL for ngrok/local authentication redirects.
  if (suppliedOrigin && requestOrigins.includes(suppliedOrigin)) return suppliedOrigin;
  return requestOrigins[0] ?? null;
}
