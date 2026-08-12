import React from "react";
import LegalLayout from "@/components/LegalLayout";
import { PRODUCT_NAME } from "@/lib/branding";

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated="12 August 2026">
      <section>
        <h2>What this is</h2>
        <p>
          {PRODUCT_NAME} gives you an AI board of advisors — a Chair and a team of specialist personas — who
          debate the questions you bring them and produce a recommendation. By using {PRODUCT_NAME}, you're
          agreeing to these terms.
        </p>
      </section>

      <section>
        <h2>Your board is AI, not licensed professionals</h2>
        <p>
          <strong>This is the most important thing on this page.</strong> Every advisor on your board is an AI
          persona. Nothing your board says is legal, financial, tax, medical, or other licensed professional
          advice, even when it's phrased that way — and none of it is checked by a real person before you see
          it. Your board can be wrong, can miss something a real professional wouldn't, and can occasionally
          disagree with itself, on purpose, because genuine disagreement is part of how it's designed to work.
        </p>
        <p>
          The board advises. You decide. Nothing on {PRODUCT_NAME} replaces your own judgment or a real
          professional's advice for decisions that actually require one — hiring a lawyer, an accountant, or a
          doctor is still on you.
        </p>
      </section>

      <section>
        <h2>Accounts and free board meetings</h2>
        <p>
          You can try one board meeting for free, with no account and no card. Each free meeting costs us real
          money to run (it's genuinely powered by paid AI providers, not a demo), so we limit it to one per
          person. If you'd like to keep the result, you can turn it into a real account with just your email —
          the company, meeting, and advisors carry over exactly as they were, nothing is lost or recreated.
        </p>
        <p>
          For a real account, you're responsible for keeping your login secure and for what happens under your
          account.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          What you put into {PRODUCT_NAME} — your company details, questions, and everything your board
          produces — is yours. We need your permission to send it to the AI providers that generate your board's
          responses (that's the whole product), and to store it so your board can build on past meetings and
          decisions. We don't use it for anything beyond running {PRODUCT_NAME} for you.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>Don't use {PRODUCT_NAME} to:</p>
        <ul>
          <li>Try to break, overload, or abuse the free board meeting (creating repeat accounts to bypass the one-meeting limit, for example)</li>
          <li>Attempt to extract, scrape, or reverse-engineer the underlying AI systems</li>
          <li>Use the service for anything illegal, or to generate content intended to harm someone</li>
        </ul>
      </section>

      <section>
        <h2>Pricing</h2>
        <p>
          {PRODUCT_NAME} is currently free to use. If we introduce paid plans, we'll tell you clearly before you're
          asked to pay anything, and update these terms to describe what you're actually getting.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          {PRODUCT_NAME} depends on third-party AI providers to run board meetings. Occasionally an advisor may
          be temporarily unavailable, or a meeting may take longer than usual — we try to make that visible
          rather than silent, but we can't guarantee the service is available every moment.
        </p>
      </section>

      <section>
        <h2>Ending your account</h2>
        <p>
          You can ask us to delete your account at any time — see the Privacy Policy for how. We may suspend or
          end an account that violates the acceptable use terms above.
        </p>
      </section>

      <section>
        <h2>No warranty, limited liability</h2>
        <p>
          {PRODUCT_NAME} is provided as-is. We don't guarantee your board's advice will be accurate, complete, or
          right for your specific situation — see "Your board is AI, not licensed professionals" above. To the
          extent the law allows, we're not liable for decisions you make based on what your board tells you, or
          for losses arising from using the service.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>If these change in a way that matters, we'll update this page and change the date at the top.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about any of this: <a href="mailto:melody.m.p.j@icloud.com">melody.m.p.j@icloud.com</a>.</p>
      </section>
    </LegalLayout>
  );
}
