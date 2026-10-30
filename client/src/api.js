/**
 * Small fetch wrapper for the DocEditor API.
 *
 * Responsibilities:
 * - Automatically attach the `Authorization: Bearer <token>` header using the
 *   JWT stored in localStorage.
 * - Parse JSON responses.
 * - On 401 Unauthorized, clear the stored session and redirect to /login.
 * - Throw an Error with a human-readable message on non-2xx responses so
 *   callers can surface it in an MUI Alert.
 *
 * @param {string} path - API path, e.g. "/api/documents".
 * @param {RequestInit} [options] - Standard fetch options (method, body, headers...).
 * @returns {Promise<any>} Parsed JSON body (or null for empty responses).
 */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token");

  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  // Only default the content type for requests that carry a JSON body.
  // FormData bodies (file uploads) must NOT set Content-Type manually so the
  // browser can attach the multipart boundary.
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // Hard redirect so any in-flight React state is discarded.
    window.location.assign("/login");
    throw new Error("Session expired — please sign in again");
  }

  // Some endpoints (e.g. DELETE) may return an empty body.
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message =
      (data && data.message) || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}
