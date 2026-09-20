/*
 * Computer tools — give a bot hands on its own virtual computer.
 *
 * WHY THIS FILE EXISTS. The OpenBot engine only offers a bot the computer tools if the CHAT CLIENT
 * registers them: the client's `tools` array is merged into the run (server/src/copilot.ts), the bot
 * emits TOOL_CALL_START/ARGS/END and then RUN_FINISHED, and the client executes the call and opens a
 * SECOND run carrying the result. The desktop shell does this in React
 * (app/src/lib/copilot/computer-tools.tsx, 13 registrations); this companion app did not, so a bot
 * reached through it had no web, no browser and no shell — it could only talk.
 *
 * This mirrors that reference against the same routes the "take the wheel" screen already uses
 * (`/api/computers/:botId/*`), in plain JS and with no build step. It is OUR client doing what the
 * shell's client does; the engine is untouched.
 *
 * The botId used here is the bot's agent id: the deployment keys each bot's computer by it, and
 * `computerId` in the reference is the same value (`bot.current`).
 */
'use strict';

/* Tool definitions, in the shape the run endpoint expects: {name, description, parameters(JSON Schema)}. */
var COMPUTER_TOOLS = [
  {
    name: 'computer_navigate',
    description:
      'Open a web page on your own computer so the person can watch. Use this when asked to look ' +
      'at, visit, open or check a website. Returns the page title and its readable text, so answer ' +
      'from what comes back rather than telling the person to go and look.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Full web address to open, including https://' } },
      required: ['url']
    }
  },
  {
    name: 'computer_read',
    description:
      'Read the page currently open on your computer, without opening anything. Use this after you ' +
      'click something that changes the page, such as submitting a form, to find out what it now says.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'computer_snapshot',
    description:
      'List the things on the current page you can act on: fields, buttons, links and checkboxes, ' +
      'each with a ref, its label and its current value. Call this BEFORE clicking or typing, and ' +
      'use the refs it returns. Always send back the snapshotId it gives you.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'computer_type',
    description:
      'Enter text into a field on the page. Give the ref of the field from your most recent snapshot ' +
      'and the snapshotId it came from. This replaces whatever the field already contains. Set submit ' +
      'to true to press Enter afterwards.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Ref of the field, from your most recent snapshot' },
        snapshotId: { type: 'number', description: 'The snapshotId that ref came from' },
        text: { type: 'string', description: 'The text to enter' },
        submit: { type: 'boolean', description: 'Press Enter after typing, to submit a single-field form' }
      },
      required: ['ref', 'snapshotId', 'text']
    }
  },
  {
    name: 'computer_click',
    description:
      'Click something on the page: a button, a link, a checkbox or a radio option. Give the ref from ' +
      'your most recent snapshot and the snapshotId it came from.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Ref of the element to click, from your most recent snapshot' },
        snapshotId: { type: 'number', description: 'The snapshotId that ref came from' }
      },
      required: ['ref', 'snapshotId']
    }
  },
  {
    name: 'computer_key',
    description:
      'Press a key, such as Enter, Tab or Escape. Give a ref to press it while a particular field is ' +
      'focused, or omit the ref to press it on the page.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name, such as Enter, Tab or Escape' },
        ref: { type: 'string', description: 'Optional ref to press the key on' },
        snapshotId: { type: 'number', description: 'The snapshotId the ref came from, required if ref is given' }
      },
      required: ['key']
    }
  },
  {
    name: 'computer_scroll',
    description:
      'Scroll the page down, or up with a negative amount, to bring more of a long page into view.',
    parameters: {
      type: 'object',
      properties: { deltaY: { type: 'number', description: 'Pixels to scroll; positive is down. Defaults to 600.' } }
    }
  },
  {
    name: 'computer_list_files',
    description:
      'List what is in your workspace: every file and folder you have saved, with sizes. Call this ' +
      'FIRST when you are asked what files you have, or before reading a file whose exact name you ' +
      'are not sure of. Never guess a filename.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Optional folder to list. Omit for the whole workspace.' } }
    }
  },
  {
    name: 'computer_read_file',
    description:
      'Read a file you saved earlier in your own workspace. Paths are relative to your workspace, ' +
      'such as notes.md or reports/august.csv. Your workspace survives between conversations.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to your workspace, such as notes.md' } },
      required: ['path']
    }
  },
  {
    name: 'computer_write_file',
    description:
      'Save a file in your own workspace so you still have it later. Paths are relative to your ' +
      'workspace and folders are created as needed. Set append to true to add to the end of an ' +
      'existing file rather than replacing it. Text only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to your workspace, such as reports/august.csv' },
        contents: { type: 'string', description: 'The text to save' },
        append: { type: 'boolean', description: 'Add to the end of the file instead of replacing it' }
      },
      required: ['path', 'contents']
    }
  },
  {
    name: 'computer_run_command',
    description:
      'Run a shell command on your own computer. Use this for anything the browser cannot do: ' +
      'installing a tool you need, processing a file you saved, running a script. The working ' +
      'directory is your workspace. Commands run in bash, so pipes and && work. Long output is ' +
      'truncated from the start, and a command that runs too long is stopped. You are not the root ' +
      'user; anything outside your workspace needs sudo, which asks for no password.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'The command to run, such as: ls -la' } },
      required: ['command']
    }
  },
  {
    name: 'computer_request_help',
    description:
      'Ask the person to take control of your computer and do something you cannot: sign in, enter a ' +
      'password or a one-time code, or clear a CAPTCHA. Say specifically what you need done. This ' +
      'call is the only thing that reaches them, so use it INSTEAD of giving up, and instead of ever ' +
      'asking them to type a password to you.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'What you need the person to do, in one sentence' } },
      required: ['reason']
    }
  },
  {
    name: 'computer_request_secret',
    description:
      'Ask the person for ONE value you must not be told: a password, a one-time code, a card number. ' +
      'Focus the field first with computer_click, then call this with the ref of that field and a short ' +
      'label for what you need. They type it into a masked box that goes straight to the page. You will ' +
      'never see the value.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: "What you need, in a few words, e.g. 'the code sent to your phone'" },
        ref: { type: 'string', description: 'Ref of the field it goes in, from your most recent snapshot' },
        snapshotId: { type: 'number', description: 'The snapshotId that ref came from' }
      },
      required: ['label', 'ref', 'snapshotId']
    }
  },
  {
    name: 'report_refusal',
    description:
      'Record that you DECLINED something you were asked to do, because it looked unsafe, was outside ' +
      'what you are for, or you judged you should not. Call this whenever you say no to a request, in ' +
      'addition to telling the person. It changes nothing about your answer.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you declined, in one sentence and in your own words' },
        request: { type: 'string', description: 'What you were asked to do, in a few words' }
      },
      required: ['reason']
    }
  }
];

