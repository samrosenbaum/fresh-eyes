# AI Processing Architecture

## Direction

Fresh Eyes should use a typed AI task layer rather than direct model calls scattered throughout jobs. The app can use Vercel AI SDK as the base orchestration layer while preserving the ability to route specific tasks to the best model for OCR, extraction, reasoning, or report drafting.

## Task-Based Processing

AI work should be decomposed into durable, testable tasks:

- document classification
- OCR or transcription
- entity extraction
- statement extraction
- relationship extraction
- timeline extraction
- evidence extraction
- lab/test extraction
- gap detection
- case brief generation

Each task should have:

- a typed input
- a schema-validated output
- source quote requirements
- confidence fields
- retry/repair behavior
- storage mapping
- human-review status

## Durable Agents

Durable agents can be introduced after the base schema and AI task contracts are stable. The likely agent split is:

1. Intake Agent
2. OCR / Transcription Agent
3. Entity Resolution Agent
4. Timeline Agent
5. Evidence Agent
6. Gap Detection Agent
7. Briefing Agent

Agents should amplify investigators, not replace them. They should create source-backed facts, review tasks, and investigative leads rather than unsupported conclusions.

## Source Traceability Requirement

Every important AI-derived output should preserve:

- source file
- source page
- source quote or snippet
- extraction confidence
- model/task metadata
- review status

This is required for law enforcement trust and investigator adoption.

## Current Implementation Note

The codebase now routes document OCR, case graph extraction, gap detection, and case brief generation through `lib/ai/*` task modules instead of calling a provider SDK directly from jobs. The current provider adapter still uses the existing Anthropic client under the hood because the package registry blocked installing `ai` and `@ai-sdk/anthropic` in this environment, but the job layer no longer depends on Anthropic-specific calls. Swapping the provider adapter to Vercel AI SDK should be a contained change inside `lib/ai/provider.ts` and model configuration.
