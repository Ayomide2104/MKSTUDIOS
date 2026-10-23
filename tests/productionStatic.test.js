const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// This file runs in its own node:test worker so the production app is built
// with production middleware without changing the health-route test setup.
process.env.NODE_ENV = 'production';
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

test('production serves the built frontend and static assets', async () => {
  const server = await startTestServer();
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(baseUrl);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(html, /MKSTUDIOS/);
    assert.match(html, /\/assets\/index-[^" ]+\.js/);

    const assetPath = html.match(/src="([^"]+\.js)"/)[1];
    const asset = await fetch(`${baseUrl}${assetPath}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /javascript/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('unknown production API routes retain the JSON 404 response', async () => {
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

test('production health routes work without a separate CLIENT_URL', async () => {
  const server = await startTestServer();
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${baseUrl}/api/health`, { headers: { Origin: baseUrl } });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).data.status, 'ok');

    const databaseHealth = await fetch(`${baseUrl}/api/health/db`, { headers: { Origin: baseUrl } });
    const databaseBody = await databaseHealth.json();
    const connected = mongoose.connection.readyState === 1;
    assert.equal(databaseHealth.status, connected ? 200 : 503);
    assert.equal(databaseBody.data.status, connected ? 'connected' : 'unavailable');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('unknown browser paths do not receive the frontend HTML fallback', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/not-a-page`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /application\/json/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
