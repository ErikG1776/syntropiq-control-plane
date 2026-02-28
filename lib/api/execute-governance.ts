"use client"

export interface ExecuteGovernanceInput {
  task: unknown
  run_id?: string
  strategy?: string
}

export interface ExecuteGovernanceResult {
  data: unknown
  requestId: string | null
}

export async function executeGovernance(input: ExecuteGovernanceInput): Promise<ExecuteGovernanceResult> {
  const response = await fetch("/api/control-plane/governance/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : "request_failed"
    throw new Error(`${message} (status ${response.status})`)
  }

  return {
    data: body,
    requestId: response.headers.get("x-request-id"),
  }
}
