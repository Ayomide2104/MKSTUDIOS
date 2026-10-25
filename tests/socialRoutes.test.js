const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { publicFeedFilter, isVisibleInGeneralFeed } = require('../src/services/postVisibility');

async function withServer(run) {
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve)=>server.close(resolve)); }
}

test('general feed visibility requires an explicit general destination', () => {
  assert.deepEqual(publicFeedFilter(),{ destinations:{ $elemMatch:{ type:'general' } } });
  assert.equal(isVisibleInGeneralFeed({ destinations:[{type:'community',target:'private-lobby'}] }),false);
  assert.equal(isVisibleInGeneralFeed({ destinations:[{type:'game',target:'valorant'}] }),false);
  assert.equal(isVisibleInGeneralFeed({ destinations:[{type:'general'},{type:'community',target:'lobby'}] }),true);
});

test('guest session lookup is quiet while protected social actions reject guests', async () => {
  await withServer(async (base)=>{
    for (const [path,method,body] of [
      ['/api/posts','POST',{body:'hello',destinations:[{type:'general'}]}],
      ['/api/games/valorant/interest','PUT',{interested:true}],
      ['/api/communities/fc-mobile/join','POST']
    ]) {
      const response=await fetch(`${base}${path}`,{method,headers:{Origin:'http://localhost:5174',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
      assert.equal(response.status,401,path);
      assert.equal((await response.json()).success,false);
    }
    const me = await fetch(`${base}/api/auth/me`);
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), { user: null });
  });
});

test('registration rejects malformed values without touching MongoDB', async () => {
  await withServer(async (base)=>{
    const response=await fetch(`${base}/api/auth/register`,{method:'POST',headers:{Origin:'http://localhost:5174','Content-Type':'application/json'},body:JSON.stringify({username:{ $ne:'' },password:'long-enough-pass'})});
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/invalid field|username and password/i);
  });
});

test('Helmet headers and strict write-origin checks are active', async () => {
  await withServer(async (base)=>{
    const health=await fetch(`${base}/api/health`);
    assert.equal(health.headers.get('x-content-type-options'),'nosniff');
    assert.ok(health.headers.get('content-security-policy'));
    const blocked=await fetch(`${base}/api/auth/register`,{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:JSON.stringify({username:'valid_player',password:'long-enough-password'})});
    assert.equal(blocked.status,403);
    const absent=await fetch(`${base}/api/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'valid_player',password:'long-enough-password'})});
    assert.equal(absent.status,403);
  });
});
