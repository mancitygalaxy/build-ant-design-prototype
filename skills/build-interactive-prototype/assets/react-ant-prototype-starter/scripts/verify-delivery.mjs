import { verifyBuild } from './build-assets.mjs'
try {
  const { project, files, source } = await verifyBuild()
  console.log('DELIVERY_VERIFIED mode=' + project.delivery.mode + ' files=' + Object.keys(files).length + ' source=' + source.sha256)
} catch (error) {
  console.error('DELIVERY_ERROR ' + error.message)
  process.exitCode = 1
}

