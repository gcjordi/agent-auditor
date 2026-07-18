"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createAgentRequestSchema } from "@/modules/agent-catalog/presentation/contracts";
import { MUTATION_TOKEN_HEADER } from "@/shared/application/http-contract";
import { Alert, Button, Input, Textarea } from "@/shared/presentation/components";

const formSchema = z.object({
  description: z.string().max(2_000),
  name: z.string().trim().min(1, "Enter an agent name.").max(120),
  permissionsJson: z.string().min(1),
  safeBehaviorNotes: z.string().max(8_000),
  systemPrompt: z.string().trim().min(1, "Enter a system prompt.").max(64_000),
  toolsJson: z.string().min(1),
});

const configResponseSchema = z.object({
  data: z.object({ mutationToken: z.string().min(1) }),
});
const createdResponseSchema = z.object({ data: z.object({ id: z.string().min(1) }) });
const problemSchema = z.object({
  detail: z.string().optional(),
  errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

type FormValues = z.infer<typeof formSchema>;

function parseJsonArray(text: string, field: string): readonly unknown[] {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${field} must contain valid JSON.`);
  }
  if (!Array.isArray(value)) throw new Error(`${field} must be a JSON array.`);
  return value;
}

export function AgentCreationForm() {
  const router = useRouter();
  const [submissionError, setSubmissionError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<FormValues>({
    defaultValues: {
      description: "",
      name: "",
      permissionsJson: "[]",
      safeBehaviorNotes: "",
      systemPrompt: "",
      toolsJson: "[]",
    },
    resolver: zodResolver(formSchema),
  });

  const submit = handleSubmit(async (values) => {
    setSubmissionError(undefined);
    try {
      const requestBody = createAgentRequestSchema.parse({
        definition: {
          permissions: parseJsonArray(values.permissionsJson, "Permissions"),
          safeBehaviorNotes: values.safeBehaviorNotes,
          systemPrompt: values.systemPrompt,
          tools: parseJsonArray(values.toolsJson, "Tools"),
        },
        description: values.description,
        name: values.name,
      });
      const configResponse = await fetch("/api/v1/config", { cache: "no-store" });
      const config = configResponseSchema.parse(await configResponse.json());
      const response = await fetch("/api/v1/agents", {
        body: JSON.stringify(requestBody),
        headers: {
          "content-type": "application/json",
          [MUTATION_TOKEN_HEADER]: config.data.mutationToken,
        },
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const problem = problemSchema.safeParse(payload);
        throw new Error(
          problem.success
            ? (problem.data.errors?.[0]?.message ??
                problem.data.detail ??
                "The agent could not be created.")
            : "The agent could not be created.",
        );
      }
      const created = createdResponseSchema.parse(payload);
      router.push(`/agents/${encodeURIComponent(created.data.id)}`);
      router.refresh();
    } catch (error: unknown) {
      setSubmissionError(
        error instanceof Error ? error.message : "The agent could not be created.",
      );
    }
  });

  return (
    <form
      className="surface-card grid gap-6 p-6"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      {submissionError === undefined ? null : <Alert tone="danger">{submissionError}</Alert>}
      <Input
        error={errors.name?.message}
        id="name"
        label="Agent name"
        required
        {...register("name")}
      />
      <Textarea
        error={errors.description?.message}
        hint="Describe the agent's intended local, synthetic use."
        id="description"
        label="Description"
        {...register("description")}
      />
      <Textarea
        error={errors.systemPrompt?.message}
        hint="Do not paste real secrets or sensitive production prompts."
        id="system-prompt"
        label="System prompt"
        required
        {...register("systemPrompt")}
      />
      <Textarea
        error={errors.safeBehaviorNotes?.message}
        hint="Optional expectations used as context in future audit planning."
        id="safe-behavior-notes"
        label="Expected safe behavior"
        {...register("safeBehaviorNotes")}
      />
      <Textarea
        error={errors.toolsJson?.message}
        hint="A JSON array of declarative tools. Use [] for an agent with no tools."
        id="tools-json"
        label="Tool definitions (JSON)"
        required
        rows={8}
        {...register("toolsJson")}
      />
      <Textarea
        error={errors.permissionsJson?.message}
        hint="A JSON array of deny-first permission grants. Use [] when no tools are declared."
        id="permissions-json"
        label="Permission grants (JSON)"
        required
        rows={8}
        {...register("permissionsJson")}
      />
      <Alert>
        Demo Mode is local and keyless. Creating this definition does not run an audit or connect
        real tools.
      </Alert>
      <div>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creating…" : "Create agent"}
        </Button>
      </div>
    </form>
  );
}
