// Entrypoint of extension.

import path from "path"
import { ExtensionContext } from "vscode"
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node"
import { computeBackupOptions, ErrorEvent, LspLiveReload } from "lsp-live-reload"

/** Called when the extension is activated. */
export const activate = async (context: ExtensionContext): Promise<void> => {
  console.log("Extension is activated.")

  // Read configurations from environment variables:
  const LSP_SERVER_COMMAND = process.env["LSP_SERVER_COMMAND"] ?? ""
  const LSP_SERVER_OUTPUT_DIR = process.env["LSP_SERVER_OUTPUT_DIR"] ?? ""
  console.log(`LSP_SERVER_COMMAND = '${LSP_SERVER_COMMAND}'`)
  console.log(`LSP_SERVER_OUTPUT_DIR = '${LSP_SERVER_OUTPUT_DIR}'`)

  if (!path.isAbsolute(LSP_SERVER_COMMAND))
    throw new Error("$LSP_SERVER_COMMAND must be absolute")

  if (!path.isAbsolute(LSP_SERVER_OUTPUT_DIR))
    throw new Error(`$LSP_SERVER_OUTPUT_DIR must be absolute`)

  // Setting up for LspLiveReload.
  const { command, backupOptions } = computeBackupOptions(LSP_SERVER_COMMAND, { backup: "parentDirectory" })
  console.log(`command = '${command}'`)
  console.log("backupOptions =", backupOptions)

  // Create client and LspLiveReload, which automatically starts.
  const client = newLanguageClient(command)
  context.subscriptions.push(client)
  const liveReload = new LspLiveReload(client, backupOptions)
  context.subscriptions.push(liveReload)

  // Propagate error.
  liveReload.addEventListener("error", (ev: ErrorEvent) => {
    console.error("error:", ev.error.message)
  })

  // For debugging, print messages when reload happens.
  liveReload.addEventListener("willReload", () => {
    console.log("LspLiveReload: start reloading.")
  })
  liveReload.addEventListener("didReload", () => {
    console.log("LspLiveReload: reloaded.")
  })
}

/** Creates a LanguageClient instance with options. */
const newLanguageClient = (lspServerCommand: string): LanguageClient => {
  const serverOptions: ServerOptions = {
    command: lspServerCommand,
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "plaintext" }],
  }
  return new LanguageClient("my-lsp-server", "MyLspServer", serverOptions, clientOptions)
}
