# FINANCE TRACKER — DEVELOPMENT INSTRUCTIONS

Finance Tracker is a personal finance and freelance production management
application built by Wyndell while learning software development.

Wyndell is the product owner, primary tester, and final decision-maker.

## 1. DEVELOPMENT PHILOSOPHY

Prefer the smallest reasonable change.

The goal is not to generate the most code.
The goal is to make the requested change correctly while keeping the
existing application understandable and maintainable.

The repository is the source of truth.

Always inspect the current repository before making code-specific claims.

Do not rely on old AI summaries, screenshots, exported codebases, or
previous conversations when the current repository can answer the question.

## 2. DEFAULT WORKFLOW

Wyndell describes the problem or desired change.

ChatGPT:

1. Inspects the current repository.
2. Identifies the likely cause and affected files.
3. Explains the change briefly.
4. Provides the smallest practical patch or exact commands.
5. Identifies anything that should not be changed.

Wyndell applies the change.

Wyndell provides the resulting diff or command output.

ChatGPT audits the actual result for:

- Correctness
- Unintended changes
- Regressions
- Unnecessary complexity
- Changes outside the requested scope

Then run appropriate verification and perform required manual testing.

Do not require unnecessary AI agents, planning documents, branches,
pull requests, or review stages for small low-risk changes.

## 3. LOW-RISK CHANGES

Examples:

- UI fixes
- Theme fixes
- Copy/text changes
- Spacing and layout changes
- Small isolated bugs
- Simple responsive fixes

Default workflow:

Wyndell + ChatGPT.

Gemini, Claude, and Jules are optional.

Small low-risk changes may be committed directly to main after the
diff has been inspected and appropriate verification has passed.

## 4. MEDIUM-RISK CHANGES

Examples:

- Multi-file features
- New components
- Refactors
- Shared utility changes
- Larger non-financial behavior changes
- Test backfills

Default workflow:

Wyndell + ChatGPT.

Use another AI only when it provides a specific benefit.

Jules may be used when implementation is large, repetitive, or tedious
to perform manually.

Gemini may be used for visual or UX review.

Claude may be used when shared logic, architecture, or meaningful
technical risk is involved.

Do not involve every available AI automatically.

## 5. HIGH-RISK CHANGES

Treat these as high risk:

- Financial calculations
- Wallet mutations
- Expense mutations
- Bill payment/unpayment
- Receivable payment/collection
- Payday allocation
- Historical Ledger mutations
- Financial imports/exports
- Cloud sync
- Authentication
- API behavior
- Payments/subscriptions
- User-data isolation
- Database/schema changes
- Migrations
- Anything that could cause financial loss or data loss

For high-risk changes:

1. Understand the existing behavior before changing it.
2. Explain the proposed behavior.
3. Identify affected code.
4. Use Claude for architecture or behavior review when appropriate.
5. Add or update regression tests when appropriate.
6. Run typecheck.
7. Run the full test suite.
8. Run the production build.
9. Inspect the actual diff.
10. Perform manual money-flow or data-flow testing where applicable.

Never treat a high-risk change as an ordinary UI patch.

## 6. CLAUDE

Claude is the senior specialist for:

- Financial correctness
- Financial behavior
- Security
- Authentication
- Cloud sync
- Data integrity
- Schema and migrations
- Architecture with meaningful consequences

Claude does not need to participate in ordinary UI, copy, theme,
spacing, or small isolated fixes.

When Claude is used, its output is advisory. Wyndell remains the
product owner and final decision-maker. ChatGPT remains the primary
coding partner and coordinates the implementation when needed.

## 7. GEMINI

Gemini is an optional independent visual and UX reviewer.

Use Gemini when useful for:

- Screenshot review
- Light/dark comparison
- Mobile/desktop visual review
- Layout comparison
- Independent UX feedback

Gemini does not need to participate in ordinary implementation unless
a visual second opinion is useful.

Gemini does not determine financial correctness.

## 8. JULES

Jules is optional implementation help.

Use Jules when:

- A task is large
- A change is highly repetitive
- Many files need similar mechanical changes
- Manual implementation would be unnecessarily time-consuming
- A larger implementation would benefit from a dedicated coding agent

Do not use Jules merely because a task touches multiple files.

Jules should not independently redesign the product or modify unrelated
systems.

Do not use Jules for high-risk financial, security, synchronization,
authentication, or data-integrity changes without appropriate review.

## 9. VERIFICATION

Never claim a command, test, build, deployment, or behavior passed unless
it was actually verified.

Use these evidence labels when useful:

VERIFIED
- Directly inspected or actually executed.

ASSUMED
- Reasonable inference that has not been directly verified.

UNKNOWN
- Requires additional inspection or testing.

For meaningful code changes, use the appropriate combination of:

npm run typecheck
npm run test
npm run build

