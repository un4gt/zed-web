
export const FALLBACK_GATEWAY_URL = 'http://127.0.0.1:8080';
export const DEFAULT_GATEWAY_URL = getDefaultGatewayUrl();
export const DEFAULT_SSH_HOST = getDefaultSshHost();

export function getDefaultGatewayUrl() {
  if (typeof window === 'undefined') {
    return FALLBACK_GATEWAY_URL;
  }

  return window.location.origin;
}

export function isLoopbackHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

export function getDefaultSshHost() {
  if (typeof window === 'undefined') {
    return '127.0.0.1';
  }

  return isLoopbackHost(window.location.hostname) ? '127.0.0.1' : 'host.docker.internal';
}
