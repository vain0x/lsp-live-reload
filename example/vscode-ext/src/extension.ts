// Entrypoint of extension.

import path from "path"
import { ExtensionContext } from "vscode"
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node"
// import { startLspSessionDev } from "./lsp_session_dev"
import { ErrorEvent, LiveReloadLspSession } from "lsp-live-reload"

const LSP_SERVER_COMMAND = process.env["LSP_SERVER_COMMAND"] ?? ""
const LSP_SERVER_OUTPUT_DIR = process.env["LSP_SERVER_OUTPUT_DIR"] ?? ""

/** Called when the extension is activated. */
export const activate = (context: ExtensionContext): void => {
  console.log("activated. LSP_SERVER_COMMAND =", LSP_SERVER_COMMAND, "LSP_SERVER_OUTPUT_DIR =", LSP_SERVER_OUTPUT_DIR)

  const outputDir = stripTrailingSep(path.normalize(LSP_SERVER_OUTPUT_DIR))
  const backupDir = outputDir + "_backup"
  const command = path.normalize(LSP_SERVER_COMMAND).replace(outputDir, backupDir)
  console.log("command =", command)

  const client = newLanguageClient(command)

  const session = new LiveReloadLspSession(client, { outputDir, backupDir, context })

  session.addEventListener("willReload", () => {
    console.error("reloading")
  })
  session.addEventListener("didReload", () => {
    console.error("reloaded")
  })
  session.addEventListener("error", (ev: ErrorEvent) => {
    console.error("error:", ev.error.message)
  })
}

/** Creates a LanguageClient instance with options. */
const newLanguageClient = (lspServerCommand: string): LanguageClient => {
  const serverOptions: ServerOptions = {
    command: lspServerCommand,
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "plaintext" }],
  }
  return new LanguageClient("my-lsp-server", "MyLspServer", serverOptions, clientOptions)
}

const stripTrailingSep = (filepath: string): string =>
  filepath.endsWith(path.sep) ? filepath.slice(0, filepath.length - path.sep.length) : filepath
