import { create } from 'zustand';
import type { AgentStep, AgentStatus } from '../components/blocks/media/agent/types';

export interface BackgroundTask {
    id: string;
    cardId: string;
    label: string;
    type: 'research' | 'agent';
    status: 'running' | 'done' | 'error';
    startTime: number;

    // ── Per-task live state (written by IframeBlock, read by CommandCenter) ──
    /** Agent step history for this task */
    agentSteps?: AgentStep[];
    /** Agent current micro-action label */
    currentAction?: string;
    /** Agent execution status ('running' / 'paused' / 'done' etc.) */
    agentStatus?: AgentStatus;
    /** Pause question for confirmation UI */
    pauseQuestion?: string | null;

    /** Research stream steps for this task */
    researchSteps?: any[];
    /** Research phase label */
    researchPhase?: string;
    /** Research status */
    researchStatus?: string;
    /** The research query */
    researchQuery?: string;
}

interface TaskStore {
    tasks: Record<string, BackgroundTask>;
    upsertTask: (task: BackgroundTask) => void;
    /** Partial-update only the live runtime fields (steps/status/etc.) without full replacement */
    patchTask: (id: string, patch: Partial<Omit<BackgroundTask, 'id' | 'cardId' | 'label' | 'type' | 'startTime'>>) => void;
    removeTask: (id: string) => void;
    clearDoneTasks: () => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
    tasks: {},
    upsertTask: (task) =>
        set((state) => ({
            tasks: { ...state.tasks, [task.id]: task },
        })),
    patchTask: (id, patch) =>
        set((state) => {
            // Primary lookup by id
            let existing = state.tasks[id];
            let key = id;
            // Fallback: search by cardId field (IframeBlock may pass cardCtx.cardId which differs from task.id)
            if (!existing) {
                const found = Object.entries(state.tasks).find(([, t]) => t.cardId === id);
                if (found) {
                    key = found[0];
                    existing = found[1];
                }
            }
            if (!existing) return state;
            return { tasks: { ...state.tasks, [key]: { ...existing, ...patch } } };
        }),
    removeTask: (id) =>
        set((state) => {
            const { [id]: _, ...rest } = state.tasks;
            return { tasks: rest };
        }),
    clearDoneTasks: () =>
        set((state) => {
            const activeTasks: Record<string, BackgroundTask> = {};
            for (const [id, task] of Object.entries(state.tasks)) {
                if (task.status === 'running') {
                    activeTasks[id] = task;
                }
            }
            return { tasks: activeTasks };
        }),
}));
