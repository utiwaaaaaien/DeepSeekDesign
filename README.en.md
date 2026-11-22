<p align="center"><img src="deepseek-design-plugin/icon.png" alt="" width="84" height="84"></p>

# DeepSeekDesign

[简体中文](README.md) · [Community discussion](https://github.com/deepseek-ai/deepseek-harness/discussions/14093) · [Download v1.0.0](https://github.com/utiwaaaaaien/DeepSeekDesign/releases/tag/v1.0.0)

DeepSeekDesign is a code animation workbench for DeepSeek Harness. Describe an animation in the native conversation, combine the generated video with your own media on a timeline, and export the edit.

DeepSeekDesign is an unofficial plugin developed and maintained independently by the community.

![DeepSeekDesign workbench with a particle animation preview, video track, audio waveform, and the active conversation](https://github.com/user-attachments/assets/71a9fe05-3e89-4803-b535-e94d335177bc)

## Installation

1. Download `deepseek-design-1.0.0.tgz` from the GitHub release.
2. In Harness, open **Plugins → Add plugin**, select the third-party installation option, and enter the absolute path to the file.
3. Enable the plugin and open **DeepSeekDesign** from the sidebar or the conversation header.

You can also install it into the Web profile from the CLI.

```sh
dsh plugin --profile web add /absolute/path/to/deepseek-design-1.0.0.tgz
dsh web
```

## What you can do

- **Generate animations.** Describe the visuals and timing in a Harness conversation. The model can draw a Canvas animation in JavaScript and render it to a video in the asset library.
- **Edit on a timeline.** Import audio and video and drag clips onto tracks to move, trim, or split them. Export to MP4 or WebM according to browser support.
- **Manage projects.** Each Harness workspace can hold multiple projects. Projects save automatically and can be imported, exported, or restored from recent local backups.

## Try it

> Create a five-second 16:9 animation. On a dark blue grid, move three lights along different elliptical paths. Draw it with JavaScript and Canvas, then use DeepSeekDesign to render it to a video in the asset library.

## Compatibility

Tested with the DeepSeek Harness 0.2.2-rc.5 Web UI and Chrome on macOS (Apple Silicon). Rendering requires browser support for OffscreenCanvas, ImageBitmap, MediaRecorder, and canvas capture. Generated Canvas animations are silent. You can add audio on the timeline. The plugin reads conversation media and is intended for local, single-user use.

## Feedback

For installation, import, or export problems, open an [issue](https://github.com/utiwaaaaaien/DeepSeekDesign/issues) with your Harness version, operating system, browser, and reproduction steps. You can also share feedback in the [community discussion](https://github.com/deepseek-ai/deepseek-harness/discussions/14093).

## Development

The [plugin directory](deepseek-design-plugin/) contains the Host, Web Client, and animation Worker. Run the tests with Node.js 22 or later.

```sh
node --test tests/*.test.mjs
```

See the [plugin documentation](deepseek-design-plugin/README.md) for technical details and the [changelog](deepseek-design-plugin/CHANGELOG.md) for version history. DeepSeekDesign is available under the [MIT License](LICENSE).
