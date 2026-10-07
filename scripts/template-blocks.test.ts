import {
  defaultTemplateBlocks,
  parseTemplateBlocks,
  renderBlocksText,
  renderEmailHtml,
  extractVariables,
} from "../mailer/shared/template-blocks";
import { test, expect } from "bun:test";

test("default template renders HTML with interpolated link", () => {
  const blocks = defaultTemplateBlocks();
  const html = renderEmailHtml({ blocks, values: { email: "j@x.com", name: "Sam" } });
  expect(html).toContain("<h1");
  expect(html).toContain("Hi Sam,");
  expect(html).toContain('href="https://example.com"'); // link inside paragraph
  expect(html).not.toContain("{{ name }}");
  const variables = extractVariables(JSON.stringify(blocks));
  expect(variables).toContain("email");
  expect(variables).toContain("name");
});

test("blocknote document round-trips and renders lists/quotes/heading", () => {
  const doc = [
    { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Updates", styles: {} }], children: [] },
    { type: "paragraph", props: {}, content: [
      { type: "text", text: "Hello ", styles: {} },
      { type: "text", text: "world", styles: { bold: true } },
      { type: "link", href: "https://tuno.dev/{{ plan }}", content: [{ type: "text", text: "docs", styles: {} }] },
    ], children: [] },
    { type: "bulletListItem", props: {}, content: [{ type: "text", text: "One", styles: {} }], children: [] },
    { type: "bulletListItem", props: {}, content: [{ type: "text", text: "Two", styles: {} }], children: [
      { type: "bulletListItem", props: {}, content: [{ type: "text", text: "Nested", styles: {} }], children: [] },
    ] },
    { type: "numberedListItem", props: {}, content: [{ type: "text", text: "Step", styles: { italic: true } }], children: [] },
    { type: "quote", props: {}, content: [{ type: "text", text: "Wise words", styles: {} }], children: [] },
    { type: "divider", props: {}, children: [] },
    { type: "spacer", props: { height: 48 }, children: [] },
    { type: "button", props: { url: "https://example.com/{{ email }}" }, content: [{ type: "text", text: "Go", styles: {} }], children: [] },
  ];
  const html = renderEmailHtml({ blocks: doc, values: { plan: "Pro", email: "a@b.c" } });
  expect(html).toContain("<h2");
  expect(html).toContain("<strong>world</strong>");
  expect(html).toContain('<ul style="margin:0 0 16px;padding-left:24px;">');
  expect(html).toContain('<ol style="margin:0 0 16px;padding-left:24px;">');
  expect(html).toContain("Nested");
  expect(html).toContain("<blockquote");
  expect(html).toContain("margin:24px 0;"); // divider
  expect(html).toContain("height:48px"); // spacer
  expect(html).toContain('href="https://example.com/a@b.c"'); // interpolated button URL
  expect(html).toContain('href="https://tuno.dev/Pro"'); // interpolated link href

  const text = renderBlocksText(doc, { plan: "Pro", email: "a@b.c" });
  expect(text).toContain("Updates\n=======");
  expect(text).toContain("• One");
  expect(text).toContain("- Step");
  expect(text).toContain("Go: https://example.com/a@b.c");
});

test("legacy markdown templates migrate to blocknote blocks", () => {
  const legacy = JSON.stringify([
    { id: "1", type: "heading", text: "Hi {{ name }},", level: 2 },
    { id: "2", type: "text", text: "Welcome to **Tuno**.\n\n- first\n- second\n\n> quote line\n\n---" },
    { id: "3", type: "button", text: "Take a look", url: "https://example.com" },
    { id: "4", type: "spacer", height: 40 },
    { id: "5", type: "divider" },
  ]);
  const blocks = parseTemplateBlocks(legacy);
  const types = blocks.map((block) => block.type);
  expect(types).toContain("heading");
  expect(types).toContain("button");
  expect(types).toContain("bulletListItem");
  expect(types).toContain("quote");
  expect(types).toContain("divider");
  expect(types).toContain("spacer");

  const html = renderEmailHtml({ blocks, values: { name: "Ada" } });
  expect(html).toContain("Hi Ada,");
  expect(html).toContain("<strong>Tuno</strong>");
  expect(html).toContain("<ul");
  expect(html).toContain(">first</li>");
  expect(html).toContain(">second</li>");
  expect(html).toContain("background:#7a4fa3");
  expect(renderBlocksText(blocks, { name: "Ada" })).toContain("• first");
  expect(renderBlocksText(blocks, { name: "Ada" })).toContain("Take a look: https://example.com");
});

test("blocknote documents pass through parseTemplateBlocks unchanged", () => {
  const doc = [{ id: "x", type: "paragraph", props: {}, content: [{ type: "text", text: "hey", styles: {} }], children: [] }];
  expect(parseTemplateBlocks(JSON.stringify(doc))).toEqual(doc);
  expect(parseTemplateBlocks("not json")).toEqual([]);
  expect(parseTemplateBlocks(JSON.stringify([]))).toEqual([]);
});
