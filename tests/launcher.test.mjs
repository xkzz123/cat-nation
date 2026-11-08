import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { launch, openBrowser } from '../launcher.mjs';
import { getPort } from '../server.mjs';

const close = server => new Promise(resolve => server.close(resolve));

test('launcher starts on a free port, reuses the same game and survives a missing browser command', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-nation-launch-'));
  let server;
  t.after(async () => { if (server?.listening) await close(server); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const opened = [];
  server = await launch({ port: 0, dataDir, open: url => opened.push(url) });
  const url = `http://127.0.0.1:${server.address().port}/`;
  assert.deepEqual(opened, [url]);
  assert.equal((await fetch(url)).status, 200);
  const before = fs.readdirSync(dataDir);
  const reused = await launch({ port: server.address().port, dataDir, open: address => opened.push(address) });
  assert.equal(reused, null);
  assert.deepEqual(opened, [url, url]);
  assert.deepEqual(fs.readdirSync(dataDir), before);
  const errors = new EventEmitter();
  const reported = once(errors, 'report');
  openBrowser(url, {
    platform: 'darwin',
    spawnProcess: () => spawn(path.join(dataDir, 'missing-browser-command')),
    report: message => errors.emit('report', message)
  });
  assert.match((await reported)[0], /请手动访问/);
  assert.equal((await (await fetch(url + 'api/health')).json()).app, 'cat-nation-local');
});

test('launcher refuses an occupied non-game port without opening a browser or touching that service', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-nation-occupied-'));
  const other = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"app":"another-service"}'); });
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await close(other); fs.rmSync(dataDir, { recursive: true, force: true }); });
  let opened = false;
  await assert.rejects(launch({ port: other.address().port, dataDir, open: () => { opened = true; } }), { code: 'EADDRINUSE' });
  assert.equal(opened, false);
  assert.equal((await (await fetch(`http://127.0.0.1:${other.address().port}/api/health`)).json()).app, 'another-service');
  assert.equal(fs.existsSync(path.join(dataDir, 'latest.json')), false);
});

test('browser opening selects the native command and reports synchronous and nonzero-exit failures', () => {
  for (const [platform, expected, args] of [
    ['win32', 'rundll32.exe', ['url.dll,FileProtocolHandler', 'http://127.0.0.1:9876/']],
    ['darwin', '/usr/bin/open', ['http://127.0.0.1:9876/']],
    ['linux', 'xdg-open', ['http://127.0.0.1:9876/']]
  ]) {
    const child = new EventEmitter(); child.unref = () => {};
    const errors = [];
    openBrowser('http://127.0.0.1:9876/', { platform, report: message => errors.push(message), spawnProcess: (command, values) => { assert.equal(command, expected); assert.deepEqual(values, args); return child; } });
    child.emit('exit', 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /9876/);
  }
  const errors = [];
  openBrowser('http://127.0.0.1:9876/', { platform: 'darwin', report: message => errors.push(message), spawnProcess: () => { throw new Error('spawn failed'); } });
  assert.match(errors[0], /spawn failed/);
});

test('port configuration rejects invalid values before starting a service', () => {
  assert.equal(getPort('8766'), 8766);
  for (const value of ['', '0', '-1', '65536', '8765.5', 'NaN', '8765junk', ' ']) assert.throws(() => getPort(value), /CAT_NATION_PORT/);
});

test('configured domain accepts proxy-style headers while untrusted hosts and origins remain blocked', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-nation-domain-'));
  const opened = [];
  const server = await launch({ port: 0, host: '127.0.0.1', baseUrl: 'https://cats.example/', dataDir, open: url => opened.push(url) });
  t.after(async () => { await close(server); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const port = server.address().port;
  const request = (host, origin) => new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/api/state', headers: { Host: host, ...(origin ? { Origin: origin } : {}) } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
  });
  assert.deepEqual(opened, ['https://cats.example/']);
  assert.equal(await request('cats.example', 'https://cats.example'), 200);
  assert.equal(await request('cats.example', 'https://evil.example'), 403);
  assert.equal(await request('evil.example'), 403);
  assert.equal(await request(`127.0.0.1:${port}`), 200);
  assert.equal(await launch({ port, host: '127.0.0.1', baseUrl: 'https://cats.example/', dataDir, open: url => opened.push(url) }), null);
  assert.deepEqual(opened, ['https://cats.example/', 'https://cats.example/']);
});

test('wildcard listening opens a usable local address instead of 0.0.0.0', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-nation-wildcard-'));
  const opened = [];
  const server = await launch({ port: 0, host: '0.0.0.0', dataDir, open: url => opened.push(url) });
  t.after(async () => { await close(server); fs.rmSync(dataDir, { recursive: true, force: true }); });
  assert.equal(opened[0], `http://127.0.0.1:${server.address().port}/`);
  assert.equal((await fetch(opened[0] + 'api/health')).status, 200);
});

test('address configuration rejects unsupported URLs and preserves local defaults', async () => {
  const { getHost, getBaseUrl, localUrl } = await import('../server.mjs');
  assert.equal(getHost('0.0.0.0'), '0.0.0.0');
  assert.equal(getBaseUrl('https://cats.example:8443'), 'https://cats.example:8443/');
  assert.equal(localUrl('::', 8766), 'http://[::1]:8766/');
  for (const value of ['', 'ftp://cats.example', 'https://user:pass@cats.example', 'https://cats.example/game/', 'https://cats.example/?x=1', 'https://cats.example/#x']) assert.throws(() => getBaseUrl(value));
  for (const value of ['', 'http://localhost', 'local host', 'localhost/path']) assert.throws(() => getHost(value));
});
