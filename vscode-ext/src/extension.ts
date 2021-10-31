// Entrypoint of extension.

import { ExtensionContext } from "vscode"
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node"
import { startLspSessionDev } from "./lsp_session_dev"

const LSP_SERVER_COMMAND = process.env["LSP_SERVER_COMMAND"] ?? ""

/** Called when the extension is activated. */
export const activate = (context: ExtensionContext): void => {
  console.log("activated. LSP_SERVER_COMMAND =", LSP_SERVER_COMMAND)

  startLspSessionDev({
    exeFile: LSP_SERVER_COMMAND,
    context,
    newLanguageClient,
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
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "plaintext" }],
  }
  return new LanguageClient("my-lsp-server", "MyLspServer", serverOptions, clientOptions)
}
