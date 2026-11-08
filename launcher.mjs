import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer, getPort, getHost, getBaseUrl, localUrl } from './server.mjs';

export function openBrowser(url, { platform = process.platform, spawnProcess = spawn, report = console.error } = {}) {
  const commands = {
    win32: ['rundll32.exe', ['url.dll,FileProtocolHandler', url]],
    darwin: ['/usr/bin/open', [url]],
    linux: ['xdg-open', [url]]
  };
  const command = commands[platform];
  const failed = error => report(`无法自动打开浏览器，请手动访问 ${url}\n${error.message}`);
  if (!command) return failed(new Error('当前系统没有配置浏览器启动命令。'));
  try {
    const child = spawnProcess(command[0], command[1], { windowsHide: true, stdio: 'ignore' });
    child.once('error', failed);
    child.once('exit', code => { if (code) failed(new Error(`浏览器启动命令退出码：${code}`)); });
    child.unref();
  } catch (error) { failed(error); }
}

export async function launch({ port = getPort(), host = getHost(), baseUrl = getBaseUrl(), dataDir, gameDir, open = openBrowser } = {}) {
  baseUrl = getBaseUrl(baseUrl);
  let url = localUrl(host, port);
  if (port) {
    try {
      const response = await fetch(url + 'api/health', { signal: AbortSignal.timeout(700) });
      if (response.ok && (await response.json()).app === 'cat-nation-local') {
        open(baseUrl ?? url);
        return null;
      }
    } catch {}
  }
  const server = createGameServer({ dataDir, gameDir, baseUrl });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
  });
  url = baseUrl ?? localUrl(host, server.address().port);
  console.log('Cat Nation Local: ' + url + '\nSaves: data/latest.json + data/backups\nKeep this window open while playing. Close it to stop.');
  open(url);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launch().catch(error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${getPort()} 已被其他程序占用。请设置 CAT_NATION_PORT 后重试。` : error);
    process.exitCode = 1;
  });
}
