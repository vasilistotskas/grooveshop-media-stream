// Re-export MockJobQueueManager as JobQueueManager for Bun compatibility
// This allows the rest of the codebase to import JobQueueManager without loading Bull
export { MockJobQueueManager as JobQueueManager } from './mock-job-queue.manager'
