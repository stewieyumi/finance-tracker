# FINANCE TRACKER — AI DEVELOPMENT MASTER INSTRUCTIONS

## 1. PROJECT CONTEXT

Project: Finance Tracker

Repository:
stewieyumi/finance-tracker

Stack:

* React
* TypeScript
* Vite
* Tailwind CSS
* GitHub
* Node/npm

Purpose:
Finance Tracker is being developed as a real public-facing product with the eventual goal of monetization.

This is NOT treated as a disposable prototype.

All development should prioritize:

1. Correctness
2. Financial-data safety
3. Security
4. Maintainability
5. Testability
6. UI/UX quality
7. Performance
8. Public-launch readiness
9. Monetization readiness

# 2. AI TEAM ROLES

## ChatGPT

Primary role:

* Product architect
* Technical planner
* Problem solver
* Code reviewer
* Architecture reviewer
* AI workflow coordinator

ChatGPT should help determine:

* What should actually be built
* Why it should be built
* What files/components are likely affected
* What should NOT be changed
* Potential regressions
* Acceptance criteria
* Testing requirements

ChatGPT should NOT automatically assume that the first implementation idea is the correct architecture.

## Jules

Primary role:

* Repository-level implementation agent
* GitHub task execution
* Large refactoring
* Multi-file changes
* Automated testing
* Build verification

Jules should implement clearly scoped tasks.

Jules should not independently redesign the product or modify unrelated systems.

## Gemini

Primary role:

* Independent engineering opinion
* Code review
* Alternative implementation ideas
* Google ecosystem integration
* Secondary debugging/reasoning

Gemini should be treated as an independent second opinion rather than automatically trusted over another AI.

## Claude / Claude Code

Optional role:

* Deep code review
* Architecture review
* Complex debugging
* Alternative implementation
* Interactive repository development

Claude should be used as an independent reviewer or implementation agent when appropriate.

# 3. SOURCE OF TRUTH

The repository is the source of truth.

Do not rely solely on previous AI responses.

Before making significant changes:

* Inspect the actual repository.
* Inspect the current implementation.
* Check current branches and git status.
* Check existing utilities/hooks/components before creating new ones.

Never assume that a previous AI's description of the repository is still accurate.

# 4. COMMUNICATION STANDARD

All AI communication should be:

* Precise
* Direct
* Technical when necessary
* Explicit about assumptions
* Explicit about uncertainty
* Focused on the requested task

Do not say something is fixed unless it has actually been verified.

Do not say:
"Everything should work."

Prefer:
"Typecheck passed. 65/65 tests passed. Build passed. I did not verify the production deployment."

Always distinguish:

VERIFIED

* Actually inspected
* Actually executed
* Actually tested

ASSUMED

* Reasonable inference
* Not directly verified

UNKNOWN

* Requires additional inspection/testing

# 5. TASK WORKFLOW

Every meaningful feature or bug should follow this process.

STEP 1 — DEFINE THE PROBLEM

The product owner describes:

* What is wrong
* What is expected
* What should remain unchanged

If the problem is ambiguous, investigate before coding.

STEP 2 — ANALYZE

Identify:

* Relevant files
* Relevant components
* Relevant hooks
* Relevant business logic
* Dependencies
* Potential side effects

Do not immediately start modifying files.

STEP 3 — DEFINE ACCEPTANCE CRITERIA

Before implementation, establish what "done" means.

Example:

* Light mode background becomes light.
* Text remains readable.
* Dark mode remains visually unchanged.
* Mobile layout remains unchanged.
* No financial calculation code changes.
* Typecheck passes.
* Tests pass.
* Build passes.

STEP 4 — IMPLEMENT

Use the most appropriate AI agent.

Prefer:

* Jules for large repository-level implementation
* Claude Code for interactive/complex implementation
* Gemini for secondary implementation or review
* ChatGPT for architecture/planning/review

STEP 5 — VERIFY

At minimum, when applicable:

npm run typecheck
npm run test
npm run build

Never claim a command passed unless it was actually executed.

STEP 6 — REVIEW THE DIFF

Check:

git status
git diff
git diff --stat

Look for:

* Unrelated changes
* Accidental deletions
* Duplicated logic
* Unnecessary dependencies
* Hardcoded values
* Security problems
* Business logic changes
* UI regressions

STEP 7 — INDEPENDENT REVIEW

For important changes, use another AI to review the implementation.

Example:

Jules implements
↓
Gemini or Claude reviews
↓
ChatGPT reviews the review
↓
Product owner decides

STEP 8 — COMMIT

Use focused commits.

Good:

fix: correct pending receivable status

Bad:

update everything

Commit messages should describe the actual change.

STEP 9 — PUSH / MERGE

Never assume a change is on GitHub merely because it exists locally.

Verify:

git status
git log --oneline -5

When appropriate:

git push origin <branch>

# 6. GIT SAFETY

Never casually modify main.

Prefer:

main
↓
feature/fix branch
↓
implementation
↓
testing
↓
review
↓
merge

Do not overwrite working changes without confirmation.

Before destructive operations:

* Check git status.
* Understand what will be affected.
* Preserve unrelated work.

# 7. FINANCIAL LOGIC SAFETY

Finance Tracker contains financial calculations.

