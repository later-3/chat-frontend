/** Validate browser recovery data before it can become a group command. */
const policies = ["mention", "round-robin", "parallel", "moderator", "free"] as const;
export type GroupRoundPolicy = typeof policies[number];
function record(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved group input");
  return value as Record<string, unknown>;
}
export function parseGroupRoundInput(text: string): {policy:GroupRoundPolicy; targets?:string[]} {
  const input = record(text);
  if (!policies.some(policy => policy === input.policy) || (input.targets !== undefined && (!Array.isArray(input.targets) || input.targets.some(target => typeof target !== "string" || !target)))) throw new Error("Invalid saved discussion input");
  return { policy:input.policy as GroupRoundPolicy, ...(input.targets === undefined ? {} : {targets:input.targets as string[]}) };
}
export function parseGroupWorkInput(text: string): {kind:"consult"|"work"; to:string; question:string; title:string; instruction:string} {
  const input = record(text);
  if ((input.kind !== "consult" && input.kind !== "work") || [input.to,input.question,input.title,input.instruction].some(value => typeof value !== "string")) throw new Error("Invalid saved group work input");
  return {kind:input.kind,to:input.to as string,question:input.question as string,title:input.title as string,instruction:input.instruction as string};
}