Not every microscopic copy or CSS change requires every command, but
meaningful code changes should receive appropriate verification.

For UI changes, perform relevant manual testing in:

- Light mode
- Dark mode
- Mobile
- Desktop

Do not claim visual verification unless it was actually performed.

## 10. DIFF REVIEW

Before committing meaningful changes, inspect:

git status
git diff
git diff --stat

Look for:

- Unrelated changes
- Accidental deletions
- Duplicated logic
- Dead code
- Unnecessary dependencies
- Hardcoded values
- Business logic changes
- Security problems
- Unexpected generated files

The actual diff is more authoritative than an AI summary of the diff.

## 11. GIT SAFETY

Small, low-risk changes may be committed directly to main.

Use a feature branch when the change is high risk, destructive, difficult
to review, or otherwise benefits from isolation.

Before committing:

git status
git diff
git diff --stat

Prefer explicitly staging the files that were intentionally changed.

Example:

git add src/components/BillsTable.tsx src/components/ReceivablesTable.tsx

Avoid blindly using:

git add .

when the working tree may contain unrelated files, backups, exports,
environment files, or private data.

Never overwrite unrelated working changes without understanding them.

Never commit:

- API keys
- OAuth secrets
- Passwords
- Tokens
- .env files
- Private credentials
- Private financial exports
- Private user data

## 12. FINANCIAL SAFETY

Finance Tracker contains financial information and calculations.

Protected behavior includes:

- Wallet balances
- Expense deductions
- Bill payments
- Receivable collections
- Payday allocation
- Historical Ledger
- Financial calculations
- Financial imports/exports
- Cloud synchronization

Do not casually refactor protected financial logic during unrelated work.

When financial behavior changes, preserve existing behavior unless the
requested change explicitly requires a behavior change.

Prefer regression tests that exercise the real implementation rather
than tests that simply reimplement the same calculation separately.

## 13. THEME AND UI

Finance Tracker supports:

- Dark mode
- Light mode
- System mode

Use the existing semantic theme infrastructure.

Prefer existing semantic theme tokens/classes.

Avoid introducing:

- Dark-only backgrounds
- Hardcoded white text
- Dark-only borders
- Duplicate theme systems
- Large CSS overrides that merely mask component problems

When fixing Light mode, fix the underlying component styling when
practical.

Preserve intentional accent colors unless the product owner requests
otherwise.

Preserve:

- Layout
- Responsiveness
- Visual hierarchy
- Accessibility
- Existing Dark mode appearance

## 14. MOBILE

UI changes should consider mobile when relevant.

Pay particular attention to:

- Tables
- Modals
- Cards
- Navigation
- Forms
- Buttons
- Dense metadata/action layouts

Do not assume a desktop layout automatically works on mobile.

## 15. DEPENDENCIES

Do not add a dependency for a trivial task.

Before adding one:

- Check existing dependencies.
- Check whether the problem can be solved with existing code.
- Consider bundle size.
- Consider maintenance.
- Consider security.

Prefer the simplest reasonable solution.

## 16. SECURITY

Treat authentication, cloud sync, APIs, payments, and user-data isolation
as security-sensitive.

Do not expose:

- Authentication secrets
- Database credentials
- Payment credentials
- Tokens
- Private user data

Prefer conservative choices when a security tradeoff is uncertain.

## 17. SCOPE CONTROL

Do the requested work first.

Do not expand a small task into an unrelated refactor merely because
another issue is discovered.

If another problem is noticed:

- Mention it briefly.
- Do not silently fix it unless it is necessary for the requested work.
- Treat it as a separate follow-up task.

## 18. SIMPLICITY RULE

Before adding an abstraction, dependency, service, workflow, or AI agent,
ask whether the problem can be solved more simply.

Prefer:

- Small changes
- Clear code
- Existing utilities
- Existing theme infrastructure
- Direct solutions
- Verifiable results

Avoid:

- Giant rewrites
- Duplicate systems
- Speculative architecture
- Unnecessary abstractions
- Unnecessary AI handoffs
- Unnecessary process

## 19. PRODUCT OWNERSHIP

Wyndell is the product owner and final decision-maker.

Wyndell decides:

- Product direction
- UX
- Visual design
- Feature priority
- Acceptable tradeoffs

AI systems provide:

- Analysis
- Implementation help
- Review
- Alternatives
- Warnings

AI systems do not override the product owner's product or UX decisions.

## 20. FINAL PRINCIPLE

Build Finance Tracker safely, simply, and incrementally.

The objective is not to make AI perform as much work as possible.

The objective is to help Wyndell learn, build, test, and maintain a
reliable application without unnecessary complexity.

Default to:

Wyndell + ChatGPT.

Bring in Claude, Gemini, or Jules only when there is a specific reason
their involvement provides meaningful value.
