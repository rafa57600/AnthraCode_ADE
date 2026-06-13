import { RuntimeClient } from '../runtime-client'
import { findAnthraSpaceMcpTool, isMcpToolInputError, toMcpToolList } from './tools'

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: unknown
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

const JSONRPC_PARSE_ERROR = -32700
const JSONRPC_INVALID_REQUEST = -32600
const JSONRPC_METHOD_NOT_FOUND = -32601
const JSONRPC_INVALID_PARAMS = -32602
const JSONRPC_INTERNAL_ERROR = -32603

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function writeMessage(message: JsonRpcResponse): void {
  const body = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
}

function success(id: JsonRpcResponse['id'], result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function failure(
  id: JsonRpcResponse['id'],
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } }
}

function readHeaderLength(header: string): number | null {
  for (const line of header.split(/\r?\n/)) {
    const match = line.match(/^content-length:\s*(\d+)$/i)
    if (match) return Number.parseInt(match[1], 10)
  }
  return null
}

export async function handleAnthraSpaceMcpRequest(
  request: JsonRpcRequest,
  client: Pick<RuntimeClient, 'call'>
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null
  if (!request.method) return failure(id, JSONRPC_INVALID_REQUEST, 'Missing method')

  // Notifications have no id and must not receive responses.
  const isNotification = request.id === undefined || request.id === null
  if (isNotification && request.method.startsWith('notifications/')) return null

  switch (request.method) {
    case 'initialize':
      return success(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'anthraspace', version: '0.0.1' }
      })

    case 'tools/list':
      return success(id, { tools: toMcpToolList() })

    case 'tools/call': {
      const params = asRecord(request.params)
      const name = typeof params.name === 'string' ? params.name : ''
      const tool = findAnthraSpaceMcpTool(name)
      if (!tool) return failure(id, JSONRPC_METHOD_NOT_FOUND, `Unknown AnthraSpace tool: ${name}`)

      try {
        const result = await tool.handler(asRecord(params.arguments), client)
        return success(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        })
      } catch (error) {
        if (!isMcpToolInputError(error)) {
          return failure(
            id,
            JSONRPC_INTERNAL_ERROR,
            error instanceof Error ? error.message : String(error)
          )
        }
        return failure(
          id,
          JSONRPC_INVALID_PARAMS,
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    default:
      return failure(id, JSONRPC_METHOD_NOT_FOUND, `Unsupported MCP method: ${request.method}`)
  }
}

export async function startAnthraSpaceMcpServer(
  client: Pick<RuntimeClient, 'call'> = new RuntimeClient()
): Promise<void> {
  let buffer = Buffer.alloc(0)
  let processing = false

  const processBuffer = async (): Promise<void> => {
    if (processing) return
    processing = true
    try {
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        const altHeaderEnd = buffer.indexOf('\n\n')
        const delimiterIndex = headerEnd !== -1 ? headerEnd : altHeaderEnd
        if (delimiterIndex === -1) return

        const delimiterLength = headerEnd !== -1 ? 4 : 2
        const header = buffer.slice(0, delimiterIndex).toString('utf8')
        const contentLength = readHeaderLength(header)
        if (!Number.isFinite(contentLength) || contentLength === null) {
          buffer = buffer.slice(delimiterIndex + delimiterLength)
          writeMessage(failure(null, JSONRPC_PARSE_ERROR, 'Missing Content-Length header'))
          continue
        }

        const bodyStart = delimiterIndex + delimiterLength
        const bodyEnd = bodyStart + contentLength
        if (buffer.length < bodyEnd) return

        const rawBody = buffer.slice(bodyStart, bodyEnd).toString('utf8')
        buffer = buffer.slice(bodyEnd)

        let request: JsonRpcRequest
        try {
          request = JSON.parse(rawBody) as JsonRpcRequest
        } catch (error) {
          writeMessage(
            failure(
              null,
              JSONRPC_PARSE_ERROR,
              error instanceof Error ? error.message : String(error)
            )
          )
          continue
        }

        try {
          const response = await handleAnthraSpaceMcpRequest(request, client)
          if (response) writeMessage(response)
        } catch (error) {
          writeMessage(
            failure(
              request.id ?? null,
              JSONRPC_INTERNAL_ERROR,
              error instanceof Error ? error.message : String(error)
            )
          )
        }
      }
    } finally {
      processing = false
      if (buffer.length > 0) void processBuffer()
    }
  }

  process.stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    void processBuffer()
  })

  process.stdin.resume()
}
