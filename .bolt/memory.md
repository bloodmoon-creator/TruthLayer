# Project memory

## Product intent & audience

- Full-stack web app for automated fact-checking and claim verification.
- Users submit text, URLs, or documents; the system extracts factual claims, independently retrieves evidence, and generates detailed verification reports.
- Audience likely includes researchers, journalists, fact-checkers, and users seeking evidence-based claim validation.

## Brand personality & voice

- Authoritative and tech-forward; conveys trust, rigor, and AI-driven intelligence.
- Production-grade polish — not generic or cookie-cutter.

## Visual design & UX direction

- Dark theme with neon accents; background uses neon AI verification artwork with a strong dark overlay for text/control readability.
- Blue glow retained as a fallback visual when the background image asset is unavailable.
- Non-cookie-cutter, production-worthy UI per `.bolt/prompt` global instructions (not restated here).
- Vite + React stack using Tailwind CSS, React hooks, and Lucide React icons; `@/` path alias maps to `src/`.

## Decisions, constraints & rationale

- Background switched to user-supplied neon verification artwork with dark overlay; the image file is not yet present in the project, so it will render once added at the expected public path.
- Blue glow kept as fallback to avoid a broken/empty background state.
- No extra UI theme or icon packages beyond what the template provides unless explicitly requested.

## Open questions & assumptions

- The exact filename and public path for the background image asset need to be confirmed or added to the project.
- Whether the neon aesthetic should extend into components (buttons, cards, report styling) or remain background-only is unconfirmed.
- Verification report format and claim-extraction UI details are not yet specified.