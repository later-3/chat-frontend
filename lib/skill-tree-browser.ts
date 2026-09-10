export interface SkillTreeEntry {
  readonly name: string;
  readonly description: string;
  readonly filePath: string;
  readonly disableModelInvocation: boolean;
}

export interface SkillTreeResponse {
  readonly schemaVersion: 1;
  readonly personal: { readonly skills: SkillTreeEntry[]; readonly error?: string };
  readonly projects: readonly {
    readonly projectId: string;
    readonly name: string;
    readonly path: string;
    readonly available: boolean;
    readonly skills: SkillTreeEntry[];
    readonly error?: string;
  }[];
  readonly workflows: readonly {
    readonly workflowId: string;
    readonly name: string;
    readonly agents: readonly {
      readonly agentId: string;
      readonly name: string;
      readonly skills: SkillTreeEntry[];
      readonly error?: string;
    }[];
  }[];
  readonly longAgents: readonly {
    readonly longAgentId: string;
    readonly name: string;
    readonly skills: SkillTreeEntry[];
    readonly error?: string;
  }[];
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTreeEntries(value: unknown, field: string): SkillTreeEntry[] {
  if (!Array.isArray(value)) throw new Error(`Chat返回了无效的${field}`);
  return value.map((entry, index) => {
    if (!isRecordValue(entry) || typeof entry.name !== "string" || typeof entry.filePath !== "string"
      || typeof entry.description !== "string" || typeof entry.disableModelInvocation !== "boolean") {
      throw new Error(`Chat返回了无效的${field}[${index}]`);
    }
    return entry as unknown as SkillTreeEntry;
  });
}

export function parseSkillTree(value: unknown): SkillTreeResponse {
  if (!isRecordValue(value) || value.schemaVersion !== 1 || !isRecordValue(value.personal)
    || !Array.isArray(value.projects) || !Array.isArray(value.workflows) || !Array.isArray(value.longAgents)) {
    throw new Error("Chat返回了无效的Skill树");
  }
  parseTreeEntries(value.personal.skills, "Skill树.personal.skills");
  for (const [index, project] of value.projects.entries()) {
    if (!isRecordValue(project) || typeof project.projectId !== "string" || typeof project.name !== "string"
      || typeof project.path !== "string" || typeof project.available !== "boolean") {
      throw new Error(`Chat返回了无效的Skill树.projects[${index}]`);
    }
    parseTreeEntries(project.skills, `Skill树.projects[${index}].skills`);
  }
  for (const [index, workflow] of value.workflows.entries()) {
    if (!isRecordValue(workflow) || typeof workflow.workflowId !== "string" || typeof workflow.name !== "string"
      || !Array.isArray(workflow.agents)) {
      throw new Error(`Chat返回了无效的Skill树.workflows[${index}]`);
    }
    for (const [agentIndex, agent] of (workflow.agents as unknown[]).entries()) {
      if (!isRecordValue(agent) || typeof agent.agentId !== "string" || typeof agent.name !== "string") {
        throw new Error(`Chat返回了无效的Skill树.workflows[${index}].agents[${agentIndex}]`);
      }
      parseTreeEntries(agent.skills, `Skill树.workflows[${index}].agents[${agentIndex}].skills`);
    }
  }
  for (const [index, agent] of value.longAgents.entries()) {
    if (!isRecordValue(agent) || typeof agent.longAgentId !== "string" || typeof agent.name !== "string") {
      throw new Error(`Chat返回了无效的Skill树.longAgents[${index}]`);
    }
    parseTreeEntries(agent.skills, `Skill树.longAgents[${index}].skills`);
  }
  return value as unknown as SkillTreeResponse;
}

/** Fetches the Backend-resolved four-level Skill ownership tree. */
export async function fetchChatSkillTree(
  projectId: string,
  signal?: AbortSignal,
): Promise<SkillTreeResponse> {
  const response = await fetch(`/api/skills/tree?projectId=${encodeURIComponent(projectId)}`, {
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecordValue(body) && typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parseSkillTree(body);
}
