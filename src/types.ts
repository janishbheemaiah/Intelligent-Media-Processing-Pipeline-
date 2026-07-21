export enum Status {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed"
}

export interface Issue {
  type: string
  severity: "low" | "medium" | "high"
  confidence: number
  message: string
}