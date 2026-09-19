/* Alexander Bots — help pages.
 * Exposes window.HELP_PAGES: an array of
 * {slug, title, intro, sections: [{h, html}]}.
 * `html` strings are already-safe HTML (written by hand, no user input). */

(function () {
  'use strict';

  window.HELP_PAGES = [
    {
      slug: 'getting-started',
      title: 'Getting started',
      intro: 'New here? This is the five-minute tour: add your API key, pick a model, and start talking to your bots.',
      sections: [
        {
          h: 'What Alexander Bots is',
          html: '<p>Alexander Bots is the mobile and desktop companion for your Alexander AI Solutions bots. It gives you a chat interface for your bots, a personal <a href="#" data-help="vault-and-graph">vault</a> of notes that you and your bots share, and a graph view that shows how those notes connect.</p>'
        },
        {
          h: 'Step 1 — Add your API key',
          html: '<p>The app talks to AI models through <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter</a>. Open <strong>Settings</strong>, paste your key, and save. You only do this once per device — the key is stored on your device and never sent anywhere except to OpenRouter. See <a href="#" data-help="api-keys">API keys</a> for the full walkthrough.</p>'
        },
        {
          h: 'Step 2 — Pick a model',
          html: '<p>In <strong>Settings</strong>, use the model picker to choose which AI answers you. There is a balanced default that suits most people; you can switch any time. See <a href="#" data-help="models">Models</a> for how to choose.</p>'
        },
        {
          h: 'Step 3 — Start a conversation',
          html: '<p>Tap <strong>Chat</strong> and say hello. Your assistant can answer questions, draft text, research the web, and — with your permission — read and write to your vault so it remembers things for you.</p>'
        },
        {
          h: 'Step 4 — Explore your vault',
          html: '<p>The <strong>Vault</strong> tab shows your notes. The app starts with four sample notes; tap any note to read it, or tap <strong>Graph</strong> to see them as a glowing constellation. Notes you create or ask your bots to create appear here automatically.</p>'
        }
      ]
    },
    {
      slug: 'your-bots',
      title: 'Your bots',
      intro: 'What your bots are, what they can do, and how to get the most out of them.',
      sections: [
        {
          h: 'What a bot is',
          html: '<p>A bot is your assistant — the same helpful AI whether you talk to it on your phone, desktop, or the web. It carries your context with it: your vault notes, your preferences, and what it has been working on.</p>'
        },
        {
          h: 'What bots can do',
          html: '<ul><li><strong>Answer questions</strong> and explain things in plain language.</li><li><strong>Draft and edit</strong> — emails, messages, documents, code.</li><li><strong>Research the web</strong> and summarize what it finds.</li><li><strong>Read and write your vault</strong> — ask it to log a decision, and it stores a note.</li><li><strong>Work on a schedule</strong> — recurring check-ins and reminders.</li></ul>'
        },
        {
          h: 'Talking to your bot',
          html: '<p>Be specific and give context. "Draft a follow-up email" works; "Draft a follow-up email to Maya at the partner firm, keep it to three sentences, friendly tone" works much better. If something is important, tell your bot why — it shapes the result.</p>'
        },
        {
          h: 'Asking your bot to remember things',
          html: '<p>Your bot\'s memory of a single chat is limited. For anything durable — a decision, a preference, a running list — say "log this in the vault" and it will write a note or append to an existing one. The <a href="#" data-help="vault-and-graph">vault</a> is the long-term memory; chat is the short-term one.</p>'
        },
        {
          h: 'Bots and privacy',
          html: '<p>Your bots only see what you give them: your messages, your vault notes, and the tools you have connected. They cannot browse your phone, read files you have not shared, or take actions (like sending messages or booking things) without your explicit say-so in that moment.</p>'
        }
      ]
    },
    {
      slug: 'vault-and-graph',
      title: 'The vault & graph',
      intro: 'Your shared notebook with your bots — and the constellation view that makes its connections visible.',
      sections: [
        {
          h: 'What the vault is',
          html: '<p>The vault is a small collection of markdown notes that you and your bots share. It is your durable memory: decisions, logs, summaries, guides. Notes are plain text with formatting (headings, lists, bold), so they are readable anywhere, forever.</p>'
        },
        {
          h: 'Notes and links',
          html: '<p>Notes link to each other with <code>[[double brackets]]</code> — for example, writing <code>[[activity-log]]</code> links to the Activity Log note. Tap a wiki-link to jump to that note. The app ships with four sample notes showing how linking works; you can edit, rename, or delete them.</p>'
        },
        {
          h: 'The graph view',
          html: '<p>The <strong>Graph</strong> tab draws your notes as a glowing constellation. Each note is a node — bigger when it has more links — and each link is a line between them. Gold nodes are the best-connected hubs; azure and violet nodes are more specialized.</p>'
        },
        {
          h: 'Exploring the graph',
          html: '<ul><li><strong>Drag a node</strong> to move it; the layout settles around it.</li><li><strong>Drag the background</strong> to pan; <strong>pinch or scroll</strong> to zoom.</li><li><strong>Tap a node</strong> to open that note. Hovering shows the note\'s name and link count.</li><li>Type in the <strong>search box</strong> to dim every note that does not match — handy once your vault grows.</li></ul>'
        },
        {
          h: 'Where your notes live',
          html: '<p>Notes are stored on this device (in your browser\'s local storage). They are not uploaded to any server. If you use multiple devices, each has its own copy for now — sync between devices is on the roadmap.</p>'
        }
      ]
    },
    {
      slug: 'api-keys',
      title: 'API keys',
      intro: 'How to get your OpenRouter key, how to change it in the app, and where it lives.',
      sections: [
        {
          h: 'Why you need a key',
          html: '<p>Alexander Bots does not include its own AI access — you bring your own via <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">OpenRouter</a>, which routes your requests to many AI models through one key. Without a key, the chat screen will remind you to add one before you can talk to a model.</p>'
        },
        {
          h: 'Getting a key',
          html: '<ol><li>Go to <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a> and sign in (or create a free account).</li><li>Click <strong>Create Key</strong>, give it a name like "Alexander Bots".</li><li>Copy the key — it starts with <code>sk-or-v1-</code> — and add a little credit to your OpenRouter account so requests can be billed.</li></ol><p>Treat your key like a password: anyone with it can spend your OpenRouter credit.</p>'
        },
        {
          h: 'Adding or changing your key in the app',
          html: '<p>Open <strong>Settings</strong>, find the <strong>OpenRouter API key</strong> field, paste your key, and save. To change it later, come back to the same field, paste the new key, and save again — the old key is replaced immediately.</p>'
        },
        {
          h: 'Where your key is stored',
          html: '<p>Your key is stored on this device only, in the app\'s local storage. It is sent to OpenRouter — and only to OpenRouter — when the app calls a model. It is never sent to Alexander AI Solutions, never logged, and never shared with other apps. On a shared device, clear the key from Settings before handing the device to someone else.</p>'
        }
      ]
    },
    {
      slug: 'models',
      title: 'Models',
      intro: 'How the model picker works, what the settings mean, and how to choose well.',
      sections: [
        {
          h: 'How the model picker works',
          html: '<p>In <strong>Settings</strong>, the model picker lists the models available through OpenRouter — fetched live from OpenRouter\'s model list. Pick one and it becomes your assistant\'s brain immediately; no restart, no re-login. You can switch as often as you like.</p>'
        },
        {
          h: 'The default model',
          html: '<p>The app ships with a balanced default: fast enough that everyday chat feels instant, smart enough for drafting, research, and vault work. It is a good home base — change it only when you notice a real reason to, like needing sharper reasoning or cheaper long chats.</p>'
        },
        {
          h: 'What context length means',
          html: '<p>Context length is how much text a model can hold in mind at once — your message, the recent conversation, and any vault notes it pulls in. Longer context means the model remembers more of the conversation and reads longer notes. The tradeoff: long-context requests cost more and can respond more slowly.</p>'
        },
        {
          h: 'Cost and speed tradeoffs',
          html: '<ul><li><strong>Fast and cheap:</strong> smaller models answer in a second or two and cost fractions of a cent per chat. Ideal for quick questions and routine drafting.</li><li><strong>Smart and slower:</strong> frontier models reason harder, write better, and handle complex tasks — at several times the cost per request.</li><li><strong>Long context:</strong> models with big context windows read more but cost more per request.</li></ul><p>A practical rule: use a fast model for everyday chat, switch to a frontier model for work you will publish or rely on.</p>'
        },
        {
          h: 'If a model misbehaves',
          html: '<p>Every so often a model is slow, returns an error, or gives a poor answer. Try again, or switch to another model in the picker — most problems are model-side and transient. See <a href="#" data-help="troubleshooting">Troubleshooting</a> if errors persist.</p>'
        }
      ]
    },
    {
      slug: 'installing-the-mobile-app',
      title: 'Installing the mobile app',
      intro: 'Get Alexander Bots on your Android phone — either as a native app or as a home-screen shortcut.',
      sections: [
        {
          h: 'Option 1 — Native app (sideload the APK)',
          html: '<p>The native Android app is distributed as an APK you install directly — it is not on the Google Play Store.</p><ol><li>Open the <strong>Download mobile app</strong> page (the button in the top-right corner of the desktop and web app) on your phone.</li><li>Scan the QR code or tap the download link to get the APK file.</li><li>When Android asks, allow <strong>"Install unknown apps"</strong> for your browser — this is normal for apps installed outside the Play Store.</li><li>Open the downloaded APK and confirm the install.</li></ol>'
        },
        {
          h: 'Keeping the app updated',
          html: '<p>Because the app is sideloaded, updates do not arrive automatically. When a new version is released, revisit the download page on your phone and install the new APK over the old one — your settings, API key, and vault notes are preserved.</p>'
        },
        {
          h: 'Option 2 — Add to Home Screen (PWA)',
          html: '<p>If you prefer not to sideload, the web app works as a Progressive Web App:</p><ol><li>Open the web app in Chrome on your phone.</li><li>Tap the <strong>⋮ menu → "Add to Home screen"</strong> (or "Install app" if offered).</li><li>The app appears on your home screen with its own icon and opens full-screen, like a native app.</li></ol><p>The PWA has the same chat, vault, and graph as the native app.</p>'
        },
        {
          h: 'Which should I choose?',
          html: '<p>Choose the <strong>native APK</strong> for the fullest experience and a proper app icon in your app drawer. Choose the <strong>PWA</strong> if you want something quick, update-free, and easy to remove. Both store your data on your device the same way.</p>'
        }
      ]
    },
    {
      slug: 'troubleshooting',
      title: 'Troubleshooting',
      intro: 'Fixes for the most common problems, roughly in the order you are likely to hit them.',
      sections: [
        {
          h: '"No API key" message',
          html: '<p>You will see this when the app has no OpenRouter key saved (or the saved one was cleared). Open <strong>Settings</strong> and paste your key — see <a href="#" data-help="api-keys">API keys</a> for how to get one. Double-check for extra spaces at the start or end of the pasted key.</p>'
        },
        {
          h: 'Model errors',
          html: '<ul><li><strong>"Insufficient credit":</strong> your OpenRouter account is out of funds — top up at <a href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer">openrouter.ai/credits</a>.</li><li><strong>"Model not found" or 404:</strong> the model was renamed or retired; pick another in the model picker.</li><li><strong>Timeouts or 500s:</strong> usually transient — wait a minute and retry, or switch to a different model.</li><li><strong>"Invalid API key":</strong> the key was revoked or mistyped; generate a fresh one and re-enter it in Settings.</li></ul>'
        },
        {
          h: 'Offline behavior',
          html: '<p>The app\'s interface, vault notes, settings, and graph all work offline — they live on your device. Only features that call an AI model (chat, bot-written notes) need an internet connection. If you are offline, those will tell you so instead of failing silently.</p>'
        },
        {
          h: 'Where your data is stored',
          html: '<p>Everything — your API key, model choice, vault notes, and settings — is stored in this device\'s local storage (your browser\'s or the app\'s private storage). Clearing the app\'s data or uninstalling the app permanently deletes it. There is no cloud backup yet, so if your notes matter, ask your assistant to export them periodically.</p>'
        },
        {
          h: 'Still stuck?',
          html: '<p>Try these in order: restart the app, re-enter your API key, switch to the default model, and clear the app\'s cache. If the problem persists, note exactly what you tapped and what the error said — that detail is what makes a bug report fixable.</p>'
        }
      ]
    },
    {
      slug: 'privacy-and-data',
      title: 'Privacy & data',
      intro: 'Plain answers about what the app knows, where it goes, and what it never does.',
      sections: [
        {
          h: 'What stays on your device',
          html: '<p>Your API key, your model choice, your vault notes, and your settings never leave this device — with one exception below. There is no account to sign into, no analytics beacon, and no server-side copy of anything you type.</p>'
        },
        {
          h: 'What goes to OpenRouter',
          html: '<p>When you chat with a model, your messages (and any vault notes the bot pulls in for context) are sent to OpenRouter so the model can respond. That is the only network call the app makes with your data. OpenRouter routes the request to the model provider you chose; their data policies apply to the request itself.</p>'
        },
        {
          h: 'What we never do',
          html: '<ul><li>Never sell, rent, or share your data.</li><li>Never send your API key anywhere except OpenRouter.</li><li>Never train models on your notes or chats.</li><li>Never access your device\'s files, contacts, or location.</li></ul>'
        },
        {
          h: 'Your control',
          html: '<p>Your data is yours. Change or delete your API key in Settings any time; edit or delete any vault note; clear the app\'s storage to wipe everything at once. Because everything is local, deleting it here deletes it everywhere it exists.</p>'
        }
      ]
    }
  ];
})();
