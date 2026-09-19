/* Alexander Bots — sample vault notes.
 * Exposes window.VAULT_NOTES: an array of {id, title, updated, body, links}.
 * Bodies are markdown; [[note-id]] marks a wiki-style link. The `links`
 * array mirrors the wiki-links in the body and is what the graph + reader
 * use to draw edges between notes.
 * These are realistic sample notes for a fictional-but-plausible deployment.
 */

(function () {
  'use strict';

  window.VAULT_NOTES = [
    {
      id: 'welcome',
      title: 'Welcome to your vault',
      updated: '2026-09-18',
      body: [
        '# Welcome to your vault',
        '',
        'This is your personal knowledge vault — a small collection of notes that you and your bots share. Think of it as a long-term memory: anything worth keeping goes here, and your bots can read it and write to it on your behalf.',
        '',
        '## How it works',
        '',
        '- **Notes** are markdown files. Write plainly, use headings and lists, and link notes together with [[double brackets]].',
        '- **Links** connect ideas. When a note links to another, the [[activity-log|graph]] draws an edge between them — the more links a note has, the bigger its node.',
        '- **Your bots** can read notes, append to them, and create new ones. Ask your assistant to "log this in the vault" and it will be stored.',
        '',
        '## Where to start',
        '',
        '- Read the [[activity-log]] to see what your bots have been working on this week.',
        '- Open the [[conversations]] note for summaries of recent chats.',
        '- If you are unsure which AI model to use, the [[models-guide]] walks through speed, smarts, and cost tradeoffs.',
        '',
        '> Your vault lives entirely on this device. Notes are stored locally and synced with your bots — nothing is uploaded anywhere unless you ask for it.'
      ].join('\n'),
      links: ['activity-log', 'conversations', 'models-guide']
    },
    {
      id: 'activity-log',
      title: 'Activity Log',
      updated: '2026-09-18',
      body: [
        '# Activity Log',
        '',
        'A running record of work your bots have done. Entries are appended automatically as tasks complete.',
        '',
        '## 2026-09-18',
        '',
        '- Researched direct flights NYC → London for the November trip and logged the best options with prices.',
        '- Drafted three outreach emails for the Alexander AI Solutions beta launch and saved them to drafts for review.',
        '- Synced the help pages with the latest settings screen changes.',
        '- Rewrote the [[models-guide]] section on context length after switching the default model.',
        '',
        '## 2026-09-17',
        '',
        '- Drafted outreach emails for five partner contacts (see [[conversations]] for the brief that prompted them).',
        '- Reorganized the vault: renamed two notes, fixed three broken links, and re-rendered the graph.',
        '- Set up the nightly research cron — it now scans for OpenRouter model updates and appends new entries here.',
        '',
        '## 2026-09-16',
        '',
        '- Pulled the latest help pages from the docs repo and synced them into the vault.',
        '- Exported last week\'s conversation summaries into [[conversations]].',
        '- Backed up the vault (4 notes, 7 links) to local storage.',
        '',
        '> Ask your assistant "what did you work on this week?" and it will answer from this log.'
      ].join('\n'),
      links: ['welcome', 'conversations', 'models-guide']
    },
    {
      id: 'conversations',
      title: 'Conversations',
      updated: '2026-09-17',
      body: [
        '# Conversations',
        '',
        'Short summaries of recent chats, so you never have to remember where a decision was made.',
        '',
        '## Sep 17 — Outreach emails (morning)',
        '',
        'Drafted beta-launch outreach for five partner contacts. Settled on a short, plain-language template: one line of context, one line of ask, one signature. Open follow-up: whether to send Thursday or Friday morning.',
        '',
        '## Sep 16 — Model picker walkthrough (evening)',
        '',
        'Walked through the in-app model picker in Settings. Decided the default model should stay balanced (fast enough for chat, smart enough for drafting). Read the [[models-guide]] for the full reasoning.',
        '',
        '## Sep 15 — Flight research (afternoon)',
        '',
        'Compared direct flights for the November London trip. Shortlisted two evening departures; prices logged in the [[activity-log]]. Waiting on the traveler\'s preferred arrival time before booking.',
        '',
        '## Sep 14 — Vault setup (morning)',
        '',
        'Created the first vault notes and wired up the [[welcome|graph]]. Decided the vault, not chat history, is the durable memory — summaries land here automatically.'
      ].join('\n'),
      links: ['models-guide', 'activity-log', 'welcome']
    },
    {
      id: 'models-guide',
      title: 'Choosing a model',
      updated: '2026-09-18',
      body: [
        '# Choosing a model',
        '',
        'Your assistant can use many different AI models through OpenRouter. You switch models any time from the **model picker** in Settings — no restart needed.',
        '',
        '## Speed vs smarts vs cost',
        '',
        '- **Speed:** smaller models answer in a second or two. Great for chat, quick questions, and drafting.',
        '- **Smarts:** frontier models reason harder and write better. Worth it for planning, coding, and anything you will publish.',
        '- **Cost:** OpenRouter charges per million tokens (input + output). Drafting emails on a big model is cheap; running a big model all day adds up.',
        '',
        '## What "context length" means',
        '',
        'Context length is how much text a model can see at once — your message, recent chat history, and any vault notes it pulls in. Longer context means the model remembers more, but it also costs more per request. If a model ever truncates a long [[activity-log]], that is why.',
        '',
        '## The default model',
        '',
        'The app ships with a balanced default: fast enough for everyday chat, smart enough for drafting and research. Switch to a frontier model when quality matters, switch down when speed matters.',
        '',
        '## Tips',
        '',
        '- Start with the default; only change it when you feel a real difference.',
        '- Use a fast model for routine work and a smart one for one-off important tasks.',
        '- Your API key, usage, and model choice never leave this device except in calls to OpenRouter itself.'
      ].join('\n'),
      links: ['activity-log', 'welcome']
    }
  ];
})();
