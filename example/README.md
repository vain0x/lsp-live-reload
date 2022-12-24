# Auto Reload LSP Server on VSCode

Example of VSCode extension as LSP client with auto-reload enabled.

## Contents

- .vscode/launch.json
    - See environment variables
- my-lsp-server
    - .NET application that is tiny LSP server (F#)
- vscode-ext
    - VSCode extension

## Try

Requirement:

- .NET SDK
- bash (Use Git Bash on Windows.)

```sh
# Restore and build things for first time.
./setup

# Watch files to rebuild server and extension.
./dev
```

- While `./dev` is running, do:
    - Open this directory on VSCode
    - Start debugging
    - Modify server (changing comment or logging message)

## Notes

- Use `vscode-languageclient` version >= `8.0.0-next.7`
    - v7 has an issue that client doesn't send exit notification to server correctly. See also <https://github.com/microsoft/vscode-languageserver-node/pull/776>
