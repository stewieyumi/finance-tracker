# Apple Shortcut automatic expense saving

Settings → General → Quick Expense offers the signed public preset and an account-specific connection. Choose an active, synced payment wallet, create the connection, and paste its one-time key into the preset's import question. Then assign Finance Tracker Quick Expense in iPhone Settings → Accessibility → Touch → Back Tap. Import and Back Tap assignment require user interaction.

The preset asks for amount, category, and merchant, then asks for confirmation. It sends an HTTPS JSON POST to the canonical Finance Tracker domain; no browser or Google credential is embedded. Only the public template is distributed. A configured shortcut contains its private expense-only key and must not be shared.

Each account has one active connection, bound to its chosen wallet, expiring after 30 days. Replace or Disconnect revokes the old key. Keys are hashed at rest. Management requires the existing bound browser session and a same-origin custom header. A shortcut key cannot read transaction history, manage connections, select another account/wallet, or call cloud sync.

A request's UUID identifies that save attempt. The expense, wallet debit, new OCC revision, and idempotency receipt are committed atomically with string CAS. A retry with the same UUID and details returns the original receipt; changed details using the UUID are rejected. Retries read the latest cloud snapshot, preserving other writers' changes. Stale browser sync writes use the existing conflict flow. Existing expense deletion/refund uses deductedAmount.

A successful response says Saved. There is no offline queue or automatic claim of success. If a request is interrupted, check History before starting a NEW shortcut run; a fresh run creates a new request ID. Insufficient/missing/archived wallets do not deduct. A revoked or expired connection must be reconnected. No existing data migration or new environment secret is required.

## Rebuilding the public preset on macOS

Run `python3 scripts/build-quick-expense-shortcut.py --output /tmp/ft-quick-expense.wflow`, then `shortcuts sign --mode anyone --input /tmp/ft-quick-expense.wflow --output "public/shortcuts/Finance Tracker Quick Expense.shortcut"`. Apple's signing service receives the public template for validation. Never sign or commit a preset with a real private key. The unsigned source contains a placeholder and an import question.

Before release, import the signed artifact into Shortcuts and verify the action list, import question, amount/category/merchant prompts, confirmation, JSON body, response display, cancellation, and interrupted-save guidance. Use only a disposable local/test connection. On the owner's iPhone after deployment, check Add Shortcut, Back Tap, default wallet selection, one expense and one reversal, repeat-request protection, and Disconnect. Automated tests cover account isolation, CAS conflicts, and failure paths; they do not replace native import/run validation.
