module rec MyLspServer.Program

open MyLspServer.JsonRpcReader
open MyLspServer.LspServer

[<EntryPoint>]
let main _ =
  eprintfn "MyLspServer started."

  let reader = createJsonRpcReader ()
  let server = createLspServer ()

  async {
    try
      while true do
        let! request = reader
        server request
    with
    | ex ->
      eprintfn "Server failed: %A" ex
      exit 1
  }
  |> Async.RunSynchronously

  failwith "unreachable"
