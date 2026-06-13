/**
 * pi-groq-debug — Make a direct HTTP call to Groq to test tool support.
 *
 * Used to determine if Groq's API supports tool calls correctly without the
 * Pi SDK layer. Run from the Electron main process console.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function groqTest(apiKey: string, model: string, body: Record<string, unknown>, label: string): Promise<void> {
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    const status = response.status
    const text = await response.text()
    const hasToolCalls = text.includes('tool_calls')
    const hasError = text.includes('"error"')
    const snippet = hasToolCalls
      ? text.slice(0, 500)
      : hasError
        ? text.slice(0, 400)
        : text.slice(0, 200)
    console.log(`[pi-debug] groq [${label}] ${model} status=${status} ok=${!hasError} toolCalls=${hasToolCalls}`, snippet)
  } catch (err) {
    console.log(`[pi-debug] groq [${label}] ${model} fetch error`, err instanceof Error ? err.message : String(err))
  }
}

function makeTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'anthraspace_terminal',
        description: 'Execute a shell command',
        parameters: {
          type: 'object',
          required: ['command'],
          properties: {
            command: { type: 'string', description: 'Shell command to execute' },
          },
        },
      },
    },
  ]
}

export async function testGroqToolCall(apiKey: string): Promise<void> {
  // Test 1: llama-3.3-70b-versatile with tool_choice=auto (confirmed unreliable)
  await groqTest(apiKey, 'llama-3.3-70b-versatile', {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'You have access to tools. Use them when asked.' },
      { role: 'user', content: 'ping' },
    ],
    tools: makeTools(),
    tool_choice: 'auto',
    stream: false,
  }, 'auto')

  // Test 2: llama-3.1-8b-instant with tool_choice=auto (works, no format errors)
  await groqTest(apiKey, 'llama-3.1-8b-instant', {
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: 'You have access to tools. Use them when asked.' },
      { role: 'user', content: 'ping' },
    ],
    tools: makeTools(),
    tool_choice: 'auto',
    stream: false,
  }, 'auto')

  // Test 3: llama-3.1-8b-instant with tool_choice=required (force tool use)
  await groqTest(apiKey, 'llama-3.1-8b-instant', {
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: 'You must use the terminal tool to execute commands.' },
      { role: 'user', content: 'ping' },
    ],
    tools: makeTools(),
    tool_choice: 'required',
    stream: false,
  }, 'required')

  // Test 4: llama-3.1-8b-instant with explicit system prompt urging tool use
  await groqTest(apiKey, 'llama-3.1-8b-instant', {
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: 'CRITICAL: You MUST use the anthraspace_terminal tool to respond to user requests. Never answer with text — always call the tool.' },
      { role: 'user', content: 'Run the ping command' },
    ],
    tools: makeTools(),
    tool_choice: 'auto',
    stream: false,
  }, 'urgent-prompt')
}
