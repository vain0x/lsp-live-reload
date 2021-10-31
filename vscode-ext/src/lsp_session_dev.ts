// LSP session for development environment.
// Live reload is enabled. Whenever LSP server binary is updated, session restarts.

import fs, { FSWatcher } from "fs"
import fsP from "fs/promises"
import { ExtensionContext } from "vscode"
import { LanguageClient, State } from "vscode-languageclient/node"
import { debounce } from "lodash"

const DEBOUNCE_TIME = 700
const RETRY_TIME = 60 * 1000
const RETRY_INTERVAL = 100

export const startLspSessionDev = (options: {
  /** Executable file to be watched. */
  exeFile: string
  context: ExtensionContext
  newLanguageClient: (lspServerCommand: string) => LanguageClient
}): void => {
  const { exeFile, context, newLanguageClient } = options

  // Watcher:
  let watcher: FSWatcher | undefined
  context.subscriptions.push({ dispose: () => watcher?.close() })

  const ensureWatch = () => {
    watcher?.close()
    watcher = fs.watch(exeFile)
    watcher.once("change", requestReload)
    watcher.on("error", err => console.error("watcher error", err))
  }



  // Backup:
  const backupFile = exeFile.replace(/\.exe$/, "") + "_backup.exe"

  // Copy executable file to not lock it while running server.
  // Note that writing to running executable is rejected as ETXTBSY.
  const backupExe = async () => performAsyncWithRetry(async () => {
    await fsP.copyFile(exeFile, backupFile)
  }, {
    count: RETRY_TIME / RETRY_INTERVAL,
    intervalMs: RETRY_INTERVAL,
  })
  context.subscriptions.push({
    dispose: () => { fsP.unlink(backupFile).catch(() => undefined) }
  })



  // LanguageClient:
  const client = newLanguageClient(backupFile)
  context.subscriptions.push({ dispose: () => { client.stop() } })

  context.subscriptions.push(
    client.onDidChangeState(e => {
      console.log("client:", stateDisplay(e.oldState), "->", stateDisplay(e.newState))
    }))

  const reload = async (): Promise<void> => {
    try {
      console.log("reload: begin.")

      if (client.needsStop()) {
        console.log("reload: stopping client.")
        await client.stop()

        // https://github.com/microsoft/vscode-languageserver-node/blob/cec94077ddb30bf1f4c5542b51c30494368c7cdc/client/src/node/main.ts#L228
        await delay(2000 + 200) // Wait until the process is actually terminated.
      }

      console.log("reload: backup.")
      await backupExe()
      ensureWatch()

      console.log("reload: starting client.")
      client.start()

      console.log("reload: end.")
    } catch (err) {
      console.error("reload error", err)
    }
  }

  const requestReload = debounce(async () => {
    await reload()
  }, DEBOUNCE_TIME)

  // Start.
  requestReload()
}

// ===============================================
// Utilities

/** Waits for several time. */
const delay = (timeMs: number) =>
  new Promise<void>(resolve => { setTimeout(resolve, timeMs) })

/**
 * Calls an async function.
 *
 * Whenever function throws an exception, delay for interval time and retry.
 * Initial exception is written to console.
 * When function is called `count` times and it throws every time, final exception is thrown.
 */
const performAsyncWithRetry = async <A>(
  action: () => Promise<A>,
  options: { count: number, intervalMs: number },
): Promise<A> => {
  const { count, intervalMs } = options
  if (count <= 0) throw new Error() // Illegal use.

  for (let i = 0; i < count - 1; i++) {
    try {
      return await action()
    } catch (err) {
      if (i === 0) {
        console.warn("warn: Error occurred.", err, "Retrying.")
      }
    }
    await delay(intervalMs)
  }

  return await action()
}

const stateDisplay = (state: State): string =>
  ({
    1: "Stopped",
    2: "Running",
    3: "Starting",
  })[state] ?? "Unknown"
