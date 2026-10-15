// src/shelter/treatCopy.js  (owner: T, TT4 §12.2, TT5 §13.1 item 3) — every word the treat panel shows. Plain short sentences, no em
// dashes, no "adopt", no token, no number that is not read live (the amount comes from the host's `amountLabel`).
// The treat is sponsored: Token Tails pays it, the player never does.

export const TREAT_COPY = Object.freeze({
  heading: 'Send a free treat',
  free: 'Token Tails sends a free treat. You pay nothing.',
  custody: 'Held by Token Tails for the shelter until handover.',
  send: (name) => `Send Pink Paw a treat for ${name}`,
  sendPlain: 'Send Pink Paw a treat',
  sending: 'Sending the treat…',
  sent: (amountLabel) => amountLabel
    ? `Treat sent! ${amountLabel} is on its way to Pink Paw (Rožinė pėdutė).`
    : 'Treat sent! It is on its way to Pink Paw (Rožinė pėdutė).',
  explorer: 'View on explorer',
  receipt: 'Receipt',
  already: 'Token Tails already sent your treat today. Come back tomorrow.',
  exhausted: "Today's treats are gone, back at 00:00 UTC.",
  soon: 'Real shelter treats open soon.',
  error: 'The treat could not be sent. Your game progress is safe.',
  retry: 'Try again',
  checking: "Checking today's treat…",
  link: 'Open tokentails.com/swordcat',
  linkNote: 'Play on tokentails.com/swordcat to send a free treat. Opens in a new tab.',
  copy: 'Copy link',
  copied: 'Link copied. Open it in your browser to send the treat.',
  copyFailed: 'Copy did not work. The link is tokentails.com/swordcat',
});

/** Where a player on another host plays the game with treats on (new tab, never a redirect of the game). */
export const PLAY_URL = 'https://tokentails.com/swordcat';
