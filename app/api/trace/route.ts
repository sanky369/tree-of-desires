import { NextResponse } from "next/server";
import {
  nodesByLayer,
  nodeById,
  sanitizePath,
  type TraceResult,
} from "@/lib/desires";

// Single constant so the model is easy to swap (any OpenRouter model id).
const MODEL = "openai/gpt-5.4-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const TRACE_SCHEMA = {
  type: "object",
  properties: {
    matchedBehaviorId: { type: ["string", "null"] },
    newBehaviorLabel: { type: ["string", "null"] },
    path: { type: "array", items: { type: "string" } },
    rootDesireId: { type: ["string", "null"] },
    reachedRoot: { type: "boolean" },
    rationale: { type: "string" },
    scores: {
      type: "object",
      properties: {
        rootDepth: { type: "number" },
        directness: { type: "number" },
        rootStrength: { type: "number" },
        frequency: { type: "number" },
      },
      required: ["rootDepth", "directness", "rootStrength", "frequency"],
      additionalProperties: false,
    },
    totalScore: { type: "number" },
    verdict: { type: "string" },
  },
  required: [
    "matchedBehaviorId",
    "newBehaviorLabel",
    "path",
    "rootDesireId",
    "reachedRoot",
    "rationale",
    "scores",
    "totalScore",
    "verdict",
  ],
  additionalProperties: false,
} as const;

function ontologyPrompt(): string {
  const layerNames = [
    "LAYER 0 — PRIMAL ROOTS",
    "LAYER 1 — BASIC DESIRES (Reiss)",
    "LAYER 2 — FUNCTIONAL JOBS (JTBD)",
    "LAYER 3 — OBSERVED BEHAVIORS (leaves)",
  ];
  return [0, 1, 2, 3]
    .map(
      (layer) =>
        `${layerNames[layer]}\n` +
        nodesByLayer(layer)
          .map((n) => {
            const parents = n.parents.length ? ` (parents: ${n.parents.join(", ")})` : "";
            return `- ${n.id}: ${n.label}${parents}`;
          })
          .join("\n"),
    )
    .join("\n\n");
}

const SYSTEM = `You are the trace engine of "Tree of Desires", an idea-validation tool.
You are given a 4-layer DAG of human desires (primal roots -> basic desires -> functional jobs -> observed behaviors) and a product/startup/feature idea.

Your job:
1. Find the closest existing Layer 3 behavior the idea maps to (matchedBehaviorId). If the idea is a genuinely novel behavior not represented by any leaf, set matchedBehaviorId to null and give a short newBehaviorLabel (2-4 words); then anchor the path at the most relevant Layer 2 job instead.
2. Trace inward along PARENT edges only: behavior -> job -> basic desire -> primal root. "path" is the ordered list of existing node ids from the outermost matched node to the terminal node. Every consecutive pair must be a real (parent-of) edge from the ontology. Do NOT include the newBehaviorLabel in path.
3. If no plausible chain reaches a Layer 0 root — the idea serves no recognizable human desire, or only via strained leaps — set reachedRoot=false and rootDesireId=null, and end the path where the trace honestly stops. A failed trace is a valid, important result: it means the idea has no primal anchor.
4. Score honestly on four 0-25 subscores:
   - rootDepth: 25 if the trace terminates cleanly at a Layer 0 root, scaled down the shallower it stops.
   - directness: higher for short, obvious, low-strain paths; penalize convoluted or metaphorical hops.
   - rootStrength: Life-Force 8 roots score higher than the two Kenrick/Reiss extension roots (root-curiosity, root-autonomy); 0 if no root reached.
   - frequency: how habitual/recurring the underlying behavior is (daily habit ~ 20-25, rare one-off ~ 0-8).
   totalScore = sum of the four.
5. verdict: one punchy line, e.g. "Painkiller: fast trace to a primal safety desire" or "Vitamin: no clean root anchor — reframe the problem".
6. rationale: 2-3 plain-language sentences a founder would find useful. Be skeptical of weak ideas; do not flatter.

Respond with JSON only.

ONTOLOGY:
${ontologyPrompt()}`;

function clamp(n: unknown, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(max, Math.round(v)));
}

export async function POST(req: Request) {
  let idea: string;
  try {
    const body = await req.json();
    idea = typeof body?.idea === "string" ? body.idea.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!idea) {
    return NextResponse.json({ error: "Please enter an idea to trace." }, { status: 400 });
  }
  if (idea.length > 500) {
    return NextResponse.json({ error: "Keep the idea under 500 characters." }, { status: 400 });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing OPENROUTER_API_KEY. Add it to .env.local." },
      { status: 500 },
    );
  }

  let text = "";
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Tree of Desires",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Idea to trace: ${idea}` },
        ],
        // Structured outputs: the model is constrained to this schema.
        response_format: {
          type: "json_schema",
          json_schema: { name: "trace_result", strict: true, schema: TRACE_SCHEMA },
        },
      }),
    });

    if (!res.ok) {
      const status = res.status === 429 ? 429 : 502;
      let detail = "";
      try {
        const errBody = await res.json();
        detail = typeof errBody?.error?.message === "string" ? `: ${errBody.error.message}` : "";
      } catch {
        /* ignore unparseable error body */
      }
      return NextResponse.json(
        { error: `Upstream AI request failed (${res.status})${detail}` },
        { status },
      );
    }

    const data = await res.json();
    text = typeof data?.choices?.[0]?.message?.content === "string"
      ? data.choices[0].message.content
      : "";
  } catch {
    return NextResponse.json({ error: "Could not reach OpenRouter. Try again." }, { status: 502 });
  }

  let parsed: TraceResult;
  try {
    // Structured outputs should return bare JSON; strip stray fences defensively anyway.
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(cleaned) as TraceResult;
  } catch {
    return NextResponse.json({ error: "AI returned an unparseable response. Try again." }, { status: 502 });
  }

  // Never trust the model's graph claims: keep only the longest prefix of the
  // path that follows real parent edges, then recompute the derived fields.
  const path = sanitizePath(Array.isArray(parsed.path) ? parsed.path : []);
  const terminal = path.length ? nodeById.get(path[path.length - 1]) : undefined;
  const reachedRoot = terminal?.layer === 0;
  const rootDesireId = reachedRoot ? terminal!.id : null;

  const matchedBehaviorId =
    typeof parsed.matchedBehaviorId === "string" &&
    nodeById.get(parsed.matchedBehaviorId)?.layer === 3
      ? parsed.matchedBehaviorId
      : null;

  const scores = {
    rootDepth: clamp(parsed.scores?.rootDepth, 25),
    directness: clamp(parsed.scores?.directness, 25),
    rootStrength: reachedRoot ? clamp(parsed.scores?.rootStrength, 25) : 0,
    frequency: clamp(parsed.scores?.frequency, 25),
  };

  const result: TraceResult = {
    matchedBehaviorId,
    newBehaviorLabel:
      typeof parsed.newBehaviorLabel === "string" && parsed.newBehaviorLabel.trim()
        ? parsed.newBehaviorLabel.trim()
        : null,
    path,
    rootDesireId,
    reachedRoot,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    scores,
    totalScore: scores.rootDepth + scores.directness + scores.rootStrength + scores.frequency,
    verdict: typeof parsed.verdict === "string" ? parsed.verdict : "",
  };

  return NextResponse.json(result);
}
