# 交互原型 Skill 工具包

四个配合使用的 Codex Skill，分别负责制作与修改原型、交互体验评审、原型与研发实现对版、飞书与企微反馈处理。本版同步 2026-10-23 核对的本机版本，补齐共创、首次加载、反馈回写与视觉参考方法，保留各 Skill 的完整资料、模板和脚本。

仓库沿用 `build-ant-design-prototype` 名称；当前制作入口已改为 `build-interactive-prototype`，可沿用 HTML、React、Vue、Ant Design、Fusion 等项目方案。

## 按任务选择 Skill

| 想完成什么 | Skill | 主要范围 |
| --- | --- | --- |
| 制作、修改、复用原型，或保持行为不变地整理代码 | [制作与修改交互原型](skills/build-interactive-prototype/SKILL.md) | `build-interactive-prototype`；沿用已有工程，新建且未指定组件库时先确认是否采用 Ant Design |
| 检查一个原型或产品的视觉与交互 | [交互体验评审](skills/audit-ai-interaction-design/SKILL.md) | `audit-ai-interaction-design`；只读评审视觉呈现、任务连续性、操作反馈和相关状态 |
| 对照已确认原型、设计稿或要求检查研发实现 | [原型与研发实现差异走查](skills/audit-prototype-implementation-diffs/SKILL.md) | `audit-prototype-implementation-diffs`；记录当前与目标的成对证据及验收要求 |
| 读取飞书或企微反馈、按反馈修改或回写处理状态 | [处理飞书与企微原型反馈](skills/iterate-prototype-from-feishu-feedback/SKILL.md) | `iterate-prototype-from-feishu-feedback`；保留原调用名，按已授权范围读写，原型实现与验收配合制作 Skill |

评审和对版默认在对话中给出结论，是否生成报告及报告形式按当次需求确定。四个 Skill 沿用同一问题清单、来源定位和条目编号，共用仍覆盖当前版本与状态的检查结果。对版规格冲突保留待确认；一条反馈含多个要求时，全部验收点通过后才标整条完成。

## 视觉方法与参考资料

[视觉参考与效果检查](skills/build-interactive-prototype/references/visual-design.md)只在视觉任务中按需读取：区分用户要求、原作观察和方案选择，保留局部认可范围，通过实际中文页面与参考并排检查。具体配色不作为通用要求；静态图、功能检查与真实动效分别验收。

[随包参考库](skills/build-interactive-prototype/references/design-library/README.md)包含 15 组 RonDesignLab 作品笔记、复用指南，以及 Neka、Stripe、Radix、Carbon 的来源与试验经验。参考资料位于制作 Skill 包内，完整安装后相对链接仍有效。原作图片、视频、本机原型及运行记录不随包分发；按原作链接或项目已有资料实际看图。

本次变更与三场景验证的范围见 [更新说明](docs/2026-10-23更新与验证.md)。

## 目录与完整性

```text
skills/
  build-interactive-prototype/
  audit-ai-interaction-design/
  audit-prototype-implementation-diffs/
  iterate-prototype-from-feishu-feedback/
manifest.json
skill/                         历史发布目录
```

安装时保留 `skills/` 下四个目录的原名和同级关系，以便相互引用。复制完整目录，包含隐藏文件；只复制 `SKILL.md` 会遗漏必要资料和工具。

[文件清单](manifest.json) 记录 91 份 Skill 文件的相对路径、字节数与 SHA-256，可用于逐文件核对下载或安装结果。

## Windows 安装或更新

先比较目标设备已有版本及个人修改。确认采用后，在尚无同名仓库目录的位置用 PowerShell 7 执行以下示例。它会将已有同名 Skill 和两个旧制作入口移到技能目录之外的恢复目录，再安装四个新版；已有备份会保留。

```powershell
$ErrorActionPreference = 'Stop'
$repoPath = Join-Path (Get-Location).Path 'build-ant-design-prototype'
git clone --config core.autocrlf=false 'https://github.com/mancitygalaxy/build-ant-design-prototype.git' $repoPath
if ($LASTEXITCODE -ne 0) { throw '仓库下载失败，尚未修改已安装技能。' }

$codexPath = if ($env:CODEX_HOME) { $env:CODEX_HOME } else {
    Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex'
}
$targetPath = Join-Path $codexPath 'skills'
$backupPath = Join-Path $codexPath ('skill-backups/prototype-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$skillNames = @(
    'build-interactive-prototype',
    'audit-ai-interaction-design',
    'audit-prototype-implementation-diffs',
    'iterate-prototype-from-feishu-feedback'
)
foreach ($name in $skillNames) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoPath "skills/$name/SKILL.md"))) {
        throw "发布包缺少 $name，尚未修改已安装技能。"
    }
}
New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
New-Item -ItemType Directory -Path $backupPath | Out-Null
foreach ($name in ($skillNames + @('build-ant-design-prototype', 'iterate-existing-product'))) {
    $installedPath = Join-Path $targetPath $name
    if (Test-Path -LiteralPath $installedPath) {
        Move-Item -LiteralPath $installedPath -Destination (Join-Path $backupPath $name)
    }
}
foreach ($name in $skillNames) {
    Copy-Item -LiteralPath (Join-Path $repoPath "skills/$name") -Destination $targetPath -Recurse -Force
}
Write-Output "已安装四个 Skill；原版本恢复目录：$backupPath"
```

在其他系统上，将四个完整目录按原名复制到当前 Codex 环境的技能目录；已有版本先比较并移到活动目录之外保留。安装后核对文件清单，并在目标环境确认四个名称可发现。

旧 `build-ant-design-prototype` 与 `iterate-existing-product` 的制作、复用能力已合并到 `build-interactive-prototype`。仓库 [历史目录](skill/README.md) 用于回查旧发布；本次安装采用 `skills/` 下的四个目录。

## 使用示例

```text
使用 $build-interactive-prototype 继续修改现有原型，沿用当前技术方案，完成需求中的页面和关键操作验收。

使用 $audit-ai-interaction-design 只读检查这个原型的主要用户任务，在对话中列出有证据的问题和改进建议。

使用 $audit-prototype-implementation-diffs 对照已确认设计稿与当前研发页面，检查指定模块的差异。

使用 $iterate-prototype-from-feishu-feedback 读取指定飞书或企微表中的本轮反馈，修改原型，并回写已验证条目的处理状态。
```

## 运行条件与范围

- 日常制作和评审沿用真实项目的依赖与工具。使用附带 React / Ant Design 模板时，按模板中的 `package.json` 和锁文件准备环境；当前模板要求 Node.js `>=22 <25`、`pnpm@11.17.0`。模板需要按具体项目初始化，详见 [模板使用说明](skills/build-interactive-prototype/references/quality-first-engineering.md)。
- 飞书流程需要对应 `lark-*` 能力；企微流程需要 `wecom-unified`、`wecom-cli` 和目标表权限。本仓库提供反馈流程，不包含这些外部工具、账号凭据或登录态。
- 本地页面通过仅绑定 `127.0.0.1` 的 HTTP 服务检查。真实系统的保存、发送、运行及自动保存按当前授权处理；缺少必要来源或权限时，暂停依赖它的步骤。
- 模板中的演示内容、报告占位和示例配置需要按实际任务替换。Skill 的方法不能替代项目事实、业务决策或真实接口验收。
- 这是一套社区 Skill。使用第三方依赖、品牌或素材时遵守各自许可。

## 许可证

MIT，见 [LICENSE](LICENSE)。
