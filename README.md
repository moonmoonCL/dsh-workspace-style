# dsh-workspace-style

为 DSH 侧栏的工作区（Workspace）自定义**图标**与**颜色**，并把工作区行菜单里的“重命名”替换成“编辑”，用一个对话框同时编辑名称、图标和颜色。

> 这是一个浏览器端 DSH 插件（Client plugin）。它不修改 Host 的 Workspace 记录，也不新增 Remote 方法；外观保存在浏览器 `localStorage` 中，按稳定的 Workspace id 关联。

## 功能

- **菜单：编辑** — 工作区行“⋯”菜单中的“重命名”项替换为“编辑”，点击打开统一编辑对话框。
- **系统默认选项** — 图标列表首位是“系统默认图标”（原生文件夹，带展开/收起两态），颜色列表首位是“跟随系统”（平时灰色、工作区包含当前会话时高亮蓝色，即内置的选中逻辑）。两个选项独立勾选：可以只换图标、只换颜色，或全部恢复默认。
- **统一编辑对话框** — 工作区名称、工作区图标（1 个默认 + 14 个图形）、工作区颜色（1 个跟随系统 + 15 色），一次保存。
- **侧栏即时生效** — 保存后工作区行左侧图标即时更新；“默认图标 + 自定义颜色”只给原生文件夹染色（两态保留），带 `svgOpen` 的图标（如文件夹）会跟随行的展开/收起切换两态。
- **名称校验** — 与内置重命名一致：空名称禁用保存，同名冲突在本地提示；无重命名权限时名称只读，但外观仍可保存。
- **跨标签页同步** — 同一站点其他标签页通过 `storage` 事件即时更新。
- **本地化** — 内置中文与英文文案；跟随 DSH 当前语言。

## 安装

插件以 DSH bundle 的形式发布：包清单里的 `dsh.bundle.patch` 会插入 `dsh-workspace-style` 的 Host 条目，`dsh.client` 则声明浏览器入口。

本地开发时，在 DSH profile（例如 `~/.dsh/profiles/web`）中把它作为 bundle 启用：

1. 把包链接进 profile 依赖（`pnpm add link:/path/to/dsh-workspace-style` 或写入 `package.json` 后 `pnpm install`）。
2. 在 profile 的 `dsh.profile.bundles` 中加入 `dsh-workspace-style`。
3. 重新加载 DSH Web 页面；新插件通过客户端模块图加载，无需重启 Host 会话。

也可以直接使用 DSH 的插件管理界面安装/启用这个 bundle。

## 使用

1. 在侧栏找到任意工作区，悬停后点击右侧“⋯”。
2. 选择 **编辑**。
3. 修改名称、点选图标与颜色，点击 **保存**。

## 持久化与限制

- 外观保存在当前浏览器的 `localStorage`（键 `dsh-workspace-style:styles:v1`），按 Workspace id 存储，不写入 Host 数据库。存储值为 `{icon, color}`，任一字段为 `null` 表示该维度使用系统默认；两者都为默认时该条目会被删除（即“恢复默认”会真正清掉保存的样式）。
- 因此同一 Workspace 在**不同浏览器 / 不同 DSH Web 端口**之间不会同步；清除站点数据会丢失外观。
- 工作区行 DOM 由 `@deepseek-ai/dsh-client-ui-workspace` 渲染，本插件通过其稳定的 `data-row-key="workspace:<id>"` 属性附加装饰；DSH 若改变该属性，装饰会失效但不会影响原有功能。
- 内置“重命名”菜单项由 ui-workspace 注册，外部插件无法注销，因此本插件只在包含“编辑”项的菜单中按当前语言文案隐藏该项。
- 图标在侧栏通过 CSS mask 绘制；“跟随系统”颜色直接继承内置的灰/蓝选中逻辑，自定义颜色则为固定色值，深色/浅色主题均使用同一组色值。
- 内置文件夹图标的展开/收起两态由宿主原生维护；插件目录中的 `folder` 采用宿主同款几何并携带展开态（`svgOpen`），其余图形图标不伪造两态——行的展开状态仍由悬停箭头与子会话表达。

## 开发

```
package.json          插件清单（dsh.bundle + dsh.client）
cordis.patch.yml      bundle 的 Host 条目
index.js              Host 半侧（无状态）
client.js             浏览器半侧：菜单、对话框、持久化、侧栏装饰
locale/{zh,en}.json   插件市场展示文案
```

无构建步骤：`client.js` 直接以 `window.__ModuleLoader__.load({ id, factory })` 形式注册，和内置客户端插件使用同一套模块系统。

```sh
node --check client.js
node --test test/*.test.mjs
```

## License

MIT
