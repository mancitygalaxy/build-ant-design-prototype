import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const contract = JSON.parse(
  await readFile(resolve(process.cwd(), 'prototype.acceptance.json'), 'utf8'),
)
const errors = []
const routes = Array.isArray(contract.routes) ? contract.routes : []
const flows = Array.isArray(contract.businessFlows) ? contract.businessFlows : []
const routeIds = new Set()
const flowIds = new Set()
const browserContract = JSON.parse(
  await readFile(resolve(process.cwd(), 'prototype.browser.json'), 'utf8'),
)
const browserScenarioIds = new Set((browserContract.scenarios ?? []).map((scenario) => scenario.id))

if (contract.schemaVersion !== 1) errors.push('schemaVersion 必须为 1。')
if (routes.length === 0) errors.push('至少登记一个真实路由。')
if (flows.length === 0) errors.push('至少登记一个业务操作闭环。')

for (const route of routes) {
  if (!route.id || routeIds.has(route.id)) errors.push(`路由 ID 缺失或重复：${route.id ?? '<empty>'}`)
  routeIds.add(route.id)
  if (!route.path) errors.push(`路由 ${route.id} 缺少 path。`)
  if (!Array.isArray(route.states) || route.states.length === 0) errors.push(`路由 ${route.id} 缺少状态清单。`)
  if (!Array.isArray(route.checks) || route.checks.length === 0) errors.push(`路由 ${route.id} 缺少检查项。`)
}

for (const flow of flows) {
  if (!flow.id || flowIds.has(flow.id)) errors.push(`业务闭环 ID 缺失或重复：${flow.id ?? '<empty>'}`)
  flowIds.add(flow.id)
  if (!routeIds.has(flow.routeId)) errors.push(`业务闭环 ${flow.id} 引用了不存在的路由 ${flow.routeId}。`)
  if (!browserScenarioIds.has(flow.browserScenarioId)) errors.push(`业务闭环 ${flow.id} 没有关联可执行浏览器场景。`)
  if (!Array.isArray(flow.steps) || flow.steps.length < 3) errors.push(`业务闭环 ${flow.id} 至少需要 3 个步骤。`)
}

for (const scenarioId of browserScenarioIds) {
  if (![...flows].some((flow) => flow.browserScenarioId === scenarioId)) errors.push(`浏览器场景 ${scenarioId} 未被验收业务闭环引用。`)
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ACCEPTANCE_ERROR ${error}`)
  process.exit(1)
}

console.log(`ACCEPTANCE_CONTRACT_PASSED routes=${routes.length} flows=${flows.length}`)
