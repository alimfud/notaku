import googleAuth from '../../server/google-auth.js';

function createNodeRequest(request) {
  const headers = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  return { method: request.method, url: new URL(request.url).pathname + new URL(request.url).search, headers };
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
  await googleAuth(createNodeRequest(context.request), response, context.env);
  return response.response();
}
