# CLAUDE.md

> Claude Code 项目指南 for ClawX

## 项目概述

**ClawX** 是基于 OpenClaw 的桌面 AI 助手应用，提供图形化界面来管理 AI Agent、模型提供商、频道和定时任务。

- **技术栈**: Electron + React 19 + Vite + TypeScript
- **包管理器**: pnpm (版本固定在 package.json 中)
- **平台支持**: macOS | Windows | Linux

## 快速开始

```bash
# 初始化项目（安装依赖 + 下载 uv）
pnpm run init

# 开发模式（Vite + Electron）
pnpm dev

# 代码检查
pnpm run lint
pnpm run typecheck

# 测试
pnpm test
```

## 项目结构

```
ClawX/
├── src/                    # 渲染进程代码 (React)
│   ├── components/         # UI 组件
│   ├── pages/             # 页面组件
│   ├── stores/            # Zustand 状态管理
│   ├── lib/               # 工具函数和 API 客户端
│   ├── assets/            # 静态资源
│   └── i18n/              # 国际化配置
├── electron/              # 主进程代码 (Node.js)
│   ├── main/              # 主进程入口
│   ├── api/               # API 路由
│   ├── services/          # 服务层
│   └── utils/             # 工具函数
├── build/                 # 构建输出（OpenClaw 捆绑包）
├── dist/                  # Vite 构建输出
├── dist-electron/         # Electron 构建输出
├── release/               # 打包输出（安装包）
├── resources/             # 应用资源
│   └── skills/            # 预装技能清单
└── scripts/               # 构建脚本
```

## 架构说明

### 进程架构

```
┌─────────────────────────────────────────────────────────────┐
│                      渲染进程 (Renderer)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │   Chat   │  │  Models  │  │ Channels │  │   Settings   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
│       │             │             │                │         │
│       └─────────────┴─────────────┴────────────────┘         │
│                         │                                    │
│              ┌──────────▼──────────┐                        │
│              │    host-api.ts      │  ← 统一的 API 入口      │
│              │  (IPC 通信封装)      │                        │
│              └──────────┬──────────┘                        │
└─────────────────────────┼───────────────────────────────────┘
                          │ IPC
┌─────────────────────────┼───────────────────────────────────┐
│                      主进程 (Main)                           │
│  ┌──────────────────────▼──────────────────────┐           │
│  │           hostApiFetch (API 路由)            │           │
│  └──────────────────────┬──────────────────────┘           │
│                         │                                   │
│         ┌───────────────┼───────────────┐                  │
│         ▼               ▼               ▼                  │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────┐          │
│  │  Provider   │  │  Gateway │  │    Store     │          │
│  │   Service   │  │  Manager │  │ (electron-   │          │
│  └─────────────┘  └──────────┘  │   store)     │          │
│                                 └──────────────┘          │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              OpenClaw Gateway (端口 18789)              │ │
│  │         ┌──────────┐  ┌──────────┐  ┌──────────┐     │ │
│  │         │  Agents  │  │ Channels │  │  Skills  │     │ │
│  │         └──────────┘  └──────────┘  └──────────┘     │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 关键设计原则

1. **Renderer/Main 边界**:
   - 渲染进程必须通过 `host-api.ts` 和 `api-client.ts` 调用后端
   - 禁止直接使用 `window.electron.ipcRenderer.invoke()`
   - 禁止直接从渲染进程调用 Gateway HTTP 端点

2. **状态管理**:
   - 使用 Zustand 进行状态管理
   - 主要 Store: `useChatStore`, `useProviderStore`, `useGatewayStore`, `useSettingsStore`

3. **多语言支持**:
   - 使用 i18next 进行国际化
   - 翻译文件位于 `src/i18n/locales/`
   - 新增功能时需要同时更新所有语言文件

## 常见开发任务

### 添加新的模型提供商

1. **更新类型定义** (`electron/shared/providers/types.ts`):
   ```typescript
   export const PROVIDER_TYPES = ['newprovider', ...] as const;
   export const BUILTIN_PROVIDER_TYPES = ['newprovider', ...] as const;
   ```

2. **添加后端配置** (`electron/shared/providers/registry.ts`):
   ```typescript
   {
     id: 'newprovider',
     name: '提供商名称',
     icon: '🔧',
     placeholder: 'sk-...',
     requiresApiKey: true,
     category: 'compatible',
     envVar: 'NEWPROVIDER_API_KEY',
     supportedAuthModes: ['api_key'],
     defaultAuthMode: 'api_key',
     supportsMultipleAccounts: true,
     providerConfig: {
       baseUrl: 'https://api.example.com/v1',
       api: 'openai-completions',
       apiKeyEnv: 'NEWPROVIDER_API_KEY',
     },
   }
   ```

3. **添加前端配置** (`src/lib/providers.ts`):
   ```typescript
   { id: 'newprovider', name: '提供商名称', icon: '🔧', placeholder: 'sk-...', ... }
   ```

4. **添加图标** (`src/assets/providers/index.ts`):
   ```typescript
   import newprovider from './newprovider.svg';
   export const providerIcons = { newprovider, ... };
   ```

### 修改 UI 组件

- 使用 shadcn/ui 组件库
- 样式使用 Tailwind CSS
- 暗黑模式通过 `dark:` 前缀实现
- 响应式设计使用 Tailwind 的断点类

### 添加新页面

1. 在 `src/pages/` 创建页面组件
2. 在 `src/App.tsx` 添加路由
3. 在 `src/components/layout/Sidebar.tsx` 添加导航项
4. 在 `src/i18n/locales/` 添加翻译键

## 构建与发布

```bash
# 开发构建
pnpm run build:vite

# 完整打包（当前平台）
pnpm run package

# 平台特定打包
pnpm run package:win    # Windows
pnpm run package:mac    # macOS
pnpm run package:linux  # Linux

# 发布（带自动更新）
pnpm run release
```

## 调试技巧

### Gateway 调试

- Gateway 在 `pnpm dev` 时自动启动，端口 18789
- 启动时间约 10-30 秒
- 可通过 Settings > Advanced > Developer > OpenClaw Dev Console 访问

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| ESLint 报错 `ENOENT: temp_uv_extract` | 重新运行 `pnpm run lint` |
| Gateway 连接失败 | 检查端口 18789 是否被占用 |
| 构建脚本警告 | 关于 `@discordjs/opus` 和 `koffi` 的警告可忽略 |
| Windows 文件名冒号错误 | 已在 `bundle-preinstalled-skills.mjs` 中配置 `core.protectNTFS false` |

## 代码规范

- **TypeScript**: 严格模式开启
- **ESLint**: 使用 `pnpm run lint` 自动修复
- **组件**: 使用函数组件 + Hooks
- **样式**: Tailwind CSS，避免内联样式
- **国际化**: 所有用户可见文本使用 `t('key')` 翻译

## 文档同步规则

任何功能或架构变更后，检查并更新以下文档：
- `README.md`
- `README.zh-CN.md`
- `README.ja-JP.md`
- `AGENTS.md` (如影响开发流程)
- `CLAUDE.md` (如影响架构或常见任务)

---

*最后更新: 2025-03-14*
