import googleAuth from '../../server/google-auth.js';

async function createNodeRequest(request) {
  const headers = {};
  const url = new URL(request.url);
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  // Cloudflare's Fetch Request does not always expose Host in the same way as
  // Vercel's Node request. Pass the canonical origin explicitly to the shared
  // OAuth handler instead of trusting a forwarded header from the client.
  headers.host = url.host;
  headers['x-forwarded-host'] = url.host;
  return { method: request.method, url: url.pathname + url.search, origin: url.origin, headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text() };
}

function createNodeResponse() {
  const headers = new Map();
  let statusCode = 200;
  let body = '';
  return {
    setHeader(name, value) {
      const key = name.toLowerCase();
      if (key === 'set-cookie') {
        const current = headers.get(key) || [];
        headers.set(key, current.concat(Array.isArray(value) ? value : [value]));
      } else headers.set(key, String(value));
    },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    get statusCode() { return statusCode; },
    set statusCode(value) { statusCode = value; },
    end(value = '') { body = value; },
    response() {
      const output = new Headers();
      for (const [key, value] of headers) {
        if (key === 'set-cookie') value.forEach((cookie) => output.append('Set-Cookie', cookie));
        else output.set(key, value);
      }
      return new Response(body, { status: statusCode, headers: output });
    },
  };
}

export async function onRequest(context) {
  const response = createNodeResponse();
  await googleAuth(await createNodeRequest(context.request), response, context.env);
  return response.response();
}
