# CodeSnap Fast

基于 [CodeSnap](https://github.com/kufii/CodeSnap) 的独立优化版：保留代码截图外观与 **2× PNG 分辨率**，重点解决 Windows 上图片已经生成、却长时间卡在写入剪贴板的问题。

This independent CodeSnap fork adds a local Windows-native image clipboard path and guarded rendering optimizations. It is not an official CodeSnap release.

## 下载与安装

1. 打开 [Releases](https://github.com/SunFlowerBaby32/codesnap-fast/releases/latest)，下载 `.vsix` 文件。
2. 在桌面版 VS Code 的扩展面板中，点击右上角 `…` → **从 VSIX 安装…**，选择该文件。
3. 命令面板运行 **CodeSnap Fast 📸**，或在编辑器选中代码后右键打开。

目前通过 GitHub 分发，**没有上架 VS Code Marketplace**，不需要 Microsoft 发布者账号即可从 VSIX 安装。要求 VS Code 1.85 或更新版本。

扩展标识为 `sunflowerbaby32.codesnap-fast`，命令为 `codesnapFast.start`，不会覆盖原版 `adpyke.codesnap`。可同时安装，建议停用原版以减少重复菜单。原版 `codesnap.*` 设置不自动修改，按需迁移到 `codesnapFast.*`。

## 使用

1. 选中需要截图的代码，打开 CodeSnap Fast 预览。
2. 必要时拖动预览窗口调整宽度。
3. 在预览内按 **Ctrl+C** 复制图片；也可以把 `codesnapFast.shutterAction` 设置为 `copy`，让相机按钮直接复制。
4. 相机按钮默认保存 PNG；设为 `save` 时可选择保存位置。

只有剪贴板写入确认成功后才闪光，生成期间重复复制不会重复排队。字体和颜色来自 VS Code，不内置个人字体或背景图片。

## 为什么 Windows 复制更快

原路径依赖 Webview 的 `navigator.clipboard.write()`。遇到图片生成完成后仍长期等待的情况，本分支在 Windows 桌面版改走本地原生通道：

`生成原 PNG → 扩展后台 → Windows PowerShell STA → Windows 剪贴板`

同时提供原 PNG 数据和兼容位图格式。PowerShell 在隐藏窗口中启动，不运行用户选中的代码，不需要管理员权限，不修改执行策略，也不关闭其他程序。

渲染阶段减少重复主题样式复制；普通高亮片段使用有条件的快速路径，复杂格式仍完整复制计算样式。耗时依图片尺寸、平台、系统负载和剪贴板占用而变化，**不保证每次复制都在固定秒数内完成**。

## 设置

在 VS Code 设置中搜索 `CodeSnap Fast`。常用配置示例：

```json
{
  "codesnapFast.shutterAction": "copy",
  "codesnapFast.showLineNumbers": true,
  "codesnapFast.showWindowTitle": false,
  "codesnapFast.clipboardMode": "auto",
  "codesnapFast.showTiming": false
}
```

| 设置 | 作用 |
| --- | --- |
| `clipboardMode` | `auto`：Windows 使用原生通道，其他桌面平台使用浏览器通道；`browser`：手动使用浏览器通道。 |
| `showTiming` | 显示图片生成和剪贴板耗时，默认关闭；出错时仍显示错误信息。 |
| `shutterAction` | 相机按钮执行 `save` 或 `copy`，默认 `save`。 |
| `backgroundColor` / `boxShadow` / `containerPadding` | 截图底色、阴影和留白。 |
| `roundedCorners` / `showWindowControls` / `showWindowTitle` | 窗口外观。 |
| `showLineNumbers` / `realLineNumbers` | 行号与原始起始行号。 |
| `transparentBackground` / `target` | 透明背景，或选择整个容器/仅代码窗口。 |

以上键名均需加 `codesnapFast.` 前缀。

## 平台、安全与隐私

- 原生加速在 Windows 11 的桌面版 VS Code 实际验证。macOS/Linux 保留浏览器路径，尚未完成同等范围的实际验证；不支持 vscode.dev 等纯网页运行环境。
- 扩展指定为 UI 扩展，让剪贴板功能运行在本地界面端。WSL/Remote SSH 尚未完成端到端验证。
- Windows 需要系统自带的 Windows PowerShell 与 .NET 桌面组件。企业策略阻止 PowerShell 时，改用 `"codesnapFast.clipboardMode": "browser"`；**不要为此绕过管理员安全策略**。
- 不主动联网、不上传代码或图片、不收集遥测。Windows 剪贴板历史与云同步仍由系统设置决定。
- Windows 原生传输会把 PNG 暂存于系统临时目录的 `codesnap-clipboard-*` 子目录，操作结束后清理。异常终止可能留下临时文件。
- 原生请求验证 PNG 标识和尺寸，限制 PNG 为 64 MiB、单边不超过 32767 像素、展开像素不超过 512 MiB。后台进程限时 15 秒，前端等待限时 20 秒，不会以降低清晰度或假报成功来掩盖失败。

## 开发与打包

需要 Node.js **22.15+（推荐 24）** 与 npm。运行时代码没有 npm 生产依赖，渲染器源码与许可已包含在 `vendor/`。

```sh
npm ci --ignore-scripts
npm test
npx playwright-core install chromium
npm run test:browser
npm run package
```

VSIX 输出在 `dist/`。测试仅使用合成代码和生成的测试图片，不写入当前系统剪贴板；Windows 原生数据准备在 `-CheckOnly` 模式验证。浏览器测试比较完整样式路径与优化路径的 PNG 像素，同时检查复制事件、确认回执和失败/超时恢复。

可选的 GitHub Actions 配置保存在 [`docs/ci-workflow.yml`](docs/ci-workflow.yml)，目前未自动启用。仓库维护者可在具备工作流修改权限时将它放到 `.github/workflows/ci.yml`，启用 Windows/Linux 检查与 VSIX 构建。

## 致谢与许可

原始 CodeSnap 由 Adrien Pyke 与贡献者维护，原发布者为 `adpyke`。本分支不是原作者官方版本。另感谢 dom-to-image-even-more、Polacode 与 Carbon。

本项目使用 MIT 许可，详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。欢迎提交可复现问题；请不要在 issue 中公开敏感代码或剪贴板内容。
