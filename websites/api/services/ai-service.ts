import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma as cmsPrisma } from "@/cms/api/services/database";
import { prisma as websitesPrisma } from "@/websites/api/services/database";
import { SITE_PAGE_PATH } from "@/websites/api/services/site-store";

export const WEBSITE_MODELS = [
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", description: "Default — best quality for site generation" },
  { id: "gpt-5.6", label: "GPT-5.6", description: "Fast general-purpose flagship" },
  { id: "gpt-5.1", label: "GPT-5.1", description: "Balanced quality and speed" },
  { id: "gpt-5", label: "GPT-5", description: "Reliable workhorse" },
  { id: "gpt-4.1", label: "GPT-4.1", description: "Long-context legacy model" },
] as const;

export const DEFAULT_MODEL_ID = "gpt-5.6-sol";

export function resolveModelId(candidate: unknown): string {
  if (typeof candidate === "string") {
    const found = WEBSITE_MODELS.find((model) => model.id === candidate);
    if (found) return found.id;
  }
  return DEFAULT_MODEL_ID;
}

const SYSTEM_PROMPT = `You are the Tuno Website Builder, an AI that designs and builds beautiful single-page websites using React and Tailwind CSS (as used in a Next.js App Router project).

## Output contract
Your reply has two parts, in this order:
1. A short, friendly explanation (2-4 sentences) of what you built or changed.
2. When (and only when) the site should be created or changed: ONE fenced code block labeled \`tsx\` containing the COMPLETE updated source of ${SITE_PAGE_PATH}.

Rules for the code:
- Exactly one fenced \`\`\`tsx block per reply. Never split the page across blocks or files.
- The file must \`export default\` the page component.
- Style exclusively with Tailwind CSS utility classes. Build a modern, polished, responsive layout.
- You may define helper components, use React hooks, arrays, and .map() inside the same file.
- Do not import anything except React hooks/types (e.g. \`import { useState } from "react"\`). No other libraries, no external images except https:// placeholder services like https://picsum.photos/seed/<seed>/800/600.
- Keep the whole file under ~700 lines.
- The preview is server-rendered as static markup: prefer static content; interactive hooks are allowed but will not run in the preview.

## Tools
You have CMS tools to read the workspace content collections. Use them whenever the user asks to build a site from real content, mention their CMS, or you need copy/data — pull the actual entries instead of inventing placeholder text. Rich text fields contain BlockNote block JSON; convert them to plain readable JSX.

## Workflow
- First request: design a complete, production-quality page for the request. Ask at most one clarifying question only if truly blocked; otherwise make reasonable assumptions.
- Follow-up requests: return the full updated file reflecting the change.
- If the user only asks a question, answer without a code block.`;

function cmsTools() {
  return {
    cms_list_collections: tool({
      description:
        "List the workspace CMS content collections with their fields (name, apiId, type). Use this first to discover what content exists.",
      inputSchema: z.object({}),
      execute: async () => {
        const collections = await cmsPrisma.collection.findMany({
          select: {
            name: true,
            apiId: true,
            description: true,
            fields: { orderBy: { position: "asc" }, select: { name: true, apiId: true, type: true } },
            _count: { select: { entries: true } },
          },
          orderBy: { name: "asc" },
        });
        return { collections };
      },
    }),

    cms_read_entries: tool({
      description:
        "Read entries from a CMS collection. Pass the collection's apiId (from cms_list_collections). Returns up to 50 entries with their field values. Set publishedOnly=false to include drafts.",
      inputSchema: z.object({
        collectionApiId: z.string().min(1).max(80),
        publishedOnly: z.boolean().optional(),
      }),
      execute: async ({ collectionApiId, publishedOnly }) => {
        const collection = await cmsPrisma.collection.findUnique({
          where: { apiId: collectionApiId },
          select: { id: true, name: true },
        });
        if (!collection) {
          return { error: `No collection with apiId "${collectionApiId}".` };
        }
        const entries = await cmsPrisma.entry.findMany({
          where: { collectionId: collection.id, ...(publishedOnly === false ? {} : { published: true }) },
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: { id: true, data: true, published: true, updatedAt: true },
        });
        return {
          collection: collection.name,
          count: entries.length,
          entries: entries.map((entry) => ({
            id: entry.id,
            published: entry.published,
            data: safeParse(entry.data),
          })),
        };
      },
    }),

    cms_get_api_endpoints: tool({
      description:
        "Get the REST endpoints for reading a CMS collection at runtime (useful if the user wants the generated site to fetch live CMS data itself).",
      inputSchema: z.object({ collectionApiId: z.string().min(1).max(80) }),
      execute: async ({ collectionApiId }) => {
        const collection = await cmsPrisma.collection.findUnique({
          where: { apiId: collectionApiId },
          select: { apiId: true, name: true },
        });
        if (!collection) {
          return { error: `No collection with apiId "${collectionApiId}".` };
        }
        return {
          publishedEntries: `/api/public/cms/content/${collection.apiId}`,
          note: "Public, unauthenticated JSON feed of published entries. The generated site may fetch() this at runtime.",
        };
      },
    }),
  };
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/** Extract the last fenced tsx code block from assistant text. */
export function extractPageCode(text: string): string | null {
  const matches = [...text.matchAll(/```(?:tsx|typescript|jsx)\r?\n([\s\S]*?)```/g)];
  const last = matches.at(-1);
  if (!last) return null;
  const code = last[1]?.trim();
  if (!code || !/export\s+default/i.test(code)) return null;
  return code;
}

export type WebsiteChatOutcome = {
  assistantText: string;
  pageCode: string | null;
  modelId: string;
};

/** Run the builder chat for a website; resolves when the stream completes. */
export async function streamWebsiteChat(options: {
  websiteId: string;
  websiteName: string;
  messages: UIMessage[];
  modelId: string;
  currentCode: string | null;
  onFinish: (outcome: WebsiteChatOutcome) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

  const currentSource = options.currentCode
    ? `Current ${SITE_PAGE_PATH}:\n\n\`\`\`tsx\n${options.currentCode.slice(0, 60_000)}\n\`\`\``
    : `This site has no source yet — this is the first build.`;

  const result = await streamText({
    model: openai(options.modelId),
    system: `${SYSTEM_PROMPT}\n\n## Current source\n${currentSource}`,
    messages: await convertToModelMessages(options.messages),
    tools: cmsTools(),
    stopWhen: stepCountIs(8),
    onError: (event) => options.onError(event.error),
    onFinish: async ({ response }) => {
      const text = response.messages
        .filter((message) => message.role === "assistant")
        .map((message) =>
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((part): part is { type: "text"; text: string } => part.type === "text")
                .map((part) => part.text)
                .join("\n"),
        )
        .join("\n")
        .trim();

      await options.onFinish({
        assistantText: text,
        pageCode: extractPageCode(text),
        modelId: options.modelId,
      }).catch((error) => options.onError(error));
    },
  });

  return result;
}

/** Persist chat history helper — used by the route. */
export async function loadWebsiteMessages(websiteId: string): Promise<UIMessage[]> {
  const rows = await websitesPrisma.chatMessage.findMany({
    where: { websiteId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role === "user" ? ("user" as const) : ("assistant" as const),
    parts: [{ type: "text" as const, text: row.content }],
  }));
}
