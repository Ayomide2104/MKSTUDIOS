const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const mongoose = require('mongoose');

test('health endpoint returns application status and environment', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.ok(body.data.timestamp);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('database health endpoint reports disconnected state as unavailable', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health/db`);
    const body = await response.json();
    assert.equal(response.status, mongoose.connection.readyState === 1 ? 200 : 503);
    assert.equal(body.data.status, mongoose.connection.readyState === 1 ? 'connected' : 'unavailable');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