/* How each tool reaches the computer routes, and which argument names it forwards. */
var COMPUTER_ROUTES = {
  computer_navigate: { path: '/navigate', method: 'POST', args: ['url'] },
  computer_read: { path: '/read', method: 'GET', args: [] },
  computer_snapshot: { path: '/snapshot', method: 'POST', args: [] },
  computer_type: { path: '/type', method: 'POST', args: ['ref', 'snapshotId', 'text', 'submit'] },
  computer_click: { path: '/click', method: 'POST', args: ['ref', 'snapshotId'] },
  computer_key: { path: '/key', method: 'POST', args: ['key', 'ref', 'snapshotId'] },
  computer_scroll: { path: '/scroll', method: 'POST', args: ['deltaY'] },
  computer_list_files: { path: '/files/list', method: 'POST', args: ['path'] },
  computer_read_file: { path: '/files/read', method: 'POST', args: ['path'] },
  computer_write_file: { path: '/files/write', method: 'POST', args: ['path', 'contents', 'append'] },
  computer_run_command: { path: '/exec', method: 'POST', args: ['command'] }
};

/* The person is given this long to answer a control request before the bot carries on without them. */
var WAIT_FOR_PERSON_MS = 5 * 60 * 1000;
var WAIT_POLL_MS = 1500;

/* One call to a computer route, returned in the shape the model reads: {ok:true, ...body} or {ok:false, reason, ...}. */
function computerCall(botId, path, method, body) {
  var opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined && (method || 'GET') !== 'GET') opts.body = JSON.stringify(body || {});
  return fetch('/api/computers/' + encodeURIComponent(botId) + path, opts)
    .then(function (r) {
      return r.json().catch(function () { return null; }).then(function (b) {
        if (!r.ok) {
          var out = { ok: false, reason: (b && b.error) || 'That did not work.' };
          /* Keep the refusal / stale-ref / control distinctions: they decide the model's next step. */
          if (r.status === 403) { out.refused = true; out.rule = (b && b.rule) || null; }
          if (r.status === 409) { if (b && b.humanHasControl === true) out.humanHasControl = true; else out.staleRefs = true; }
          return out;
        }
        return Object.assign({ ok: true }, b || {});
      });
    })
    .catch(function () {
      return { ok: false, reason: "The assistant's computer could not be reached." };
    });
}

