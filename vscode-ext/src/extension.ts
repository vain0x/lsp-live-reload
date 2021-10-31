// Entrypoint of extension.

import cp from "child_process"
import path from "path"
import { ExtensionContext } from "vscode"
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node"
import { startLspSessionDev } from "./lsp_session_dev"

const LSP_SERVER_COMMAND = process.env["LSP_SERVER_COMMAND"] ?? ""
const LSP_SERVER_OUTPUT_DIR = process.env["LSP_SERVER_OUTPUT_DIR"] ?? ""

/** Called when the extension is activated. */
export const activate = (context: ExtensionContext): void => {
  console.log("activated. LSP_SERVER_COMMAND =", LSP_SERVER_COMMAND, "LSP_SERVER_OUTPUT_DIR =", LSP_SERVER_OUTPUT_DIR)

  const outputDir = stripTrailingSep(path.normalize(LSP_SERVER_OUTPUT_DIR))
  const backupDir = outputDir + "_backup"
  const command = path.normalize(LSP_SERVER_COMMAND).replace(outputDir, backupDir)
  console.log("command =", command)

  startLspSessionDev({
    outputDir,
    backupDir,
    context,
    newLanguageClient: () => newLanguageClient(command),
  })
}

/** Called when the extension is being terminated. */
export const deactivate = (): Thenable<void> | undefined => {
  console.log("deactivated.")
  return undefined
}

/** Creates a LanguageClient instance with options. */
const newLanguageClient = (lspServerCommand: string): LanguageClient => {
  const serverOptions: ServerOptions = {
    command: lspServerCommand,
  }
  // const serverOptions: ServerOptions = async () => {
  //   const p = cp.spawn(lspServerCommand)
  //   p.stderr.on("readable", () => {
  //     while (true) {
  //       const chunk: string = p.stderr.read()?.toString() ?? ""
  //       if (chunk === "") break
  //       console.log("server stderr", chunk.trimEnd())
  //     }
  //   })
  //   p.on("error", err => { console.error("spawn error", err) })
  //   return p
  // }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "plaintext" }],
  }
  return new LanguageClient("my-lsp-server", "MyLspServer", serverOptions, clientOptions)
}

const stripTrailingSep = (filepath: string): string =>
  filepath.endsWith(path.sep) ? filepath.slice(0, filepath.length - path.sep.length) : filepath
