# Build Ant Design Prototype

一套面向 Codex 的 Ant Design 交互原型 Skill。它覆盖从零创建和基于现有原型迭代两类任务，强调效果优先、风险驱动的子代理协作、证据复用、真实浏览器验收和可交付产物。

## 适合场景

- 从零创建 Ant Design 交互原型。
- 把已有 HTML 原型迁移到 React、TypeScript 和 Ant Design。
- 在保留业务状态与交互契约的前提下继续迭代原型。
- 生成可维护的源码工程和便于评审的单 HTML。
- 对复杂原型执行源码、工程、视觉、交互和发布后回读验收。

## 核心特点

- **效果优先**：保留必要的源码检查、浏览器验证、独立复核和最终完整回归。
- **减少无效重复**：只有验证对象、版本、风险、方法和测试状态都相同时，才复用已有证据。
- **合理使用子代理**：按独立风险分工，不以减少代理数量作为目标；共享文件始终保持单一写入所有者。
- **先定义状态契约**：在实现界面前明确状态隔离、连续输入、冻结与实时读取、一次性动作和恢复边界。
- **真实浏览器验收**：本地页面通过仅绑定 `127.0.0.1` 的 HTTP 服务打开，不把源码检查当成视觉和交互通过。

## 仓库内容

```text
skill/build-ant-design-prototype/
  SKILL.md
  agents/openai.yaml
  references/evidence-first-orchestration.md
```

- `SKILL.md`：核心工作流、实施门禁和验收规则。
- `agents/openai.yaml`：Codex 中的展示名称、简介和默认提示。
- `references/evidence-first-orchestration.md`：复杂任务中的子代理分工、证据复用和最终回归细则。

## 安装

把完整 Skill 目录复制到本机 Codex 技能目录：

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skill/build-ant-design-prototype "${CODEX_HOME:-$HOME/.codex}/skills/"
```

以上命令适合首次安装。更新已有版本前，先备份或移走旧目录，避免已经从新版删除的文件残留。

安装后可以这样使用：

```text
使用 $build-ant-design-prototype 创建一个 Ant Design 6 交互原型，交付 React 源码和可评审的单 HTML。
```

也可以基于已有原型继续迭代：

```text
使用 $build-ant-design-prototype 读取现有 HTML 和浏览器效果，复制出新版本后完成本轮修改与验收。
```

## 使用边界

- 这是一套社区 Skill，不是 Ant Design 官方项目，也未获得其官方背书。
- 仓库中的状态与数据契约已经泛化，不包含可识别的公司、产品、客户、测试数据、品牌素材和项目路径。
- 使用 Logo、字体、图片、模板或其他第三方资产前，应确认相应的使用、修改和再分发权限。
- Skill 提供的是原型工作流与验收方法，不能替代具体项目的事实材料、技术约束和业务决策。

## 许可证

MIT
