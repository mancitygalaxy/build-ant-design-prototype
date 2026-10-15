# 性能配置与执行

需要验证加载、取数、列表、筛选、状态或数据规模时读取。共同判定规则见[原型技术质量与性能](prototype-quality.md)。本执行器适用于模板的本地生产构建；真实接口、鉴权或后端缓存由项目现有测量入口承担，不能把静态样本结果推断为线上性能。

## 登记场景

复制模板后替换 `prototype.performance.json` 的示例、真实数据文件和目标。示例数字用于展示格式，不是统一体验标准。每个关键路径至少选当前规模与较大规模中相关的组合，首次交付覆盖首次打开、重复访问和主要操作。

| 字段 | 含义 |
|---|---|
| `environmentId` | 当前测量环境的名称；可用 `PROTOTYPE_PERFORMANCE_ENVIRONMENT` 指定 CI 等另一环境，基线分目录保存 |
| `measurement` | 默认 5 次、20% 且增加至少 100 毫秒；超出后独立再测 5 次。可提前调整并记录原因 |
| `kind`、`route` | `navigation` 从导航开始；`interaction` 从第一项用户操作开始 |
| `fixture.label/size/files` | 样本标签、实际条数和项目内原始输入文件；执行器保存文件内容哈希 |
| `cache.browser` | `first-visit` 用全新浏览器上下文；`repeat-visit` 在同一上下文先预访问再测。每个样本重新建上下文 |
| `cache.server` | 模板只支持 `unknown` 或 `not-applicable-static`；没有后端重置证据不能登记服务端首次读取 |
| `setupReady/setup` | 交互或重复访问的预备状态；在计时前完成。首次导航不得使用预备操作 |
| `actions` | 交互步骤：`click`、`fill`、`selectOption`、`reload`、`waitFor`、`assertText` |
| `ready` | 主要数据与操作可用的结果断言；支持 `selector` 搭配 `equals`、`count`、`enabled`，多项同时满足 |
| `budget` | `durationMs`、`requestCount`、`transferBytes`、`resourceBytes` 四项项目预算，必须提前填写 |
| `existingDebt` | 可选的历史超预算项；每项包含 `ceiling`、`reason`、`evidence`，开工前登记且不增长 |

完成条件要证明结果属于本次输入，例如搜索词、结果条数或本次结果标识已经更新，主要按钮可用。仅等待页面框架、`networkidle` 或一个始终存在的元素不能证明业务完成。需要失败恢复、保存正确性与视觉证据时仍运行浏览器业务操作检查。

测量使用生产构建和固定 Chromium，报告包含浏览器、机器、Node 主版本、执行器指纹、源码指纹、样本哈希及缓存声明。耗时从操作开始到结果断言满足，包含自动化动作的调度开销；前后执行器相同才可比。

请求统计从测量起点覆盖到完成条件后的 `observationMs` 窗口，并等待已开始的请求结束。按产品的异步行为登记窗口，持续轮询或流式任务需使用项目专用入口。传输量为 Chromium 记录的实际编码响应字节（含响应头），构建资源体积为完整 `dist/` 未压缩字节；两者分别记录，不能互换。请求数和字节预算检查每轮最差样本，避免一次重复请求被中位数掩盖。

## 首次记录与日常检查

先完成产品初始化、业务规则和浏览器场景，并确保外层与嵌套命令使用 `packageManager` 指定的 pnpm 版本。初次制作执行：

```sh
pnpm run build
pnpm run baseline:browser
pnpm run baseline:performance
pnpm run deliver
```

`baseline:browser` 前先按需求检查页面；首次验证对比机制时，用首份参考完成制造测试错误、恢复和无差异检查，再采用为交付基线。已有基线的普通修改跳过两个记录命令。浏览器环境、像素比较和旧结果格式的采用见[浏览器检查](browser-checks.md)。

`baseline:performance` 只记录，状态为 `baseline-recorded`，同时给出目标评估；即使已成功写文件也不能宣称达标。`deliver` 内部执行 `verify:release`，其中已包含 `check:performance`，再给出 `passed`、`passed-with-existing-debt` 或 `failed`。默认只运行一次完整交付入口；只验收、不复制时选择 `verify:release`，不要将两个完整入口连续执行。单独的 `check:performance` 用于开发中的定向诊断或复验。

普通检查只读基线。基线存在时，记录命令默认拒绝覆盖。只有已确认的场景或环境变更才可显式使用：

```sh
pnpm run baseline:performance --replace-baseline --reason="已确认的变化与证据位置"
```

执行器会保留旧记录；技术优化不能使用这个命令更新基线。前后数据、规模、预算、完成条件、浏览器、机器或执行器不一致时返回受阻，先恢复可比条件。新场景在开工时单独登记并建立首份记录，不能利用新增场景顺带放宽旧场景预算。

只检查受影响场景时：

```sh
pnpm run check:performance --scenarios=first-load,search-current
```

证据必须对应最终候选和实际范围。完整交付入口 `verify:release` 默认检查全部登记场景；普通局部编辑可沿用有效证据并运行定向检查，无需调用完整交付流程。

## 结果与 CI

- 报告：`test-results/performance/report.json`。
- 基线：`test-baselines/performance/<environmentId>.json`，纳入版本管理；不要提交含敏感数据的原始结果。
- 退出码：0 为通过或显式记录完成，1 为测得退步或超预算，2 为受阻或缺基线。结合报告状态解读，不能只看退出码。
- 每个场景保留原始样本、汇总、预算失败和历史问题；触发耗时复测时保存第二轮全部样本。
- CI 复用 `verify:release`。首次在 Runner 使用时先建立该环境的基线并复核目标，不能拿 Mac 基线与 Linux 比较，也不能在 CI 失败后自动生成新基线。
- 截图回归与性能报告属于不同证据，前者通过不能代替后者；无法运行必要测量时不能删掉检查交付。

## 交付模式

`prototype.project.json` 缺省继续使用单 HTML；旧配置保持有效：

```json
{"schemaVersion":1,"initialized":true,"projectId":"student-console","deliveryFile":"preview.html"}
```

网页模式允许 Vite 拆分脚本和样式：

```json
{"schemaVersion":1,"initialized":true,"projectId":"student-console","deliveryMode":"web","deliveryDirectory":"student-console"}
```

`pnpm run preview` 为生产产物启动仅绑定 `127.0.0.1` 的 HTTP 服务。网页模式验证全部资源清单和入口引用；最终复制至 `delivery/<deliveryDirectory>/` 并逐文件回读。单 HTML 复制至 `delivery/<deliveryFile>`。已有交付被替换时，保留在同目录的 `.previous-*`，恢复前先核对对应 `manifest.json`，避免覆盖后续成果。

实现依据：[Playwright 请求生命周期与大小](https://playwright.dev/docs/api/class-request)、[Chromium DevTools Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/)。记录口径以本执行器的实际代码和测试为准。
