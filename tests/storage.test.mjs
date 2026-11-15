import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createGameServer } from '../server.mjs';

function realSave() {
  const lz = { module: { exports: {} } }, fixture = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(new URL('../game/lib/lz-string.js', import.meta.url), 'utf8'), lz);
  vm.runInNewContext(fs.readFileSync(new URL('../game/test/res/save.js', import.meta.url), 'utf8'), fixture);
  return JSON.parse(lz.module.exports.decompressFromBase64(fixture.module.exports));
}

test('disk save survives restart; restore, import and new game preserve backups and reject stale writes', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-nation-test-'));
  let server;
  t.after(async () => { if (server?.listening) await new Promise(r => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  async function start() {
    server = createGameServer({ dataDir });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${server.address().port}`;
  }
  let url = await start();
  const get = async route => (await fetch(url + route)).json();
  const post = async body => {
    const response = await fetch(url + '/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  assert.deepEqual(await get('/api/state'), { revision: null, save: null });
  const save = realSave();
  const originalCatnip = save.resources.find(r => r.name === 'catnip').value;
  const first = await post({ save, revision: null, kind: 'auto' });
  assert.equal(first.status, 200);
  await new Promise(r => server.close(r));
  url = await start();
  assert.deepEqual((await get('/api/state')).save, save);
  const stale = await post({ save, revision: null, kind: 'auto' });
  assert.equal(stale.status, 409);
  const backups = await get('/api/backups');
  assert.equal(backups.length, 1);
  const snapshot = await get('/api/backup/' + backups[0].name);
  assert.equal(snapshot.save.resources.find(r => r.name === 'catnip').value, originalCatnip);
  save.resources.find(r => r.name === 'catnip').value = 123;
  const manual = await post({ save, revision: first.data.revision, kind: 'manual' });
  assert.equal(manual.status, 200);
  assert.equal((await get('/api/backups')).length, 3);
  const malformed = await post({ save: { resources: [] }, revision: manual.data.revision, kind: 'import' });
  assert.equal(malformed.status, 400);
  assert.equal((await get('/api/state')).revision, manual.data.revision);
  const restored = await post({ save: snapshot.save, revision: manual.data.revision, kind: 'restore' });
  assert.equal(restored.status, 200);
  assert.equal((await get('/api/state')).save.resources.find(r => r.name === 'catnip').value, originalCatnip);
  const prestigeSave = structuredClone(save);
  prestigeSave.buildings = [];
  prestigeSave.resources = [];
  prestigeSave.stats.find(s => s.name === 'totalResets').val += 1;
  const prestige = await post({ save: prestigeSave, revision: restored.data.revision, kind: 'reset' });
  assert.equal(prestige.status, 200);
  assert.deepEqual((await get('/api/state')).save, prestigeSave);
  assert.ok((await get('/api/backups')).some(b => b.name.includes('_before-reset_')));
  const reset = await post({ save: null, revision: prestige.data.revision, kind: 'new' });
  assert.equal(reset.status, 200);
  assert.equal((await get('/api/state')).save, null);
  assert.ok((await get('/api/backups')).some(b => b.name.includes('_before-new_')));
  const fresh = await post({ save, revision: reset.data.revision, kind: 'auto' });
  assert.equal(fresh.status, 200);
  const unsafe = await fetch(url + '/api/save', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unsafe.status, 403);
  assert.equal((await fetch(url + '/.git/config')).status, 403);
  assert.equal((await fetch(url + '/data/latest.json')).status, 404);
  assert.equal((await fetch(url + '/')).status, 200);
  assert.equal((await fetch(url + '/local-client.js')).status, 200);
  fs.writeFileSync(path.join(dataDir, 'latest.json'), '{corrupt');
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await fetch(url + '/api/state')).status, 500);
    assert.equal((await post({ save, revision: fresh.data.revision, kind: 'auto' })).status, 500);
    assert.equal(fs.readFileSync(path.join(dataDir, 'latest.json'), 'utf8'), '{corrupt');
  } finally { console.error = originalError; }
});

test('reset operation IDs replay the same committed result across restart but never overwrite a newer revision', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-reset-id-'));
  let server;
  t.after(async () => { if (server?.listening) await new Promise(r => server.close(r)); fs.rmSync(dataDir, {recursive:true,force:true}); });
  async function start() { server=createGameServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`; }
  let url=await start();
  const post=async body=>{const response=await fetch(url+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const body={save:realSave(),revision:null,kind:'reset',operationId:'test-reset-1234'};
  const result=await post(body);assert.equal(result.status,200);assert.equal(result.data.operationId,body.operationId);
  await new Promise(r=>server.close(r));url=await start();
  assert.deepEqual(await post(body),result);
  const altered=structuredClone(body);altered.save.calendar.year++;
  assert.equal((await post(altered)).status,409);
  const newer=await post({save:body.save,kind:'auto',revision:result.data.revision});assert.equal(newer.status,200);
  assert.equal((await post(body)).status,409);
  assert.equal((await (await fetch(url+'/api/state')).json()).revision,newer.data.revision);
});
