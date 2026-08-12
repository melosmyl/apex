import React from "react";
import LegalLayout from "@/components/LegalLayout";
import { PRODUCT_NAME, PRODUCT_DOMAIN } from "@/lib/branding";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="12 August 2026">
      <section>
        <h2>The short version</h2>
        <p>
          {PRODUCT_NAME} runs your board meetings by sending your questions and company context to AI providers
          (OpenAI and Anthropic) to generate advisor responses. Everything you type — company details, meeting
          questions, decisions, tasks, notes — is stored in our database, hosted in the EU. We don't sell your
          data, we don't show you ads, and we don't use any third-party analytics or tracking. If you try a free
          board meeting without an account, that data is automatically deleted after 30 days unless you keep it.
          The rest of this page explains all of that in more detail.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <p>Depending on how you use {PRODUCT_NAME}, we collect:</p>
        <ul>
          <li><strong>Company details</strong> — name, description, industry, stage, and anything else you tell your board about your business.</li>
          <li><strong>Board meeting content</strong> — the questions you ask, the full advisor discussion, and the board's final resolution.</li>
          <li><strong>Decisions</strong> — what you decided to do after a meeting, kept so future board meetings can recall and build on it.</li>
          <li><strong>Tasks</strong> — anything you or an advisor assigns as follow-up work.</li>
          <li><strong>Notes</strong> — anything you capture through the Assistant between meetings.</li>
          <li><strong>Account details</strong> — your email address, and nothing else if you sign up directly (no separate password is stored by us; authentication is handled by our infrastructure provider, Supabase).</li>
        </ul>
        <p>
          We do not currently collect payment or billing information — there is no live payment processing on
          {" "}{PRODUCT_NAME} today.
        </p>
      </section>

      <section>
        <h2>How your board meetings actually work</h2>
        <p>
          When you ask your board a question, we send that question — along with relevant company context, past
          decisions, and the ongoing discussion — to AI models operated by <strong>OpenAI</strong> and{" "}
          <strong>Anthropic</strong> via their APIs, so each advisor can generate a real response. This is the
          core of the product: without sending this data to those providers, there is no board meeting.
        </p>
        <p>
          Both OpenAI and Anthropic state that data submitted through their business/API products (as opposed to
          their consumer chat apps) is <strong>not used to train their models</strong> by default. We rely on
          those providers' own API terms for this — if you want the specifics, they're published by OpenAI and
          Anthropic directly, and we'd encourage you to read them if this matters to you.
        </p>
        <p>
          Because OpenAI and Anthropic are US-based companies, this means your board meeting content is
          transmitted to and processed in the United States for the moment it takes to generate a response, even
          though your data is stored in the EU (see below). We also use OpenAI's embeddings model to power
          semantic search over your past decisions and notes, so your board can recall what's actually relevant
          to a new question rather than just what's recent.
        </p>
      </section>

      <section>
        <h2>Where your data lives</h2>
        <p>
          Your data is stored in a Postgres database and file storage operated by <strong>Supabase</strong>, our
          infrastructure provider, hosted in <strong>Ireland (AWS eu-west-1)</strong> — inside the EU. Generated
          documents (financial models, decks, reports) are stored the same way.
        </p>
      </section>

      <section>
        <h2>Other services we use</h2>
        <ul>
          <li><strong>Cloudflare Turnstile</strong> — checks that a real person, not a bot, is starting a free board meeting. It doesn't show puzzles or track you across other sites.</li>
          <li><strong>Resend</strong> — sends account and confirmation emails on our behalf, from an address at {PRODUCT_DOMAIN}.</li>
        </ul>
        <p>We don't use Google Analytics, advertising pixels, or any other third-party tracking. The only cookies/local storage we use are functional — keeping you signed in.</p>
      </section>

      <section>
        <h2>Free board meetings, no account</h2>
        <p>
          You can try one board meeting without creating an account. Behind the scenes this still creates a
          temporary, anonymous session so the meeting can run — but it's not linked to your name or email unless
          you choose to keep the result.
        </p>
        <p>
          <strong>If you don't convert it to a real account, everything from that session — the company profile,
          the meeting, the decision — is automatically and permanently deleted 30 days after you started it.</strong>{" "}
          This runs on an automated schedule; there's nothing you need to do, and nothing we do with it in the
          meantime beyond running the meeting itself.
        </p>
      </section>

      <section>
        <h2>How long we keep your data</h2>
        <p>
          If you have a real account, we keep your data for as long as your account is active, so your board can
          keep building on past meetings and decisions the way it's designed to. If you delete your account (see
          below), we delete the data that belongs to it.
        </p>
      </section>

      <section>
        <h2>Who can see your data</h2>
        <p>
          Your board meetings, decisions, and notes are visible only to you. We don't share your business
          information with other users, and different companies' data is kept separate. The only outside parties
          your data passes through are the ones named on this page — OpenAI and Anthropic (to run your board
          meetings), Supabase (to store everything), Cloudflare (bot protection), and Resend (email delivery) —
          each only for the specific job described above.
        </p>
      </section>

      <section>
        <h2>Your rights, and how to delete your data</h2>
        <p>
          You can ask us to delete your account and everything attached to it — company, meetings, decisions,
          tasks, notes, documents — at any time. There's no self-service delete button yet, so email{" "}
          <a href="mailto:melody.m.p.j@icloud.com?subject=Delete my account">melody.m.p.j@icloud.com</a> from the
          address on your account and we'll delete it by hand. You can also ask what data we hold about you, or
          ask us to correct anything that's wrong.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We take reasonable steps to protect your data — access controls on our database, encrypted connections
          throughout — but no system is completely secure, and we can't guarantee absolute protection against
          every possible attack.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>{PRODUCT_NAME} is intended for people starting or running a business and isn't directed at children. We don't knowingly collect data from anyone under 16.</p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>If this changes in a way that matters — a new provider, a new kind of data we collect — we'll update this page and change the date at the top.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about any of this: <a href="mailto:melody.m.p.j@icloud.com">melody.m.p.j@icloud.com</a>.</p>
      </section>
    </LegalLayout>
  );
}
