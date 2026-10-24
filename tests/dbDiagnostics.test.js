const test = require('node:test');
const assert = require('node:assert/strict');
const { describeMongoError } = require('../src/config/dbDiagnostics');

test('MongoDB diagnostics classify nested DNS/SRV failures without leaking URI credentials', () => {
  const root = new Error('Server selection failed for mongodb+srv://test-user:test-password@cluster.example.invalid/mkstudios');
  root.name = 'MongoServerSelectionError';
  root.reason = {
    servers: new Map([
      ['cluster.example.invalid:27017', {
        error: Object.assign(new Error('querySrv ENOTFOUND _mongodb._tcp.cluster.example.invalid'), { code: 'ENOTFOUND' })
      }]
    ])
  };

  const diagnostic = describeMongoError(root);
  const serialized = JSON.stringify(diagnostic);
  assert.equal(diagnostic.category, 'DNS-or-SRV-resolution');
  assert.match(serialized, /MongoServerSelectionError/);
  assert.match(serialized, /ENOTFOUND/);
  assert.doesNotMatch(serialized, /test-user|test-password|mongodb\+srv:\/\//);
});

test('MongoDB diagnostics classify authentication failures', () => {
  const error = Object.assign(new Error('Authentication failed.'), { name: 'MongoServerError', code: 18 });
  assert.equal(describeMongoError(error).category, 'authentication-or-database-user');
});
