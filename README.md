# LspLiveReload

~~`npm install lsp-live-reload`~~ (not uploaded yet)

## What

**Motivation**:
While running a server, its executable is locked and can't be rewritten.

**Solution**:
Copy all files of the server to another directory and instead execute it.
On rebuilt, stop server, copy files again, and restart.

## Usage

```ts
export const active = async (context: ExtensionContext) => {
  const { command, backupOptions } = computeBackupOptions(LSP_SERVER_COMMAND, { backup: "parentDirectory" })

  const client = newLanguageClient(command)
  context.subscriptions.push(client)

  const liveReload = new LspLiveReload(client, backupOptions)
  context.subscriptions.push(liveReload)

  liveReload.addEventListener("error", (ev: ErrorEvent) => {
    console.error("error:", ev.error.message)
  })
}
```

Points:

- Need an absolute path to the LSP server command, `LSP_SERVER_COMMAND`.
- Call `computeBackupOptions` function.
- Create a `LanguageClient` instance, using `vscode-languageclient` package.
- Create a `LspLiveReload` instance, which automatically starts LSP client.
- Attach `error` event to watch reloading error.

See [example](example/vscode-ext/src/extension.ts) for details.
