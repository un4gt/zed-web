
import { FALLBACK_GATEWAY_URL, isLoopbackHost } from './config';

export class ApiError extends Error {
  constructor(message, { contentType = '', status = 0, url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.contentType = contentType;
    this.status = status;
    this.url = url;
  }
}

export async function requestJson(input, init) {
  const response = await fetch(input, init);
  const contentType = response.headers.get('content-type') ?? '';
  const responseText = await response.text();

  if (!response.ok) {
    throw new ApiError(parseErrorResponse(responseText, contentType, response), {
      contentType,
      status: response.status,
      url: response.url,
    });
  }

  if (!contentType.includes('application/json')) {
    throw new ApiError(nonJsonResponseMessage(responseText, contentType, response), {
      contentType,
      status: response.status,
      url: response.url,
    });
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new ApiError(`Gateway returned invalid JSON: ${String(error)}`, {
      contentType,
      status: response.status,
      url: response.url,
    });
  }
}

function parseErrorResponse(responseText, contentType, response) {
  if (contentType.includes('application/json')) {
    try {
      const payload = JSON.parse(responseText);
      if (typeof payload.error === 'string') {
        return payload.error;
      }
      if (typeof payload.message === 'string') {
        return payload.message;
      }
    } catch {
      return `Gateway returned invalid JSON with HTTP ${response.status}.`;
    }
  }

  if (looksLikeHtml(responseText)) {
    return nonJsonResponseMessage(responseText, contentType, response);
  }

  const trimmed = responseText.trim();
  return trimmed || `Gateway request failed with HTTP ${response.status}.`;
}

function nonJsonResponseMessage(responseText, contentType, response) {
  if (looksLikeHtml(responseText)) {
    return `Gateway URL ${new URL(response.url).origin} returned the frontend HTML instead of API JSON. Use the same web entrypoint as the page, or verify that /api is proxied to ${FALLBACK_GATEWAY_URL}.`;
  }

  return `Gateway returned ${contentType || 'a non-JSON response'} from ${response.url}.`;
}

function looksLikeHtml(text) {
  return text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html');
}

export function formatRequestError(error, gatewayUrl) {
  const message = String(error);
  if (error instanceof ApiError) {
    return error.message;
  }

  if (typeof window === 'undefined' || !(error instanceof TypeError) || error.message !== 'Failed to fetch') {
    return message;
  }

  try {
    const gateway = new URL(gatewayUrl, window.location.origin);
    if (isLoopbackHost(gateway.hostname) && !isLoopbackHost(window.location.hostname)) {
      return `${message}. Gateway URL ${gateway.origin} points to the browser host. Try ${window.location.origin}.`;
    }
  } catch {
    return message;
  }

  return message;
}
