module rec MyLspServer.Program

open MyLspServer.JsonRpcReader
open MyLspServer.LspServer

[<EntryPoint>]
let main _ =
  eprintfn "MyLspServer started!"

  let reader = createJsonRpcReader ()
  let server = createLspServer ()

  async {
    while true do
      let! request = reader
      server request
  }
  |> Async.RunSynchronously

  failwith "unreachable"
