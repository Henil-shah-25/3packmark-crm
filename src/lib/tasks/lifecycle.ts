import { crmRepo } from '@/lib/google-sheets/repository';
import {
  getEligibleQueueForStage,
  isClosedOrPastOrderLead,
  resolveTaskQueue,
} from '@/lib/tasks/queues';
import { Lead, PipelineStage } from '@/types/crm';

/**
 * Auto-cancels all pending tasks when a deal is Closed/Won/Lost,
 * and supersedes older-stage queue tasks when a deal moves forward.
 */
export async function syncLeadTasksOnStageChange(
  workspaceId: string,
  lead: Lead,
  stages?: PipelineStage[]
): Promise<number> {
  const [tasks, resolvedStages] = await Promise.all([
    crmRepo.getTasks(workspaceId),
    stages ? Promise.resolve(stages) : crmRepo.getStages(workspaceId),
  ]);

  const pendingForLead = tasks.filter(
    (t) => t.leadId === lead.id && !t.completed && t.status !== 'done'
  );
  if (pendingForLead.length === 0) return 0;

  const isClosed = isClosedOrPastOrderLead(lead, resolvedStages);
  const stageObj = resolvedStages.find((s) => s.id === lead.stageId);
  const eligibleQueue = getEligibleQueueForStage(lead.stageId, stageObj?.name);
  const now = new Date().toISOString();

  let updatedCount = 0;
  for (const task of pendingForLead) {
    const taskQueue = resolveTaskQueue(task, lead);
    const shouldCancel = isClosed || (eligibleQueue !== null && taskQueue !== eligibleQueue);
    if (!shouldCancel) continue;

    try {
      await crmRepo.updateTask(workspaceId, task.id, {
        completed: true,
        status: 'done',
        completedAt: now,
        notes: isClosed
          ? 'Auto-cancelled when deal closed'
          : `Superseded on move to ${stageObj?.name || lead.stageId}`,
      });
      updatedCount++;
    } catch (err) {
      console.warn('[Task Lifecycle] Failed updating superseded task:', err);
    }
  }

  return updatedCount;
}
