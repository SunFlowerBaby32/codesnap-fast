'use strict';

const vscode = require('vscode');
const path = require('path');
const { homedir, tmpdir } = require('os');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const { readHtml, writeFile, getSettings } = require('./util');
const execFileAsync = promisify(execFile);

const copyImageNative = async (encodedImage) => {
  if (process.platform !== 'win32') throw new Error('Native image clipboard requires Windows');
  if (typeof encodedImage !== 'string' || encodedImage.length > 90 * 1024 * 1024) {
    throw new Error('Invalid clipboard image');
  }
  const image = Buffer.from(encodedImage, 'base64');
  if (image.length < 24 || image.length > 64 * 1024 * 1024 ||
      image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      image.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Expected a PNG image');
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (!width || !height || width > 32767 || height > 32767 || width * height * 4 > 512 * 1024 * 1024) {
    throw new Error('Image is too large for the clipboard');
  }
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'codesnap-clipboard-'));
  const imagePath = path.join(directory, 'capture.png');
  try {
    await fs.writeFile(imagePath, image, { flag: 'wx' });
    const executable = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const { stdout } = await execFileAsync(executable, [
      '-NoProfile', '-NonInteractive', '-STA', '-File', path.join(__dirname, 'copy-image.ps1'), imagePath
    ], { windowsHide: true, timeout: 15000, maxBuffer: 8192 });
    return JSON.parse(stdout.trim());
  } finally {
    await fs.rm(imagePath, { force: true });
    await fs.rmdir(directory);
  }
};

const getConfig = () => {
  const editorSettings = getSettings('editor', ['fontLigatures', 'tabSize']);
  const editor = vscode.window.activeTextEditor;
  if (editor) editorSettings.tabSize = editor.options.tabSize;

  const extensionSettings = getSettings('codesnapFast', [
    'backgroundColor',
    'boxShadow',
    'containerPadding',
    'roundedCorners',
    'showWindowControls',
    'showWindowTitle',
    'showLineNumbers',
    'realLineNumbers',
    'transparentBackground',
    'target',
    'shutterAction',
    'showTiming',
    'clipboardMode'
  ]);

  const selection = editor && editor.selection;
  const startLine = extensionSettings.realLineNumbers ? (selection ? selection.start.line : 0) : 0;

  let windowTitle = '';
  if (editor && extensionSettings.showWindowTitle) {
    const activeFileName = editor.document.uri.path.split('/').pop();
    windowTitle = `${vscode.workspace.name} - ${activeFileName}`;
  }

  return {
    ...editorSettings,
    ...extensionSettings,
    nativeClipboard: process.platform === 'win32' && extensionSettings.clipboardMode !== 'browser',
    startLine,
    windowTitle
  };
};

const createPanel = async (context) => {
  const panel = vscode.window.createWebviewPanel(
    'codesnapFast',
    'CodeSnap Fast 📸',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );
  panel.webview.html = await readHtml(
    path.resolve(context.extensionPath, 'webview/index.html'),
    panel
  );

  return panel;
};

let lastUsedImageUri = vscode.Uri.file(path.resolve(homedir(), 'Desktop/code.png'));
const saveImage = async (data) => {
  const uri = await vscode.window.showSaveDialog({
    filters: { Images: ['png'] },
    defaultUri: lastUsedImageUri
  });
  lastUsedImageUri = uri;
  uri && writeFile(uri.fsPath, Buffer.from(data, 'base64'));
};

const hasOneSelection = (selections) =>
  selections && selections.length === 1 && !selections[0].isEmpty;

const runCommand = async (context) => {
  const panel = await createPanel(context);

  const update = async () => {
    await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
    panel.webview.postMessage({ type: 'update', ...getConfig() });
  };

  const flash = () => panel.webview.postMessage({ type: 'flash' });

  panel.webview.onDidReceiveMessage(async ({ type, data, requestId }) => {
    if (type === 'save') {
      flash();
      await saveImage(data);
    } else if (type === 'copyImageNative') {
      if (typeof requestId !== 'string' || requestId.length > 64) return;
      try {
        const metrics = await copyImageNative(data);
        await panel.webview.postMessage({ type: 'nativeCopyResult', requestId, success: true, metrics });
      } catch (error) {
        await panel.webview.postMessage({ type: 'nativeCopyResult', requestId, success: false, error: error.message });
      }
    } else {
      vscode.window.showErrorMessage(`CodeSnap Fast 📸: Unknown shutterAction "${type}"`);
    }
  });

  const selectionHandler = vscode.window.onDidChangeTextEditorSelection(
    (e) => hasOneSelection(e.selections) && update()
  );
  panel.onDidDispose(() => selectionHandler.dispose());

  const editor = vscode.window.activeTextEditor;
  if (editor && hasOneSelection(editor.selections)) update();
};

module.exports.activate = (context) =>
  context.subscriptions.push(
    vscode.commands.registerCommand('codesnapFast.start', () => runCommand(context))
  );
