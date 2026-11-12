import { z } from "zod";
import questionsJson from "@/content/questions.json";
import charadesJson from "@/content/charades.json";
import promptsJson from "@/content/prompts.json";
import traitsJson from "@/content/traits.json";
import kassaArJson from "@/content/kassa.ar.json";
import blocklistJson from "@/content/blocklist.json";
import {
  blocklistSchema,
  charadesWordSchema,
  kassaFileSchema,
  promptSchema,
  questionSchema,
  traitSchema,
  traitTemplatesSchema,
} from "./schemas";

/** Parses and validates every seed file. Throws a readable error on the first bad file. */
export function loadSeedContent() {
  const parse = <T extends z.ZodType>(name: string, schema: T, data: unknown): z.infer<T> => {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new Error(`content/${name} is invalid:\n${z.prettifyError(result.error)}`);
    }
    return result.data;
  };

  const questions = parse("questions.json", z.array(questionSchema), questionsJson);
  const charades = parse("charades.json", z.array(charadesWordSchema), charadesJson);
  const prompts = parse("prompts.json", z.array(promptSchema), promptsJson);
  const traitsFile = parse(
    "traits.json",
    z.object({ templates: z.array(traitTemplatesSchema), traits: z.array(traitSchema) }),
    traitsJson,
  );
  const kassa = { ar: parse("kassa.ar.json", kassaFileSchema, kassaArJson) };
  const blocklist = parse("blocklist.json", blocklistSchema, blocklistJson);

  assertUnique("questions.json", questions.map((q) => q.id));
  assertUnique("prompts.json", prompts.map((p) => p.id));
  assertUnique("traits.json", traitsFile.traits.map((t) => t.id));
  assertUnique("charades.json", charades.map((c) => `${c.lang}:${c.word}`));

  return {
    questions,
    charades,
    prompts,
    traitTemplates: traitsFile.templates,
    // Banned traits never leave the loader.
    traits: traitsFile.traits.filter((t) => !t.banned),
    kassa,
    blocklist,
  };
}

export type SeedContent = ReturnType<typeof loadSeedContent>;

function assertUnique(file: string, ids: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`content/${file}: duplicate id "${id}"`);
    seen.add(id);
  }
}
