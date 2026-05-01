export { ai } from "./client";
export { generateImage } from "./image";
export { batchProcess, batchProcessWithSSE, isRateLimitError, type BatchOptions } from "./batch";
// Re-export the SDK's tool/function-calling primitives so other workspace
// packages can build typed function-calling pipelines without taking a
// direct `@google/genai` dependency of their own.
export { Type } from "@google/genai";
export type {
  FunctionDeclaration,
  FunctionCall,
  Content,
  Part,
} from "@google/genai";
