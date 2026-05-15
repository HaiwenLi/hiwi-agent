import { type Result, err, ok } from "neverthrow";
import type { SkillExecutor, SkillExecuteOptions, SkillExecuteResult } from "./executor.js";

export interface WorkflowStep {
  skill: string;
  input?: string;
  condition?: string;
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
  outputFormat?: string;
}

export class SkillComposer {
  constructor(private executor: SkillExecutor) {}

  async execute(
    workflow: WorkflowDefinition,
    initialInput: string,
    context: SkillExecuteOptions,
  ): Promise<Result<SkillExecuteResult, Error>> {
    const events: SkillExecuteResult["events"] = [];
    let previousOutput = initialInput;

    for (const step of workflow.steps) {
      if (step.condition && step.condition !== "true") {
        continue;
      }

      const input = step.input ?? previousOutput;

      // Create a synthetic skill for the step
      const syntheticSkill = {
        name: step.skill,
        trigger: step.skill,
        type: "domain" as const,
        description: "Workflow step",
        prompt: `Execute workflow step: ${step.skill}`,
        sourcePath: "",
      };

      const result = await this.executor.execute(syntheticSkill, input, context);
      if (result.isErr()) {
        return err(new Error(`Step "${step.skill}" failed: ${result.error.message}`));
      }

      events.push(...result.value.events);

      // Extract text output for next step
      const texts = result.value.events
        .filter((e) => e.type === "text-delta" && e.text)
        .map((e) => e.text!);
      previousOutput = texts.join("") || previousOutput;
    }

    return ok({ events });
  }
}
