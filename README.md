<p align="center"><img src="deepseek-design-plugin/icon.png" alt="" width="84" height="84"></p>

# DeepSeekDesign

[English](README.en.md) · [下载 v1.0.0](https://github.com/utiwaaaaaien/DeepSeekDesign/releases/tag/v1.0.0)

DeepSeekDesign 是一个为 DeepSeek Harness 制作的代码动画工作台。你可以在原生会话中描述想要的动画，把生成的视频和自己的素材拖上时间线，剪辑后导出成片。

这是一个由社区独立开发和维护的非官方插件。

## 安装

1. 从 GitHub Release 下载 `deepseek-design-1.0.0.tgz`。
2. 在 Harness 的「插件 → 添加插件」中选择安装第三方插件，输入该文件的绝对路径并完成安装。
3. 启用插件后，从侧栏或会话标题栏点击 **DeepSeekDesign** 打开工作台。

CLI 用户也可以安装到 Web profile：

```sh
dsh plugin --profile web add /绝对路径/deepseek-design-1.0.0.tgz
dsh web
```

## 工作方式

- **生成动画**。在 Harness 会话里描述画面和节奏。模型可用 JavaScript 绘制 Canvas 动画，渲染后的结果进入素材库。
- **编辑时间线**。导入音视频，把素材拖到轨道上，移动、修剪或拆分片段。成片可按浏览器支持的格式导出为 MP4 或 WebM。
- **管理项目**。每个 Harness 工作区可以保存多个项目。项目会自动保存，并支持导入、导出和恢复近期的本地备份。

## 兼容性

已在 macOS（Apple Silicon）上的 DeepSeek Harness 0.2.2-rc.5 Web 界面与 Chrome 实测。视频渲染依赖浏览器对 OffscreenCanvas、ImageBitmap、MediaRecorder 和 Canvas 捕获的支持。代码生成的 Canvas 动画默认为静音，可在时间线加入音频。插件包含会话媒体读取功能，适用于本机单用户环境。

## 开发

插件源码位于 [deepseek-design-plugin](deepseek-design-plugin/)，包括 Host、Web Client 和动画 Worker。运行测试需 Node.js 22 或更新版本。

```sh
node --test tests/*.test.mjs
```

更多技术细节见 [插件文档](deepseek-design-plugin/README.md)，版本记录见 [CHANGELOG](deepseek-design-plugin/CHANGELOG.md)。项目使用 [MIT 许可证](LICENSE)。
