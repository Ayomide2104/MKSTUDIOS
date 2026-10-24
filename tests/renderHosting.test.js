const test = require('node:test');
const assert = require('node:assert/strict');

// Model Render's runtime flag while NODE_ENV is misconfigured as development,
// matching the currently deployed service's reported environment.
process.env.NODE_ENV = 'development';
process.env.RENDER = 'true';
delete process.env.CLIENT_URL;
const app = require('../src/app');

async function startTestServer() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return server;
}

test('Render serves the built homepage when NODE_ENV is development', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(html, /MKSTUDIOS/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Render still returns JSON 404s for unknown API routes', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/not-a-route`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), { success: false, error: 'Route not found' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
