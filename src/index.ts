// LSP session for development environment.
// Live reload is enabled. Whenever LSP server binary is updated, session restarts.

import fs, { FSWatcher } from "fs"
import fsP from "fs/promises"
import path from "path"
import vscode, { Disposable } from "vscode"
import { LanguageClient } from "vscode-languageclient/node"
import debounce from "lodash/debounce"

const DEBOUNCE_TIME = 700 // 0.7s
const RETRY_TIME = 60 * 1000 // 1min
const RETRY_INTERVAL = 100 // 0.1s
const RELOAD_STATUS_DURATION = 10000 // 10s

type EventType =
  | "willReload"
  | "didReload"
  | "willStartClient"
  | "didStartClient"
  | "willStopClient"
  | "didStopClient"
  | "willCopy"
  | "didCopy"
  | "willClean"
  | "didClean"
  | "error"

interface BackupOptions {
  copyType: "file" | "directory"
  /** Source file or directory on backup. */
  copySrc: string
  /** Destination file or directory on backup. */
  copyDest: string
  /** Directory to be watched. */
  watchDir: string
  /** Basename of file to be watched if not null. */
  watchFile: string | null
}

/** Compute options for LspLiveReload and LanguageClient.
 *
 * For live-reload feature, LanguageClient needs to spawn instance in a backup directory.
 * This function converts the command (filename) of LSP server to point backup one.
 *
 * This function also computes where to watch and how to make backup here
 * depending on options.
 * `backupOptions` is returned to be passed in `LspLiveReload`.
 *
 * @param command
 *    File path to the server command.
 *    Path must be **absolute**. (E.g. `"/path/to/server.exe"`)
 */
export const computeBackupOptions = (command: string, options: {
  /** Specify what to copy (required)
   *
   * - "commandOnly": Copy the file specified by the command only
   * - "parentDirectory": Copy the parent directory of the command
   */
  backup: "commandOnly" | "parentDirectory"
}): {
  /** File path to the server command. */
  command: string
  /** This should be passed in `LspLiveReload` constructor. */
  backupOptions: BackupOptions
} => {
  if (!path.isAbsolute(command))
    throw new Error(`command (path to LSP server executable) must be absolute: '${command}'`)

  if (path.dirname(command) === "/")
    throw new Error("command must be under a non-root directory.")

  const normalizedCommand = path.normalize(command)
  const backupType = options.backup

  let backupOptions: BackupOptions
  switch (backupType) {
    case "commandOnly": {
      const destCommand = `${normalizedCommand}.BACKUP.exe`
      backupOptions = {
        copyType: "file",
        copySrc: normalizedCommand,
        copyDest: `${normalizedCommand}.BACKUP.exe`,
        watchDir: path.dirname(normalizedCommand),
        watchFile: path.basename(normalizedCommand),
      }
      return { command: destCommand, backupOptions }
    }
    case "parentDirectory": {
      const copySrc = stripTrailingSep(path.dirname(normalizedCommand))
      const copyDest = `${copySrc}.BACKUP.d`
      const destCommand = `${copyDest}/${path.basename(normalizedCommand)}`
      backupOptions = {
        copyType: "directory",
        copySrc: copySrc,
        copyDest: copyDest,
        watchDir: copySrc,
        watchFile: null,
      }
      return { command: destCommand, backupOptions }
    }
    default: throw never(backupType)
  }
}

export class LspLiveReload implements EventTarget {
  #client: LanguageClient

  #abortController = new AbortController()
  #eventTarget = new EventTarget()

  #backupFiles: (() => Promise<void>)
  #notification: Disposable | null = null
  #watcher: FSWatcher | null = null

  #reloadCount = 0

  constructor(client: LanguageClient, backupOptions: BackupOptions) {
    this.#client = client

    const { signal } = this.#abortController

    // Reload debounce mechanism:
    const requestReload = debounce(async () => {
      await this.#performReload()
    }, DEBOUNCE_TIME)

    // Watcher:
    let watcher: FSWatcher | null = null
    void (async () => {
      try {
        await fsP.mkdir(backupOptions.watchDir, { recursive: true })
        if (signal.aborted) throw new AbortError()

        watcher = fs.watch(backupOptions.watchDir)
        watcher.on("change", (_ev, filename) => {
          // Watch single file if specified; ignore others.
          if (backupOptions.watchFile && backupOptions.watchFile !== filename) {
            return
          }
          requestReload()
        })
        watcher.on("error", err => this.#emitError(err))
        this.#watcher = watcher
      } catch (err) {
        this.#emitError(err)
      }
    })()

    // Backup creator:
    // Copy files to not lock or mutate while running server.
    // (Note: Writing to running executable is rejected as ETXTBSY.)
    this.#backupFiles = async () => performAsyncWithRetry(async () => {
      switch (backupOptions.copyType) {
        case "file":
          await fsP.copyFile(backupOptions.copySrc, backupOptions.copyDest).catch((err: { code: string }) => {
            if (err.code === "ENOENT") {
              return
            }
            throw err
          })
          return

        case "directory":
          // FIXME: should copy only changes
          await copyDirRecursively(backupOptions.copySrc, backupOptions.copyDest, signal)
          return

        default: throw never(backupOptions.copyType)
      }
    }, {
      count: RETRY_TIME / RETRY_INTERVAL,
      intervalMs: RETRY_INTERVAL,
    })

