function parseMongoUri(uri, { requireTestDatabase = false } = {}) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('MongoDB URI is invalid or has no explicit hostname.');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || !parsed.hostname || parsed.hostname.includes(',')) {
    throw new Error('MongoDB URI must use mongodb:// or mongodb+srv:// with one explicit hostname.');
  }

  let databaseName;
  if (requireTestDatabase) {
    try {
      databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''));
    } catch {
      throw new Error('MONGODB_TEST_URI has an invalid database name.');
    }
    if (!databaseName) throw new Error('MONGODB_TEST_URI must include a database name ending in _test.');
    if (!databaseName.endsWith('_test')) throw new Error('Refusing MongoDB database: its name must end in _test.');
  }

  return { databaseName, hostname: parsed.hostname.toLowerCase() };
}

function validateTestMongoConfig(env = process.env) {
  const uri = env.MONGODB_TEST_URI;
  const allowedHost = env.MONGODB_TEST_ALLOWED_HOST;
  if (!uri) throw new Error('MONGODB_TEST_URI is required for MongoDB integration tests.');
  if (!allowedHost) throw new Error('MONGODB_TEST_ALLOWED_HOST must be set to the dedicated test cluster hostname.');

  const testTarget = parseMongoUri(uri, { requireTestDatabase: true });
  const allowedHostText = allowedHost.trim();
  let normalizedAllowedHost;
  try {
    const allowed = new URL(`mongodb://${allowedHostText}`);
    if (allowed.username || allowed.password || allowed.port || !['', '/'].includes(allowed.pathname) || allowed.search || allowed.hash || allowed.hostname !== allowedHostText.toLowerCase()) {
      throw new Error('invalid host setting');
    }
    normalizedAllowedHost = allowed.hostname.toLowerCase();
  } catch {
    throw new Error('MONGODB_TEST_ALLOWED_HOST must contain only the exact test cluster hostname.');
  }
  if (testTarget.hostname !== normalizedAllowedHost) {
    throw new Error('Refusing MongoDB test connection: URI hostname does not match MONGODB_TEST_ALLOWED_HOST.');
  }

  if (env.MONGODB_URI) {
    let productionTarget;
    try {
      productionTarget = parseMongoUri(env.MONGODB_URI);
    } catch {
      throw new Error('MONGODB_URI is present but its hostname cannot be safely validated.');
    }
    if (testTarget.hostname === productionTarget.hostname) {
      throw new Error('Refusing MongoDB test connection: test and production hostnames must differ.');
    }
  }

  return { uri, databaseName: testTarget.databaseName, hostname: testTarget.hostname };
}

async function connectTestDatabase(mongooseClient, env = process.env) {
  const config = validateTestMongoConfig(env);
  try {
    await mongooseClient.connect(config.uri, { dbName: config.databaseName });
  } catch (error) {
    console.error('MongoDB test connection diagnostic:', JSON.stringify(safeMongoErrorDiagnostic(error)));
    throw new Error('MongoDB test connection failed; verify the dedicated test cluster and its database user permissions.');
  }
  return config.databaseName;
}

function safeMongoErrorDiagnostic(error) {
  const queue = [{ value: error, depth: 0 }];
  const seen = new Set();
  const nodes = [];

  while (queue.length && nodes.length < 20) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 4) continue;
    seen.add(value);
    nodes.push(value);
    for (const key of ['cause', 'reason', 'originalError', 'error']) {
      try {
        const nested = value[key];
        if (nested && typeof nested === 'object') queue.push({ value: nested, depth: depth + 1 });
      } catch {}
    }
    try {
      const servers = value.reason && value.reason.servers;
      if (servers && typeof servers.values === 'function') {
        for (const server of servers.values()) {
          if (server && server.error && typeof server.error === 'object') queue.push({ value: server.error, depth: depth + 1 });
        }
      }
    } catch {}
  }

  const safeName = (name) => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(name) ? name : null;
  const safeCode = (code) => Number.isInteger(code) ? code : typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : null;
  const names = [];
  const codes = [];
  const codeNames = [];
  const syscalls = [];
  for (const node of nodes) {
    try { names.push(safeName(node.name)); } catch {}
    try { codes.push(safeCode(node.code)); } catch {}
    try {
      if (typeof node.codeName === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(node.codeName)) codeNames.push(node.codeName);
    } catch {}
    try {
      if (typeof node.syscall === 'string') {
        const syscall = node.syscall.toLowerCase();
        if (['querysrv', 'querytxt', 'getaddrinfo', 'lookup'].includes(syscall)) syscalls.push(syscall);
      }
    } catch {}
  }

  const identifiers = [...names, ...codes.map(String), ...codeNames].filter(Boolean);
  let category = 'unknown';
  if (codes.includes(18) || identifiers.some((value) => /authenticationfailed|authfailure/i.test(value))) category = 'authentication';
  else if (codes.includes(13) || identifiers.some((value) => /unauthorized|notauthorized/i.test(value))) category = 'authorization';
  else if (identifiers.some((value) => /tls|ssl|certificate|cert_/i.test(value))) category = 'tls';
  else if (identifiers.some((value) => /^(ENOTFOUND|EAI_AGAIN|EAI_FAIL)$/i.test(value))) category = 'dns';
  else if (identifiers.some((value) => /timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(value))) category = 'network_timeout';
  else if (identifiers.some((value) => /^(ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ECONNABORTED)$/i.test(value) || /MongoNetworkError/i.test(value))) category = 'network';

  const diagnostic = {
    errorName: names.find(Boolean) || 'MongoError',
    errorCode: codes.find((code) => code !== null) ?? null,
    category
  };
  if (category === 'dns') {
    const syscall = syscalls[0];
    diagnostic.dnsStage = syscall === 'querysrv'
      ? 'srv_seed_resolution'
      : syscall === 'querytxt'
        ? 'srv_txt_lookup'
        : syscall === 'getaddrinfo' || syscall === 'lookup'
          ? 'host_address_resolution'
          : 'unknown';
  }
  return diagnostic;
}

module.exports = { validateTestMongoConfig, connectTestDatabase, safeMongoErrorDiagnostic };
