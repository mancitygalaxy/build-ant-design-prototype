# Ant Design 制作分支

仅在用户明确采用 Ant Design，或已有工程使用它时读取。组件库未确定的新项目先询问；已有 Fusion、Vue 或独立 HTML 等工程沿用原方案，不因本 Skill 转换技术。

## 工程选择

已有项目以实际依赖和锁文件为准。新建 Ant Design 工程且没有其他约束时，可以使用本包的 `assets/react-ant-prototype-starter/`：React、TypeScript、Vite、Ant Design 6、`@ant-design/icons`、pnpm 和 SCSS，保留类型与 `oxlint` 检查。

模板中的确切版本见 `package.json` 和锁文件。按项目指定版本安装，不顺带升级全局工具。使用模板前读 [代码组织与模板使用](quality-first-engineering.md)，替换示例并完成初始化；模板默认单 HTML，需要网页目录时按实际交付方式配置。

出现真实多页面、地址直达或刷新恢复需求时再接入路由。单 HTML 可以使用 `vite-plugin-singlefile`；网页交付保留完整资源目录。

## 组件与样式

标准能力优先使用已有 Ant Design 组件，按操作含义选择 `Tabs`、`Segmented`、`Radio.Group` 等。受控 `Radio.Group` 配卡片是选择配置的一种可选实现，不作为所有配置页面的默认样式。

调整 `Layout`、`Menu` 等组件时，依次核对组件属性、`ConfigProvider`、组件样式变量（token）、局部 CSS 和浏览器计算后的样式。变量尽量只作用于目标组件，避免菜单修改影响账号下拉等区域。

默认不新增 `!important` 或大范围覆盖 `.ant-*`；优先使用组件接口、token 或有明确容器边界的局部样式，必要覆盖说明原因。使用模板时继续遵守其结构与样式检查。

菜单展开、收起或选中闪烁时，检查受控状态、隐藏样式、离场旧节点及具体过渡属性。修复不应显示的状态，保留正常动画，不关闭整组 `motion` 来掩盖问题。

表格、表单和菜单的具体状态检查见 [组件制作与页面检查](component-checks.md)。自定义下拉按实际点击与按键验收，不把原生 `selectOption` 套到所有组件。
