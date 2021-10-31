// LSP session for development environment.
// Live reload is enabled. Whenever LSP server binary is updated, session restarts.

import fs, { FSWatcher } from "fs"
import fsP from "fs/promises"
import path from "path"
import { ExtensionContext } from "vscode"
import { LanguageClient, State } from "vscode-languageclient/node"
import { debounce } from "lodash"

const DEBOUNCE_TIME = 700
const RETRY_TIME = 60 * 1000
const RETRY_INTERVAL = 100

export const startLspSessionDev = (options: {
  /** Directory where executable and related files are written. */
  outputDir: string

  /** Another directory where contents are copied from outputDir. */
  backupDir: string

  context: ExtensionContext
  newLanguageClient: () => LanguageClient
}): void => {
  const { outputDir, backupDir, context, newLanguageClient } = options

  // Watcher:
  let watcher: FSWatcher | undefined
  context.subscriptions.push({ dispose: () => watcher?.close() })

  const ensureWatch = () => {
    watcher?.close()
    watcher = fs.watch(outputDir)
    watcher.once("change", requestReload)
    watcher.on("error", err => console.error("watcher error", err))
  }



  // Backup:
  // Copy files to not lock or mutate while running server.
  // Note that writing to running executable is rejected as ETXTBSY.
  const backupFiles = async () => performAsyncWithRetry(async () => {
    await copyDirRecursively(outputDir, backupDir)
  }, {
    count: RETRY_TIME / RETRY_INTERVAL,
    intervalMs: RETRY_INTERVAL,
  })
  const clearBackupFiles = async (): Promise<void> => {
    await unlinkDirRecursively(backupDir)
  }
  context.subscriptions.push({ dispose: () => { clearBackupFiles() } })



  // LanguageClient:
  const client = newLanguageClient()
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
      await backupFiles()
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

const copyDirRecursively = async (srcDir: string, destDir: string): Promise<void> => {
  console.log("copyDir", srcDir, destDir)
  await fsP.mkdir(destDir, { recursive: true })

  const files = await fsP.readdir(srcDir)
  console.log("files", files.length)

  for (const filename of files) {
    const srcFile = path.join(srcDir, filename)
    const destFile = path.join(destDir, filename)

    const stat = await fsP.lstat(srcFile)
    if (stat.isDirectory()) {
      await copyDirRecursively(srcFile, destFile)
    } else if (stat.isFile()) {
      await fsP.copyFile(srcFile, destFile)
    } else if (stat.isSymbolicLink()) {
      const target = await fsP.realpath(srcFile)
      await fsP.symlink(target, destFile)
    } else {
      console.error("warn: couldn't copy file", srcFile)
    }
  }
}

const unlinkDirRecursively = async (dir: string): Promise<void> => {
  const files = await fsP.readdir(dir).catch((err: { code: string }) => {
    if (err.code === "ENOENT") {
      return []
    }
    throw err
  })

  for (const filename of files) {
    const filepath = path.join(dir, filename)
    const stat = await fsP.lstat(filepath)
    if (stat.isDirectory()) {
      await unlinkDirRecursively(filepath)
    } else {
      await fsP.unlink(filepath).catch(err => {
        if (err.code === "ENOENT") {
          return // OK.
        }
        throw err
      })
    }
  }

  await fsP.unlink(dir).catch(err => {
    if (err.code === "ENOENT") {
      return // OK.
    }
    throw err
  })
}

const stateDisplay = (state: State): string =>
  ({
    1: "Stopped",
    2: "Running",
    3: "Starting",
  })[state] ?? "Unknown"