    requestReload()
  }

  async #performReload() {
    const client = this.#client
    const { signal } = this.#abortController
    if (signal.aborted) return

    const promise = (async () => {
      try {
        this.#emit("willReload")

        if (client.needsStop()) {
          this.#emit("willStopClient")
          await client.stop(2000)

          // https://github.com/microsoft/vscode-languageserver-node/blob/release/client/8.0.2/client/src/node/main.ts#L231
          await delay(2000 + 200) // Wait until the process is actually terminated.
          this.#emit("didStopClient")
        }

        {
          this.#emit("willCopy")
          await this.#backupFiles!()
          this.#emit("didCopy")
        }

        {
          this.#emit("willStartClient")
          await client.start()
        }

        this.#emit("didReload")
      } catch (err) {
        this.#emitError(err)
      }
    })()
    this.#notifyReload(promise)
    return promise
  }

  #notifyReload(promise: Promise<void>): void {
    if (this.#abortController.signal.aborted) return

    const id = ++this.#reloadCount

    this.#notification?.dispose()
    this.#notification = vscode.window.setStatusBarMessage(`LSP reloading... (#${id})`, promise)

    promise.then(() => {
      if (this.#abortController.signal.aborted) return

      this.#notification = vscode.window.setStatusBarMessage(`LSP reloaded (#${id})`, RELOAD_STATUS_DURATION)
    })
  }

  // Implements Disposable:

  dispose(): void {
    if (this.#abortController.signal.aborted) return

    this.#abortController.abort()
    this.#client.stop()
    this.#notification?.dispose()
    this.#watcher?.close()
  }

  // Implements EventTarget:

  /**
   * @param {EventType} type
   * @type {EventTarget["addEventListener"]}
   */
  addEventListener(type: EventType, listener: (ev: Event) => void, options?: AddEventListenerOptions): void {
    this.#eventTarget.addEventListener(type, listener, options)
  }

  /** @type {EventTarget["removeEventListener"]} */
  removeEventListener(type: EventType, listener: (ev: Event) => void) {
    this.#eventTarget.removeEventListener(type, listener)
  }

  /** For internal use.
   * @type {EventTarget["dispatchEvent"]} */
  dispatchEvent(ev: Event) {
    return this.#eventTarget.dispatchEvent(ev)
  }

  #emit(type: EventType) {
    this.dispatchEvent(new Event(type))
  }

  #emitError(err: unknown) {
    const e = typeof err === "object" && err && err instanceof Error
      ? err
      : new Error(String(err))

    if (e instanceof AbortError) return

    this.dispatchEvent(new ErrorEvent(e))
  }
}

export class ErrorEvent extends Event implements Error {
  error: Error

  constructor(err: Error) {
    super("error")
    this.error = err
  }

  get name(): string { return this.error.name }
  get message(): string { return this.error.message }
  get stack(): string | undefined { return this.error.stack }
}

type AddEventListenerOptions = Parameters<EventTarget["addEventListener"]>["2"]

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

// ----------------------------------------------
// File IO
// ----------------------------------------------

const copyDirRecursively = async (srcDir: string, destDir: string, signal: AbortSignal): Promise<void> => {
  await fsP.mkdir(destDir, { recursive: true })
  if (signal.aborted) throw new AbortError()

  const files = await fsP.readdir(srcDir)
  if (signal.aborted) throw new AbortError()

  for (const filename of files) {
    const srcFile = path.join(srcDir, filename)
    const destFile = path.join(destDir, filename)

    const stat = await fsP.lstat(srcFile)
    if (signal.aborted) throw new AbortError()

    if (stat.isDirectory()) {
      await copyDirRecursively(srcFile, destFile, signal)
    } else if (stat.isFile()) {
      await fsP.copyFile(srcFile, destFile)
    } else if (stat.isSymbolicLink()) {
      const target = await fsP.realpath(srcFile)
      await fsP.symlink(target, destFile)
    } else {
      // FIXME: make this configurable
      console.error("warn: couldn't copy file", srcFile)
    }

    // Ensure not to return if aborted.
    if (signal.aborted) throw new AbortError()
  }
}

// ===============================================
// Utilities

class AbortError extends Error {
  constructor() {
    super("Operation has been aborted")
  }
}

/** Waits for several time. */
const delay = (timeMs: number) =>
  new Promise<void>(resolve => { setTimeout(resolve, timeMs) })

const stripTrailingSep = (filepath: string): string =>
  filepath.endsWith(path.sep) ? filepath.slice(0, filepath.length - path.sep.length) : filepath

const never = (_: never) => new Error("never")
