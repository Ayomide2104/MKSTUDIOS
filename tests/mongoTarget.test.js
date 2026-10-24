const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTestMongoConfig, connectTestDatabase, safeMongoErrorDiagnostic } = require('./helpers/mongoTarget');

const validConfig = {
  MONGODB_TEST_URI: 'mongodb+srv://test-user:test-password@test-cluster.example/mkstudios_test?retryWrites=true',
  MONGODB_TEST_ALLOWED_HOST: 'test-cluster.example'
};

test('test Mongo guard requires MONGODB_TEST_URI', () => {
  assert.throws(() => validateTestMongoConfig({ MONGODB_TEST_ALLOWED_HOST: validConfig.MONGODB_TEST_ALLOWED_HOST }), /MONGODB_TEST_URI is required/);
});

test('test Mongo guard requires MONGODB_TEST_ALLOWED_HOST', () => {
  assert.throws(() => validateTestMongoConfig({ MONGODB_TEST_URI: validConfig.MONGODB_TEST_URI }), /MONGODB_TEST_ALLOWED_HOST must be set/);
});

test('test Mongo guard rejects database names without the _test suffix', () => {
  assert.throws(() => validateTestMongoConfig({
    ...validConfig,
    MONGODB_TEST_URI: 'mongodb+srv://test-user:test-password@test-cluster.example/mkstudios'
  }), /must end in _test/);
});

test('test Mongo guard requires a bare allowed hostname and rejects mismatches', () => {
  assert.throws(() => validateTestMongoConfig({ ...validConfig, MONGODB_TEST_ALLOWED_HOST: undefined }), /MONGODB_TEST_ALLOWED_HOST must be set/);
  assert.throws(() => validateTestMongoConfig({ ...validConfig, MONGODB_TEST_ALLOWED_HOST: 'https://test-cluster.example' }), /only the exact test cluster hostname/);
  assert.throws(() => validateTestMongoConfig({ ...validConfig, MONGODB_TEST_ALLOWED_HOST: 'other-cluster.example' }), /does not match/);
});

test('test Mongo guard rejects a hostname matching the production MongoDB URI', () => {
  assert.throws(() => validateTestMongoConfig({
    ...validConfig,
    MONGODB_URI: 'mongodb+srv://production-user:production-password@test-cluster.example/mkstudios'
  }), /test and production hostnames must differ/);
});

test('test Mongo guard accepts a distinct dedicated cluster and _test database', () => {
  assert.deepEqual(validateTestMongoConfig({
    ...validConfig,
    MONGODB_URI: 'mongodb+srv://production-user:production-password@production-cluster.example/mkstudios'
  }), {
    uri: validConfig.MONGODB_TEST_URI,
    databaseName: 'mkstudios_test',
    hostname: 'test-cluster.example'
  });
});

test('test connection validates first and never calls mongoose.connect for an unsafe target', async () => {
  let calls = 0;
  const fakeMongoose = { connect: async () => { calls += 1; } };
  await assert.rejects(connectTestDatabase(fakeMongoose, {
    ...validConfig,
    MONGODB_TEST_ALLOWED_HOST: 'wrong-cluster.example'
  }), /does not match/);
  assert.equal(calls, 0);
});

test('test connection passes the validated URI and database to the connection layer', async () => {
  const calls = [];
  const fakeMongoose = { connect: async (...args) => { calls.push(args); } };
  const databaseName = await connectTestDatabase(fakeMongoose, validConfig);
  assert.equal(databaseName, 'mkstudios_test');
  assert.deepEqual(calls, [[validConfig.MONGODB_TEST_URI, { dbName: 'mkstudios_test' }]]);
});

test('test connection failures do not expose driver errors or connection details', async () => {
  const fakeMongoose = { connect: async () => {
    const error = new Error('password=test-password uri=' + validConfig.MONGODB_TEST_URI);
    error.name = 'MongoNetworkError';
    error.code = 'ENOTFOUND';
    error.syscall = 'querySrv';
    throw error;
  } };
  const output = [];
  const originalError = console.error;
  console.error = (...args) => output.push(args);
  try {
    await assert.rejects(connectTestDatabase(fakeMongoose, validConfig), (error) => {
      assert.equal(error.message, 'MongoDB test connection failed; verify the dedicated test cluster and its database user permissions.');
      assert.doesNotMatch(error.message, /test-password|mongodb\+srv|retryWrites/);
      return true;
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(output.length, 1);
  assert.equal(output[0][0], 'MongoDB test connection diagnostic:');
  assert.deepEqual(JSON.parse(output[0][1]), {
    errorName: 'MongoNetworkError', errorCode: 'ENOTFOUND', category: 'dns', dnsStage: 'srv_seed_resolution'
  });
  assert.doesNotMatch(output[0][1], /test-password|mongodb\+srv|retryWrites|test-cluster/);
});

test('safe DNS diagnostic distinguishes target address lookup without exposing its hostname', () => {
  const diagnostic = safeMongoErrorDiagnostic({
    name: 'MongoNetworkError',
    cause: { name: 'Error', code: 'ENOTFOUND', syscall: 'getaddrinfo', hostname: 'private-target.example' }
  });
  assert.deepEqual(diagnostic, {
    errorName: 'MongoNetworkError', errorCode: 'ENOTFOUND', category: 'dns', dnsStage: 'host_address_resolution'
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /private-target/);
});

test('safe Mongo diagnostics classify common connection failures', () => {
  const cases = [
    [{ name: 'MongoServerError', code: 18 }, 'authentication'],
    [{ name: 'MongoServerError', code: 13 }, 'authorization'],
    [{ name: 'MongoNetworkError', code: 'EAI_AGAIN' }, 'dns'],
    [{ name: 'MongoNetworkTimeoutError', code: 'ETIMEDOUT' }, 'network_timeout'],
    [{ name: 'MongoNetworkError', code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'tls']
  ];
  for (const [error, expected] of cases) {
    assert.equal(safeMongoErrorDiagnostic(error).category, expected);
  }
});
