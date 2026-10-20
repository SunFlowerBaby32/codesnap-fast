const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const util = require('node:util');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const createPng = require('./png.cjs');

const root = path.resolve(__dirname, '..');

test('independent extension identity, bundled renderer and local UI host', () => {
  const manifest = require('../package.json');
  assert.equal(manifest.name, 'codesnap-fast');
  assert.equal(manifest.contributes.commands[0].command, 'codesnapFast.start');
  assert.deepEqual(manifest.extensionKind, ['ui']);
  assert(Object.keys(manifest.contributes.configuration.properties).every(name => name.startsWith('codesnapFast.')));
  assert.equal(manifest.contributes.configuration.properties['codesnapFast.showTiming'].default, false);
  assert.equal(manifest.dependencies, undefined);
  assert(!fs.readFileSync(path.join(root, 'webview/index.html'), 'utf8').includes('../node_modules'));
  assert(fs.existsSync(path.join(root, 'vendor/LICENSE')));
});

test('native bridge validates input, bounds hidden execution and cleans up after failures', async () => {
  const image = createPng();
  const temporaryPaths = [];
  let failExecution = false;
  const execStub = () => { throw new Error('Unexpected callback execution'); };
  execStub[util.promisify.custom] = async (executable, args, options) => {
    assert(executable.endsWith('powershell.exe'));
    assert.equal(options.windowsHide, true);
    assert(options.timeout > 0 && options.timeout <= 15000);
    assert(args.includes('-STA'));
    assert(!args.some(argument => /Bypass/i.test(argument)));
    const imagePath = args.at(-1);
    temporaryPaths.push(imagePath);
    assert(fs.readFileSync(imagePath).equals(image));
    assert(path.basename(path.dirname(imagePath)).startsWith('codesnap-clipboard-'));
    if (failExecution) throw new Error('Simulated native process failure');
    return { stdout: JSON.stringify({ Width: 2, Height: 2, HasPng: true, HasBitmap: true }) };
  };
  const context = vm.createContext({
    Buffer, console, __dirname: path.join(root, 'src'), module: { exports: {} },
    process: { platform: 'win32', env: { SystemRoot: process.env.SystemRoot || 'Windows' } },
    require: name => {
      if (name === 'vscode') return { Uri: { file: file => ({ fsPath: file }) } };
      if (name === 'child_process') return { execFile: execStub };
      if (name === './util') return { writeFile: fs.promises.writeFile };
      return require(name);
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/extension.js'), 'utf8'), context);
  const copy = vm.runInContext('copyImageNative', context);
  await assert.rejects(copy(null), /Invalid clipboard image/);
  await assert.rejects(copy('not a PNG'), /Expected a PNG/);
  for (const [width, height] of [[0, 2], [2, 0], [100000, 2], [32767, 32767]]) {
    const invalid = Buffer.from(image);
    invalid.writeUInt32BE(width, 16);
    invalid.writeUInt32BE(height, 20);
    await assert.rejects(copy(invalid.toString('base64')), /too large/);
  }
  const result = await copy(image.toString('base64'));
  assert.equal(result.HasPng, true);
  assert(temporaryPaths.every(file => !fs.existsSync(path.dirname(file))));
  failExecution = true;
  await assert.rejects(copy(image.toString('base64')), /Simulated native process failure/);
  assert(temporaryPaths.every(file => !fs.existsSync(path.dirname(file))));
});

test('Windows native preparation preserves PNG bytes without writing the clipboard', { skip: process.platform !== 'win32' }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codesnap-native-test-'));
  const file = path.join(directory, 'fixture.png');
  const bytes = createPng();
  try {
    fs.writeFileSync(file, bytes);
    const executable = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const output = execFileSync(executable, ['-NoProfile', '-NonInteractive', '-STA', '-File',
      path.join(root, 'src/copy-image.ps1'), '-ImagePath', file, '-CheckOnly'], { windowsHide: true, timeout: 15000 });
    const result = JSON.parse(output.toString().trim());
    assert.equal(result.CheckOnly, true);
    assert.equal(result.HasPng, true);
    assert.equal(result.HasBitmap, true);
    assert.equal(result.Width, 2);
    assert.equal(result.Height, 2);
    assert.equal(result.PngSha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmdirSync(directory);
  }
});
