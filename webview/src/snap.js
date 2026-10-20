import domtoimage from '../../vendor/dom-to-image-more.js';
import { $, $$, redraw, once, setVar } from './util.js';

const vscode = acquireVsCodeApi();
const windowNode = $('#window');
const snippetContainerNode = $('#snippet-container');

const flashFx = $('#flash-fx');

const SNAP_SCALE = 2;
let takingSnap = false;
let nativeRequestNumber = 0;
let pendingNativeCopy = null;
const timingNode = document.createElement('div');
timingNode.id = 'codesnap-runtime-timing';
timingNode.setAttribute('role', 'status');
timingNode.setAttribute('aria-live', 'polite');
timingNode.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:2147483647;padding:4px 8px;border-radius:4px;background:var(--vscode-editor-background,#1f1f1f);color:var(--vscode-editor-foreground,#ddd);font:12px sans-serif;pointer-events:none';
timingNode.textContent = 'CodeSnap Fast';
timingNode.hidden = true;
document.body.appendChild(timingNode);

window.addEventListener('message', ({ data }) => {
  if (!data || data.type !== 'nativeCopyResult' || !pendingNativeCopy ||
      data.requestId !== pendingNativeCopy.requestId) return;
  const pending = pendingNativeCopy;
  pendingNativeCopy = null;
  clearTimeout(pending.timeout);
  if (data.success) pending.resolve();
  else pending.reject(new Error(data.error || 'Windows clipboard write failed'));
});

export const cameraFlashAnimation = async () => {
  flashFx.style.display = 'block';
  redraw(flashFx);
  flashFx.style.opacity = '0';
  await once(flashFx, 'transitionend');
  flashFx.style.display = 'none';
  flashFx.style.opacity = '1';
};

export const takeSnap = async (config) => {
  if (takingSnap || !config) return;
  takingSnap = true;
  timingNode.hidden = !config.showTiming;
  const started = performance.now();
  timingNode.textContent = '测时版：正在生成图片…';
  try {
    windowNode.style.resize = 'none';
    if (config.transparentBackground || config.target === 'window') {
      setVar('container-background-color', 'transparent');
    }

    const target = config.target === 'container' ? snippetContainerNode : windowNode;
    const options = {
      bgColor: 'transparent',
      scale: SNAP_SCALE,
      postProcess: (node) => {
        $$('#snippet-container, #snippet, .line, .line-code span', node).forEach(
          (span) => (span.style.width = 'unset')
        );
        $$('.line-code', node).forEach((span) => (span.style.width = '100%'));
      }
    };

    if (config.shutterAction === 'copy') {
      const clipboardLabel = config.nativeClipboard ? 'Windows 原生剪贴板' : '浏览器剪贴板';
      let imageReadyAt;
      const image = domtoimage.toBlob(target, options).then((blob) => {
        imageReadyAt = performance.now();
        timingNode.textContent = `图片 ${((imageReadyAt - started) / 1000).toFixed(2)} 秒，正在写入${clipboardLabel}…`;
        return blob;
      });
      if (config.nativeClipboard) {
        const blob = await image;
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
          reader.onerror = () => reject(reader.error || new Error('Cannot read PNG image'));
          reader.readAsDataURL(blob);
        });
        await new Promise((resolve, reject) => {
          const requestId = String(++nativeRequestNumber);
          const timeout = setTimeout(() => {
            if (pendingNativeCopy?.requestId !== requestId) return;
            pendingNativeCopy = null;
            reject(new Error('Windows clipboard request timed out'));
          }, 20000);
          pendingNativeCopy = { requestId, resolve, reject, timeout };
          try {
            vscode.postMessage({ type: 'copyImageNative', requestId, data });
          } catch (error) {
            clearTimeout(timeout);
            pendingNativeCopy = null;
            reject(error);
          }
        });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);
      }
      if (imageReadyAt !== undefined) {
        timingNode.textContent = `图片 ${((imageReadyAt - started) / 1000).toFixed(2)} 秒 · ${clipboardLabel} ${((performance.now() - imageReadyAt) / 1000).toFixed(2)} 秒`;
      }
      cameraFlashAnimation();
    } else {
      const url = await domtoimage.toPng(target, options);
      const data = url.slice(url.indexOf(',') + 1);
      vscode.postMessage({ type: config.shutterAction, data });
      timingNode.textContent = `图片 ${((performance.now() - started) / 1000).toFixed(2)} 秒 · 已发送保存请求`;
    }
  } catch (error) {
    timingNode.hidden = false;
    timingNode.textContent = `截图失败：${String(error.message || error.name || 'Error').slice(0, 160)}`;
    throw error;
  } finally {
    windowNode.style.resize = 'horizontal';
    setVar('container-background-color', config.backgroundColor);
    takingSnap = false;
  }
};