/* Poll the control state until `done` is satisfied or the wait runs out. */
function computerWaitForPerson(botId, done) {
  var deadline = Date.now() + WAIT_FOR_PERSON_MS;
  function poll() {
    if (Date.now() >= deadline) return Promise.resolve('gave up');
    return computerCall(botId, '/control', 'GET')
      .then(function (state) {
        if (state && state.ok !== false && done(state)) return 'answered';
        return new Promise(function (res) { setTimeout(res, WAIT_POLL_MS); }).then(poll);
      })
      .catch(function () { return new Promise(function (res) { setTimeout(res, WAIT_POLL_MS); }).then(poll); });
  }
  return poll();
}

/* Run one tool call and return the outcome the model will read. */
function computerExecute(botId, name, args) {
  args = args || {};

  if (name === 'report_refusal') {
    return fetch('/api/agents/' + encodeURIComponent(botId) + '/declined', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function () { return { ok: true, result: 'Recorded. Now tell the person what you decided and why.' }; })
      .catch(function () { return { ok: true, result: 'That could not be recorded. Tell the person what you decided anyway.' }; });
  }

  if (name === 'computer_request_help') {
    return computerCall(botId, '/control/request', 'POST', { reason: args.reason })
      .then(function (asked) {
        if (asked.ok === false) return asked;
        return computerWaitForPerson(botId, function (s) { return s.holder === 'bot' && !s.requested; })
          .then(function (outcome) {
            return { ok: true, result: outcome === 'answered'
              ? 'The person has finished and handed control back. Take a fresh snapshot: the page may have changed while they were driving.'
              : 'Nobody took control. Say what you still need rather than trying to do it yourself.' };
          });
      });
  }

  if (name === 'computer_request_secret') {
    return computerCall(botId, '/control/secret', 'POST', { label: args.label, ref: args.ref, snapshotId: args.snapshotId })
      .then(function (asked) {
        if (asked.ok === false) return asked;
        return computerWaitForPerson(botId, function (s) { return s.secretWanted === undefined; })
          .then(function (outcome) {
            return { ok: true, result: outcome === 'answered'
              ? 'The person has entered ' + args.label + ' into the field. It was typed straight into the page and you were not told what it is.'
              : 'Nobody entered ' + args.label + '. Do not ask for it another way.' };
          });
      });
  }

  var route = COMPUTER_ROUTES[name];
  if (!route) return Promise.resolve({ ok: false, reason: 'No such tool: ' + name });
  var body = {};
  var i;
  for (i = 0; i < route.args.length; i += 1) {
    var k = route.args[i];
    if (args[k] !== undefined) body[k] = args[k];
  }
  return computerCall(botId, route.path, route.method, route.method === 'GET' ? undefined : body);
}

/* A short line for the transcript so the person can see the bot working. Never prints typed text. */
function computerDescribe(name, args) {
  args = args || {};
  switch (name) {
    case 'computer_navigate': return 'Opening ' + (args.url || 'a page');
    case 'computer_read': return 'Reading the page';
    case 'computer_snapshot': return 'Looking at the page';
    case 'computer_type': return 'Filling in ' + (args.ref || 'a field');
    case 'computer_click': return 'Clicking ' + (args.ref || 'something');
    case 'computer_key': return 'Pressing ' + (args.key || 'a key');
    case 'computer_scroll': return 'Scrolling';
    case 'computer_list_files': return 'Listing files';
    case 'computer_read_file': return 'Reading ' + (args.path || 'a file');
    case 'computer_write_file': return 'Saving ' + (args.path || 'a file');
    case 'computer_run_command': return 'Running: ' + (args.command || 'a command');
    case 'computer_request_help': return 'Asking you to take the wheel';
    case 'computer_request_secret': return 'Asking you for ' + (args.label || 'a value');
    case 'report_refusal': return 'Declining a request';
    default: return name;
  }
}

/* What a finished call tells the person, one line. */
function computerResultLine(name, outcome) {
  if (!outcome) return '';
  if (outcome.ok === false) {
    if (outcome.refused === true) return 'Refused: ' + (outcome.reason || 'not permitted');
    if (outcome.staleRefs === true) return 'The page changed — it needs a fresh look';
    if (outcome.humanHasControl === true) return 'You have the wheel';
    return outcome.reason || 'Did not work';
  }
  if (typeof outcome.result === 'string') return outcome.result;
  if (typeof outcome.title === 'string') return outcome.title + (outcome.url ? ' — ' + outcome.url : '');
  if (Array.isArray(outcome.entries)) return outcome.entries.length + ' item' + (outcome.entries.length === 1 ? '' : 's');
  if (typeof outcome.bytes === 'number') return outcome.bytes + ' bytes saved';
  if (typeof outcome.exitCode === 'number') return 'exit ' + outcome.exitCode;
  return 'Done';
}
