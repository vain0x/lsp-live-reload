module MyLspServer.LspServer

open MyLspServer.JsonValue
open MyLspServer.JsonSerialization
open MyLspServer.JsonRpcWriter

// -----------------------------------------------
// JSON helper
// -----------------------------------------------

let private newJsonObject (assoc: (string * JsonValue) list) = JObject(Map.ofList assoc)

let private getField (key: string) (jsonValue: JsonValue) : JsonValue =
  match jsonValue with
  | JObject map ->
    match Map.tryFind key map with
    | Some it -> it
    | None -> JNull
  | _ -> JNull

// -----------------------------------------------
// Handler
// -----------------------------------------------

let onInitializeRequest msgId =
  let result =
    jsonDeserializeString
      """{
        "capabilities": {
          "colorProvider": true
        },
        "serverInfo": {
            "name": "my_lsp_server",
            "version": "0.1.0"
        }
      }"""

  jsonRpcWriteWithResult msgId result

let private onUnknownMethodRequest msgId methodName =
  let methodNotFoundCode = -32601

  let error =
    newJsonObject [ "code", JNumber(float methodNotFoundCode)
                    "message", JString "Unknown method."
                    "data", newJsonObject [ "methodName", JString methodName ] ]

  jsonRpcWriteWithError msgId error

// -----------------------------------------------
// Server
// -----------------------------------------------

let createLspServer () : JsonValue -> unit =
  let mutable exitCode: int = 1

  fun (request: JsonValue) ->
    let getMsgId () = request |> getField "id"

    let methodName =
      match request |> getField "method" with
      | JString it -> it
      | _ -> "$/noMethod"

    match methodName with
    | "initialize" ->
      eprintfn "Server received an initialize request."
      onInitializeRequest (getMsgId ())

    | "initialized" -> eprintfn "initialized"

    | "shutdown" ->
      eprintfn "Server received a shutdown request."
      exitCode <- 0
      jsonRpcWriteWithResult (getMsgId ()) JNull

    | "exit" ->
      eprintfn "Server exits with %d." exitCode
      exit exitCode

    | "textDocument/documentColor" ->
      let result =
        jsonDeserializeString
          """
            [{
              "range": {
                "start": { "line": 0, "character": 0 },
                "end" : { "line": 0, "character": 1 }
              },
              "color": { "red": 0.4, "green": 0.8, "blue": 0.4, "alpha": 1 }
            }, {
              "range": {
                "start": { "line": 1, "character": 0 },
                "end" : { "line": 1, "character": 1 }
              },
              "color": { "red": 0.4, "green": 0.4, "blue": 0.8, "alpha": 1 }
            }]
          """

      jsonRpcWriteWithResult (getMsgId ()) result

    | "textDocument/colorPresentation" ->
      let result =
        jsonDeserializeString
          """
            [{ "label": "color" }]
          """

      jsonRpcWriteWithResult (getMsgId ()) result

    | _ when methodName.StartsWith("$/") -> ()
    | _ -> onUnknownMethodRequest (getMsgId ()) methodName
