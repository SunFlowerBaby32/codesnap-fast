const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const defaults = Object.fromEntries(Object.entries(manifest.contributes.configuration.properties).map(([name, setting]) => [name.slice('codesnapFast.'.length), setting.default]));
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  try {
    let content = fs.readFileSync(file);
    if (file.endsWith('index.html')) content = content.toString().replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '');
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(content);
  } catch { response.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const options = { headless: true };
    if (process.env.CODESNAP_BROWSER_PATH) options.executablePath = process.env.CODESNAP_BROWSER_PATH;
    else if (process.platform === 'win32') options.channel = 'msedge';
    browser = await chromium.launch(options);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.addInitScript(() => {
      window.acquireVsCodeApi = () => ({ postMessage: message => {
        window.lastMessage = message;
        window.onCodeSnapMessage?.(message);
      } });
      document.execCommand = () => false;
      Object.defineProperty(navigator.clipboard, 'write', { writable: true, configurable: true, value: async items => {
        window.copyBlob = await items[0].getType('image/png');
      } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/webview/index.html`);
    const result = await page.evaluate(async defaults => {
      const { default: renderer } = await import('/vendor/dom-to-image-more.js');
      const { pasteCode } = await import('/webview/src/code.js');
      const { takeSnap } = await import('/webview/src/snap.js');
      const config = { ...defaults, fontLigatures: true, tabSize: 4, startLine: 0, nativeClipboard: false, shutterAction: 'copy' };
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'update', ...config } }));
      document.body.style.cssText = '--vscode-editor-background:#1f1f1f;--vscode-editor-foreground:#ddd;--vscode-editor-font-family:monospace;--vscode-editor-font-size:22;--vscode-editor-font-weight:bold;--vscode-editorLineNumber-foreground:#858585';
      for (let index = 0; index < 600; index++) document.body.style.setProperty('--vscode-test-' + index, '#abcdef');
      const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(value => value.toString(16).padStart(2, '0')).join('');
      const timings = [];
      for (const fixture of ['dense', 'transparent', 'window', 'mixed']) {
        const sample = fixture === 'dense' ? 'for (int index = 0; index < count; ++index) { sum += values[index]; }' : '// 中文: min(a, b) != 0 && sum < count; vector<pair<int, int>> edges;';
        const colors = ['#c586c0', '#569cd6', '#b5cea8', '#9cdcfe'];
        const row = '<div>' + Array.from({ length: 24 }, (_, index) => {
          const text = sample.slice(Math.floor(index * sample.length / 24), Math.floor((index + 1) * sample.length / 24)).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
          let formatting = `color:${colors[index % 4]}`;
          if (fixture !== 'dense') formatting += `;font-weight:${index % 3 ? 'normal' : 'bold'};font-style:${index % 4 ? 'normal' : 'italic'};text-decoration:${index % 5 ? 'none' : 'underline'}`;
          if (fixture === 'mixed') {
            const extra = [';font-size:1.2em;line-height:1.8', ';color:var(--vscode-editor-foreground)', ';background-color:rgba(150,80,100,.5)', ';text-shadow:1px 1px #8f8', ';color:var(--local-color);--local-color:#fa0', ';display:inline-block;border:1px solid', ';letter-spacing:.5px;word-spacing:2px', ';font-size:130%;line-height:0'];
            formatting += extra[index % extra.length];
            if (index === 17) return `<span class="custom" style="${formatting}">${text}</span>`;
            if (index === 18) return `<span style="${formatting}"><span style="color:#abc">${text}</span></span>`;
          }
          return `<span style="${formatting}">${text}</span>`;
        }).join('') + '</div>';
        pasteCode(config, { getData: type => type === 'text/html' ? `<div style="font-size:22px;line-height:1.5">${row.repeat(fixture === 'dense' ? 200 : 12)}</div>` : '' });
        document.querySelector('#window').style.width = fixture === 'window' ? '400px' : 'max-content';
        const captureConfig = { ...config, target: fixture === 'window' ? 'window' : 'container', transparentBackground: fixture === 'transparent' };
        const parents = document.querySelectorAll('.line-code > span');
        parents.forEach(parent => parent.setAttribute('data-full-style', ''));
        const baselineStarted = performance.now();
        await takeSnap(captureConfig);
        const fullMilliseconds = Math.round(performance.now() - baselineStarted);
        const baseline = await hash(window.copyBlob);
        await new Promise(resolve => setTimeout(resolve, 250));
        parents.forEach(parent => parent.removeAttribute('data-full-style'));
        const started = performance.now();
        await takeSnap(captureConfig);
        const milliseconds = Math.round(performance.now() - started);
        if (await hash(window.copyBlob) !== baseline) throw new Error(`PNG differs for ${fixture}`);
        timings.push({ fixture, fullMilliseconds, milliseconds });
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const plainText = '#include <bits/stdc++.h>\nvector<pair<int, int>> edges;\n<img src="https://example.invalid/pixel"> & value';
      pasteCode(config, { getData: type => type === 'text/plain' ? plainText : '' });
      if (document.querySelector('#snippet img') || !document.querySelector('#snippet').textContent.includes('<bits/stdc++.h>')) throw new Error('Plain text must not become HTML');
      let writes = 0;
      let copyCompleted = false;
      navigator.clipboard.write = async items => {
        writes++;
        window.copyBlob = await items[0].getType('image/png');
        copyCompleted = true;
      };
      const copyEvent = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
      const defaultAllowed = document.dispatchEvent(copyEvent);
      for (let attempt = 0; attempt < 200 && !copyCompleted; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
      await new Promise(resolve => setTimeout(resolve, 300));
      if (defaultAllowed || !copyEvent.defaultPrevented || writes !== 1 || !copyCompleted) throw new Error('Copy entry must submit a single image write');
      const image = window.copyBlob;
      renderer.toBlob = async () => image;
      let browserWrites = 0;
      navigator.clipboard.write = () => { browserWrites++; throw new Error('Native path used the browser'); };
      let receiveRequest;
      window.onCodeSnapMessage = message => { if (message.type === 'copyImageNative') receiveRequest(message); };
      let requestReceived = new Promise(resolve => { receiveRequest = resolve; });
      const nativeConfig = { ...config, nativeClipboard: true, showTiming: true };
      const flash = document.querySelector('#flash-fx');
      flash.style.display = 'none';
      const capture = takeSnap(nativeConfig);
      const duplicate = takeSnap(nativeConfig);
      const request = await requestReceived;
      if (!request.data.startsWith('iVBORw0KGgo') || flash.style.display === 'block') throw new Error('Native PNG must await confirmation');
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'nativeCopyResult', requestId: 'stale', success: true } }));
      if (flash.style.display === 'block') throw new Error('Stale confirmation accepted');
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'nativeCopyResult', requestId: request.requestId, success: true } }));
      await Promise.all([capture, duplicate]);
      if (!document.querySelector('#codesnap-runtime-timing').textContent.includes('Windows 原生剪贴板')) throw new Error('Native success was not acknowledged');
      requestReceived = new Promise(resolve => { receiveRequest = resolve; });
      const failed = takeSnap(nativeConfig).then(() => '', error => error.message);
      const failedRequest = await requestReceived;
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'nativeCopyResult', requestId: failedRequest.requestId, success: false, error: 'Simulated failure' } }));
      if (await failed !== 'Simulated failure') throw new Error('Native failure was hidden');
      if (document.querySelector('#window').style.resize !== 'horizontal') throw new Error('Failure did not restore resize');
      const originalTimeout = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 20000 ? 1 : delay, ...args);
      window.onCodeSnapMessage = () => {};
      let timeoutError;
      try { await takeSnap(nativeConfig); } catch (error) { timeoutError = error.message; }
      finally { window.setTimeout = originalTimeout; }
      if (timeoutError !== 'Windows clipboard request timed out' || browserWrites !== 0) throw new Error('Native timeout handling failed');
      renderer.toPng = async () => 'data:image/png;base64,c2F2ZQ==';
      await takeSnap({ ...config, shutterAction: 'save' });
      if (window.lastMessage.type !== 'save' || window.lastMessage.data !== 'c2F2ZQ==') throw new Error('Save path changed');
      return { timings, pixelsPreserved: true, plainTextEscaped: true, copyEventChecked: true, nativeProtocolChecked: true };
    }, defaults);
    console.log(JSON.stringify(result, null, 2));
    assert(result.pixelsPreserved && result.plainTextEscaped && result.copyEventChecked && result.nativeProtocolChecked);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
