require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const desired = [
  { key: { username: 1 }, name: 'username_string_unique', unique: true, partialFilterExpression: { username: { $type: 'string' } } },
  { key: { email: 1 }, name: 'email_string_unique', unique: true, partialFilterExpression: { email: { $type: 'string' } } }
];
const keyEquals = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

async function duplicateGroups(collection, field, caseInsensitive = false) {
  const value = caseInsensitive ? { $toLower: { $trim: { input: `$${field}` } } } : `$${field}`;
  return collection.aggregate([
    { $match: { [field]: { $type: 'string' } } },
    { $group: { _id: value, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'duplicateGroups' }
  ]).toArray().then((rows) => rows[0]?.duplicateGroups || 0);
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && process.argv.includes('--dry-run')) throw new Error('Choose either --dry-run or --apply.');
  if (process.argv.slice(2).some((arg) => !['--apply', '--dry-run'].includes(arg))) throw new Error('Use --dry-run (default) or --apply.');
  if (apply && process.env.CONFIRM_USER_INDEX_MIGRATION !== 'yes') throw new Error('Set CONFIRM_USER_INDEX_MIGRATION=yes to apply the reviewed index migration.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'mkstudios', serverSelectionTimeoutMS: 15000, autoIndex: false });
  const collection = mongoose.connection.db.collection('users');
  const indexes = await collection.indexes();
  const counts = await collection.aggregate([
    { $group: { _id: null, users: { $sum: 1 }, usernameNotString: { $sum: { $cond: [{ $eq: [{ $type: '$username' }, 'string'] }, 0, 1] } }, emailNotString: { $sum: { $cond: [{ $eq: [{ $type: '$email' }, 'string'] }, 0, 1] } } } }
  ]).toArray();
  const duplicates = {
    usernameCaseInsensitive: await duplicateGroups(collection, 'username', true),
    emailCaseInsensitive: await duplicateGroups(collection, 'email', true)
  };
  console.log('User indexes (name/key/unique/sparse/partial only):');
  for (const index of indexes) console.log(JSON.stringify({ name: index.name, key: index.key, unique: index.unique === true, sparse: index.sparse === true, partialFilterExpression: index.partialFilterExpression || null }));
  console.log('Aggregate counts (no user values):', JSON.stringify(counts[0] || { users: 0, usernameNotString: 0, emailNotString: 0 }));
  console.log('Duplicate groups (no user values):', JSON.stringify(duplicates));
  const blockers = Object.values(duplicates).some(Boolean);
  if (blockers) throw new Error('Duplicate string usernames or case-insensitive emails must be resolved before creating unique indexes. No changes were made.');
  const legacyUnique = indexes.filter((index) => index.unique && (index.key?.username === 1 || index.key?.email === 1));
  for (const index of legacyUnique) {
    if (Object.keys(index.key).length !== 1) throw new Error(`Unexpected compound unique index ${index.name}; manual review is required.`);
  }
  const actions = [];
  if (!indexes.some((index) => keyEquals(index.key, { createdAt: -1 }))) actions.push({ action: 'create', name: 'createdAt_-1' });
  for (const spec of desired) {
    const current = indexes.find((index) => keyEquals(index.key, spec.key) && index.unique && JSON.stringify(index.partialFilterExpression || null) === JSON.stringify(spec.partialFilterExpression));
    if (!current) actions.push({ action: 'create', name: spec.name });
    for (const old of legacyUnique.filter((index) => keyEquals(index.key, spec.key) && index.name !== spec.name && !(index.partialFilterExpression && JSON.stringify(index.partialFilterExpression) === JSON.stringify(spec.partialFilterExpression)))) {
      actions.push({ action: 'drop-after-create', name: old.name });
    }
  }
  console.log(`${apply ? 'Applying' : 'Dry run (no changes made);'} planned actions:`, JSON.stringify(actions));
  if (!apply) return;
  for (const spec of desired) {
    const exists = indexes.some((index) => keyEquals(index.key, spec.key) && index.unique && JSON.stringify(index.partialFilterExpression || null) === JSON.stringify(spec.partialFilterExpression));
    if (!exists) await collection.createIndex(spec.key, { name: spec.name, unique: true, partialFilterExpression: spec.partialFilterExpression });
  }
  if (!indexes.some((index) => keyEquals(index.key, { createdAt: -1 }))) await collection.createIndex({ createdAt: -1 }, { name: 'createdAt_-1' });
  for (const action of actions.filter((item) => item.action === 'drop-after-create')) await collection.dropIndex(action.name);
  console.log('User unique indexes now match the string-only partial filters.');
}

main().catch((error) => { console.error('User index migration stopped:', error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
