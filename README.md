# Auto Reload LSP Server on VSCode

Example of VSCode extension as LSP client with auto-reload enabled.

## What

- Motivation: While running a server, its executable is locked and can't be rewritten.
- To do: This extension copies all files of server to another directory and execute it.
    - Whenever files change, stop server, copy files again, and restart.

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

## Library?

I want to make this a library but not yet...

