// ============================================================
// SandboxDriver conformance suite (provider-agnostic)
// ============================================================
// One shared contract every driver (stub, cloudflare, blaxel, …) MUST satisfy.
// A driver's own test file calls `runSandboxDriverConformance(() => new XDriver())`
// so we verify behaviour against the SAME expectations regardless of provider.
// This codifies the SandboxDriver contract and de-risks new providers (e.g. the
// upcoming Blaxel driver) before they touch product code.
//
// Pure contract checks only — no provider SDK imported here. Drivers that need
// live credentials should gate their own conformance call behind an env check.
// ============================================================

import { describe, it, expect } from 'vitest'
import type { SandboxDriver } from './types'

export function runSandboxDriverConformance(
  makeDriver: () => SandboxDriver,
  label?: string,
  // Real providers spin up VMs (cold start) + dev servers — far slower than the
  // in-memory stub. A generous per-test timeout keeps the stub fast and lets live
  // providers finish.
  timeout = 60_000,
) {
  describe(`SandboxDriver conformance${label ? ` — ${label}` : ''}`, () => {
    const PID = 'proj_conformance'
    // A command that actually opens the port, so providers that wait for the port
    // to come up (e.g. Blaxel waitForPorts) return promptly. The stub ignores it.
    const DEV_CMD = `node -e "require('http').createServer((_,r)=>r.end('ok')).listen(3000)"`
    // Apply the per-test timeout uniformly.
    const t = (name: string, fn: () => any) => it(name, fn, timeout)

    t('exposes a provider name', () => {
      expect(typeof makeDriver().provider).toBe('string')
    })

    t('create() returns a handle bound to the project', async () => {
      const h = await makeDriver().create({ projectId: PID })
      expect(h.id).toBeTruthy()
      expect(h.projectId).toBe(PID)
      expect(await h.status()).toBe('running')
    })

    t('seeds initial files and reads them back', async () => {
      const h = await makeDriver().create({
        projectId: PID,
        files: [{ path: 'index.html', content: '<h1>hi</h1>' }],
      })
      expect(await h.readFile('index.html')).toBe('<h1>hi</h1>')
      expect(await h.listFiles()).toContain('index.html')
    })

    t('writeFiles then readFile round-trips', async () => {
      const h = await makeDriver().create({ projectId: PID })
      await h.writeFiles([{ path: 'app/page.tsx', content: 'export default 1' }])
      expect(await h.readFile('app/page.tsx')).toBe('export default 1')
    })

    t('writeFilesBase64 decodes to utf-8', async () => {
      const h = await makeDriver().create({ projectId: PID })
      const b64 = Buffer.from('héllo', 'utf-8').toString('base64')
      await h.writeFilesBase64([{ path: 'a.txt', content: b64 }])
      expect(await h.readFile('a.txt')).toBe('héllo')
    })

    t('deleteFile removes the file', async () => {
      const h = await makeDriver().create({
        projectId: PID,
        files: [{ path: 'gone.txt', content: 'x' }],
      })
      await h.deleteFile('gone.txt')
      expect(await h.listFiles()).not.toContain('gone.txt')
    })

    t('exec resolves with an exit code and stdout', async () => {
      const h = await makeDriver().create({ projectId: PID })
      const r = await h.exec('echo hi')
      expect(typeof r.exitCode).toBe('number')
      expect(typeof r.stdout).toBe('string')
    })

    t('startDevServer + getPreviewUrl return an http(s) URL', async () => {
      const h = await makeDriver().create({ projectId: PID })
      const dev = await h.startDevServer(DEV_CMD, 3000)
      expect(dev.port).toBe(3000)
      expect(dev.previewUrl).toMatch(/^https?:\/\//)
      expect(await h.getPreviewUrl(3000)).toMatch(/^https?:\/\//)
      await dev.stop()
    })

    t('snapshot captures the file tree for the project', async () => {
      const h = await makeDriver().create({
        projectId: PID,
        files: [{ path: 'index.html', content: '<h1>snap</h1>' }],
      })
      const snap = await h.snapshot()
      expect(snap.projectId).toBe(PID)
      expect(snap.files.find(f => f.path === 'index.html')?.content).toBe('<h1>snap</h1>')
    })

    t('resume() rehydrates a snapshot into a new running handle', async () => {
      const driver = makeDriver()
      const h1 = await driver.create({
        projectId: PID,
        files: [{ path: 'keep.txt', content: 'persisted' }],
      })
      const snap = await h1.snapshot()
      const h2 = await driver.resume(snap)
      expect(h2.projectId).toBe(PID)
      expect(await h2.readFile('keep.txt')).toBe('persisted')
    })

    t('suspend() moves the sandbox out of running (cost control)', async () => {
      const h = await makeDriver().create({ projectId: PID })
      await h.suspend()
      expect(await h.status()).toBe('suspended')
    })

    t('destroy() marks the sandbox destroyed', async () => {
      const h = await makeDriver().create({ projectId: PID })
      await h.destroy()
      expect(await h.status()).toBe('destroyed')
    })
  })
}
