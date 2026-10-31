// Run once from the project root:  node apply-upload-fix.mjs
// 1) Makes upload problems visible: a clear message if Cloudinary is not set up, and
//    server errors now appear in Render's Logs tab.
// 2) Makes profile photo/banner uploads use the same simple resize as photo posts.
// 3) Fixes the sign-in page accessibility warning.
// Undo: git restore .   All edits are checked first; if one does not match, NOTHING changes.
import fs from 'node:fs';

const fail = (m) => { console.error('STOPPED: ' + m + '\nNothing was changed.'); process.exit(1); };
const FILES = ['src/config/cloudinary.js', 'src/middleware/errorHandler.js', 'src/routes/authRoutes.js', 'index.html'];
const text = {};
for (const f of FILES) { if (!fs.existsSync(f)) fail(`${f} not found. Run from the project root.`); text[f] = fs.readFileSync(f, 'utf8'); }
if (text['src/config/cloudinary.js'].includes('error.status = 503')) fail('Already applied.');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const eolOf = (t) => (t.includes('\r\n') ? '\r\n' : '\n');
function edit(file, oldStr, newStr, label) {
  const t = text[file];
  const rx = new RegExp(esc(oldStr).replace(/\n/g, '\\r?\\n'), 'g');
  const n = (t.match(rx) || []).length;
  if (n !== 1) fail(`${file} (${label}): expected 1 match, found ${n}.`);
  text[file] = t.replace(rx, () => newStr.replace(/\n/g, eolOf(t)));
}
function editRegex(file, rx, newStr, label, expected = 1) {
  const t = text[file];
  const n = [...t.matchAll(new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g'))].length;
  if (n !== expected) fail(`${file} (${label}): expected ${expected} match, found ${n}.`);
  text[file] = t.replace(rx, (...m) => newStr.replace(/\$1/g, m[1] ?? '').replace(/\n/g, eolOf(t)));
}

edit('src/config/cloudinary.js',
  "    throw new Error(\n      'Image uploads are unavailable because Cloudinary is not configured.'\n    );",
  "    const error = new Error('Image uploads are unavailable because Cloudinary is not configured.');\n    error.status = 503;\n    throw error;",
  'clear Cloudinary message');

edit('src/middleware/errorHandler.js',
  "  if (process.env.NODE_ENV !== 'production') {\n    console.error(`${req.method} ${req.path}: ${err.name || 'Error'} (HTTP ${status})`);\n  }",
  "  if (process.env.NODE_ENV !== 'production') {\n    console.error(`${req.method} ${req.path}: ${err.name || 'Error'} (HTTP ${status})`);\n  } else if (status >= 500) {\n    // In production, log server errors so they show up in Render's Logs tab.\n    console.error(`${req.method} ${req.path}: ${err.name || 'Error'}: ${err.message || 'no message'} (HTTP ${status})`);\n  }",
  'production error logging');

editRegex('src/routes/authRoutes.js', /width: 512,\s*height: 512,\s*crop: 'fill',\s*gravity: 'auto',/g, "width: 512,\nheight: 512,\ncrop: 'limit',", 'avatar resize');
editRegex('src/routes/authRoutes.js', /width: 1600, height: 600, crop: 'fill', gravity: 'auto'/g, "width: 1600, height: 600, crop: 'limit'", 'banner resize', 1);
editRegex('index.html', /<a class="ap-brand" href="\/" tabindex="-1">([\s\S]*?)<\/a>/, '<div class="ap-brand">$1</div>', 'brand link');

for (const f of FILES) fs.writeFileSync(f, text[f]);
console.log('Done. Restart the dev server, then deploy. Upload errors will now say what is wrong.');
