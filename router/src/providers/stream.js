function extractUsageFromSSE(buffer) {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const line of buffer.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const raw = trimmed.slice(5).trim();
    if (raw === '[DONE]') continue;

    try {
      const json = JSON.parse(raw);

      // OpenAI: final chunk with usage
      if (json.usage) {
        inputTokens  = json.usage.prompt_tokens     || inputTokens;
        outputTokens = json.usage.completion_tokens || outputTokens;
      }
      // Claude: message_start carries input usage
      if (json.type === 'message_start' && json.message?.usage) {
        inputTokens = json.message.usage.input_tokens || inputTokens;
      }
      // Claude: message_delta carries output usage
      if (json.type === 'message_delta' && json.usage) {
        outputTokens = json.usage.output_tokens || outputTokens;
      }
    } catch {
      // skip malformed lines
    }
  }

  return { inputTokens, outputTokens };
}

function extractUsageFromJson(json) {
  // OpenAI non-streaming
  if (json?.usage) {
    return {
      inputTokens:  json.usage.prompt_tokens     || 0,
      outputTokens: json.usage.completion_tokens || 0,
    };
  }
  // Claude non-streaming
  if (json?.usage) {
    return {
      inputTokens:  json.usage.input_tokens  || 0,
      outputTokens: json.usage.output_tokens || 0,
    };
  }
  return { inputTokens: 0, outputTokens: 0 };
}

export async function pipeResponseAndCapture(response, res, streaming) {
  res.status(response.status);
  const contentType = response.headers.get('content-type') ||
    (streaming ? 'text/event-stream' : 'application/json');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-cache');

  if (!streaming) {
    const text = await response.text();
    res.end(text);
    try {
      return extractUsageFromJson(JSON.parse(text));
    } catch {
      return { inputTokens: 0, outputTokens: 0 };
    }
  }

  res.setHeader('Connection', 'keep-alive');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
      sseBuffer += chunk;
    }
  } finally {
    res.end();
  }

  return extractUsageFromSSE(sseBuffer);
}
