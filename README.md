# 交互原型 Skill 工具包

四个配合使用的 Codex Skill，分别负责制作与修改原型、交互体验评审、原型与研发实现对版、飞书反馈处理。当前发布来自 2026-10-15 核对的本机已安装版本，完整保留各 Skill 的说明、界面配置、参考资料、模板和脚本。

仓库沿用 `build-ant-design-prototype` 名称；当前制作入口已改为 `build-interactive-prototype`，可沿用 HTML、React、Vue、Ant Design、Fusion 等项目方案。

## 按任务选择 Skill

| 想完成什么 | Skill | 主要范围 |
| --- | --- | --- |
| 制作、修改、复用原型，或保持行为不变地整理代码 | [制作与修改交互原型](skills/build-interactive-prototype/SKILL.md) | `build-interactive-prototype`；沿用已有工程，新建且未指定组件库时先确认是否采用 Ant Design |
| 检查一个原型或产品是否好用 | [交互体验评审](skills/audit-ai-interaction-design/SKILL.md) | `audit-ai-interaction-design`；只读评审任务连续性、操作反馈和相关状态 |
| 对照已确认原型、设计稿或要求检查研发实现 | [原型与研发实现差异走查](skills/audit-prototype-implementation-diffs/SKILL.md) | `audit-prototype-implementation-diffs`；记录当前与目标的成对证据及验收要求 |
| 读取飞书反馈、按反馈修改或回写处理状态 | [处理飞书原型反馈](skills/iterate-prototype-from-feishu-feedback/SKILL.md) | `iterate-prototype-from-feishu-feedback`；按已授权范围读写，原型实现与验收配合制作 Skill |

评审和对版默认在对话中给出结论，是否生成报告及报告形式按当次需求确定。四个 Skill 共用仍覆盖当前版本与状态的检查结果。

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

[文件清单](manifest.json) 记录 70 份 Skill 源码文件的相对路径、字节数与 SHA-256，可用于逐文件核对下载或安装结果。发布包保留原始文件字节。

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

使用 $iterate-prototype-from-feishu-feedback 读取指定飞书表中的本轮反馈，修改原型，并回写已验证条目的处理状态。
```

## 运行条件与范围

- 日常制作和评审沿用真实项目的依赖与工具。使用附带 React / Ant Design 模板时，按模板中的 `package.json` 和锁文件准备环境；当前模板要求 Node.js `>=22 <25`、`pnpm@11.17.0`。模板需要按具体项目初始化，详见 [模板使用说明](skills/build-interactive-prototype/references/quality-first-engineering.md)。
- 飞书流程需要目标环境具备对应 `lark-*` 能力及资源权限；本仓库提供流程说明，不包含账号凭据、登录态或飞书运行工具。
- 本地页面通过仅绑定 `127.0.0.1` 的 HTTP 服务检查。真实系统的保存、发送、运行及自动保存按当前授权处理；缺少必要来源或权限时，暂停依赖它的步骤。
- 模板中的演示内容、报告占位和示例配置需要按实际任务替换。Skill 的方法不能替代项目事实、业务决策或真实接口验收。
- 这是一套社区 Skill。使用第三方依赖、品牌或素材时遵守各自许可。

## 许可证

MIT，见 [LICENSE](LICENSE)。
