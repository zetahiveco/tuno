// BlockNote editor schema for campaign email templates.
//
// Extends the default schema with two custom blocks:
//   - "button" — a CTA with editable inline label and a `url` prop
//   - "spacer" — an empty vertical gap with a `height` prop
//
// The matching email-safe HTML for these (and all default) blocks lives in
// mailer/shared/template-blocks.ts, which runs both for the live preview and
// at send time on the server.

import { BlockNoteSchema } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ButtonBlock = createReactBlockSpec(
  {
    type: "button",
    propSchema: {
      url: { default: "" },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div className="my-2 flex flex-col items-start gap-1.5" data-content-editable-ignore="true">
        <span
          ref={contentRef}
          className="bn-inline-content inline-flex min-w-16 cursor-text items-center justify-center rounded-lg bg-[#7a4fa3] px-5 py-2.5 text-sm font-semibold text-white outline-none"
        />
        <input
          className="h-7 w-full max-w-md rounded-md border border-[#e8e4ee] bg-white px-2.5 text-[11px] text-[#847b89] outline-none focus:border-[#c9b6dd]"
          onChange={(event) => editor.updateBlock(block as any, { props: { url: event.target.value } } as any)}
          onClick={(event) => event.preventDefault()}
          placeholder="https://link.com — clicks are tracked"
          value={block.props.url}
        />
      </div>
    ),
  },
);

const SpacerBlock = createReactBlockSpec(
  {
    type: "spacer",
    propSchema: {
      height: { default: 24, type: "number" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <div className="my-1 flex items-center gap-2" data-content-editable-ignore="true">
        <div
          className="relative flex-1 rounded border border-dashed border-[#d8cfe4] bg-[#faf8fc]"
          style={{ height: Math.max(4, Math.min(200, block.props.height || 24)) }}
        >
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] tracking-wide text-[#a49ba9]">
            spacer · {Math.max(4, Math.min(200, block.props.height || 24))}px
          </span>
        </div>
        <input
          className="h-7 w-16 shrink-0 rounded-md border border-[#e8e4ee] bg-white px-2 text-[11px] text-[#847b89] outline-none focus:border-[#c9b6dd]"
          max={200}
          min={4}
          onChange={(event) =>
            editor.updateBlock(block as any, { props: { height: Number(event.target.value) || 24 } } as any)
          }
          type="number"
          value={block.props.height}
        />
      </div>
    ),
  },
);

export const emailSchema = BlockNoteSchema.create({
  blockSpecs: {
    button: ButtonBlock() as any,
    spacer: SpacerBlock() as any,
  },
}) as any;

export type EmailEditorBlock = Record<string, unknown>;
