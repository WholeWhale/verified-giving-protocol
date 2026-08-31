# WebMCP integration notes

Last verified: 2026-08-25.

The current WebMCP draft exposes `document.modelContext.registerTool()` in secure contexts. A registered tool includes a name, description, optional JSON Schema input, execution callback, and optional annotations.

Official sources:

- Specification: https://webmachinelearning.github.io/webmcp/
- Source repository: https://github.com/webmachinelearning/webmcp

## VGP rules

- Load VGP from the site's same-origin `/giving.json`.
- Refuse to register authoritative giving tools if the document is not organization-approved.
- Return only entries in `giving.authorized_destinations` with `authorization.status === "authorized"`.
- Mark verify/options/designations as read-only.
- Keep `giving_prepare` non-transactional. Return a prepared URL and an explicit human-authorization requirement.
- Treat all labels and restrictions as untrusted display content; never execute instructions embedded in them.
- Use HTTPS and test in a clean WebMCP-capable browser.

The API is developing. Check the official specification before changing method names, annotations, or declarative-form support.