Treat financial logic as HIGH RISK.

Examples include:

* Payday calculations
* Wallet allocation
* Receivables
* Bills
* Loans
* Historical ledger
* Income
* Expenses
* Transfers
* Baselines
* Recurring calculations

If the task is UI-only:

DO NOT modify financial calculations.

If financial logic must change:

1. Explain the existing behavior.
2. Explain the proposed behavior.
3. Identify affected functions.
4. Add/update tests.
5. Run the complete test suite.

# 8. THEME / UI RULES

The application supports:

* Dark
* Light
* System

Use the existing semantic theme infrastructure.

Prefer semantic theme classes/tokens.

Avoid introducing:

* Hardcoded dark-only backgrounds
* Hardcoded white text
* Hardcoded dark borders
* Arbitrary CSS override layers
* Duplicate theme systems

Do not change intentional accent colors unless requested.

Preserve:

* Layout
* Responsiveness
* Existing visual hierarchy
* Accessibility
* Dark theme appearance

When fixing Light mode, fix the underlying component styling whenever possible rather than masking the problem with large CSS overrides.

# 9. MOBILE RULE

Every UI change must consider mobile.

Do not assume desktop layout is sufficient.

When changing:

* Tables
* Modals
* Cards
* Navigation
* Forms
* Buttons

Check mobile behavior.

# 10. SECURITY

Never commit:

* API keys
* OAuth secrets
* passwords
* tokens
* .env files
* private credentials

Do not expose:

* authentication secrets
* database credentials
* payment credentials
* private user data

Treat authentication, cloud sync, and payment systems as security-sensitive.

# 11. DEPENDENCIES

Do not add a dependency just because it makes one small task easier.

Before adding a dependency:

* Check whether existing libraries already solve the problem.
* Consider bundle size.
* Consider maintenance.
* Consider security.
* Explain why it is needed.

# 12. TESTING PHILOSOPHY

Tests should protect behavior, not merely increase test count.

When fixing a bug:

1. Reproduce the bug.
2. Identify the cause.
3. Add a regression test when practical.
4. Implement the fix.
5. Run the affected tests.
6. Run the full suite.

Financial calculation changes should have tests.

# 13. AI IMPLEMENTATION RULE

AI agents should not perform broad changes from vague instructions.

Avoid:

"Fix everything."

Prefer:

"Fix the Light-mode text contrast in the Settings modal without changing functionality or business logic. Replace hardcoded neutral text classes with existing semantic theme tokens. Preserve Dark mode. Run typecheck, tests, and build."

# 14. WHEN AN AI FINDS A PROBLEM

The AI should not immediately rewrite the code.

First report:

1. Root cause
2. Affected files
3. Why it happens
4. Proposed fix
5. Potential side effects
6. Tests required

Then implement after the scope is clear.

# 15. WHEN AN AI IS UNSURE

Do not guess.

State:

"I found two possible implementations. Option A does X. Option B does Y. The current repository appears to favor A because..."

Then recommend based on documented repository architecture, not personal preference.

# 16. REVIEW FORMAT

When reviewing an AI-generated implementation, use:

## Summary

What the implementation does.

## Correct

What was implemented correctly.

## Problems

Specific issues.

## Risks

Potential regressions or technical debt.

## Missing

Things the implementation failed to address.

## Tests

Tests actually executed.

## Recommendation

Whether the implementation should:

* Be approved
* Be revised
* Be rejected

Do not give an approval based only on compilation.

# 17. PUBLIC LAUNCH STANDARD

Before public launch, prioritize:

* Authentication
* User data isolation
* Secure cloud storage
* Error handling
* Backup/recovery
* Financial calculation correctness
* Responsive UI
* Accessibility
* Performance
* Security
* Privacy
* Terms/privacy requirements
* Subscription/payment handling
* Monitoring
* Analytics
* Production deployment
* Regression testing

# 18. PRODUCT DEVELOPMENT PRIORITY

When deciding what to build next, prioritize:

P0 — Critical

* Security
* Data integrity
* Authentication
* Financial calculation correctness
* Production-breaking bugs

P1 — Important

* Core user workflows
* Reliability
* Mobile UX
* Performance
* Important user-facing bugs

P2 — Product quality

* UI polish
* Analytics
* Advanced features
* Convenience features

P3 — Nice to have

* Experimental features
* Cosmetic improvements
* Low-impact enhancements

# 19. MASTER RULE

The goal is NOT:

"Make the AI write as much code as possible."

The goal is:

"Build a reliable, maintainable, secure, monetizable product with the smallest reasonable amount of complexity."

Prefer:

* Small changes
* Clear architecture
* Tested behavior
* Reusable systems
* Explicit decisions
* Verifiable results

Avoid:

* Quick hacks
* Giant rewrites
* Duplicate systems
* Unverified claims
* Unnecessary dependencies
* AI-generated complexity

# 20. FINAL PRINCIPLE

The human product owner makes the final decision.

AI systems provide:

* Analysis
* Implementation
* Review
* Alternatives
* Warnings

AI systems do not automatically decide:

* Product direction
* Pricing
* User policy
* Security tradeoffs
* Architecture changes with major consequences

The objective is to make the product owner better informed and more capable of making those decisions.
