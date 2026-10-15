// src/shelter/treatCopy.js  (owner: T, TT4 §12.2) — every word the treat panel shows. Plain short sentences, no em
// dashes, no "adopt", no token, no number that is not read live (the amount comes from the host's `amountLabel`).
// The treat is sponsored: Token Tails pays it, the player never does.

export const TREAT_COPY = Object.freeze({
  heading: 'Send a free treat',
  free: 'Token Tails sends the treat. It is free for you.',
  custody: 'Held by Token Tails for the shelter until handover.',
  send: (name) => `Send ${name} a treat`,
  sendPlain: 'Send a treat',
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
  link: 'Send a treat on Token Tails',
  linkNote: 'Opens Token Tails in a new tab.',
});

/** Where a player outside the Token Tails frame sends a treat (new tab, never a redirect of the game). */
export const GIVE_URL = 'https://tokentails.com/shelter-payouts/give';

/** `GIVE_URL?cat=<name>` (the name is URL-encoded; an empty name gives the bare page). Pure. */
export function giveHref(catName) {
  const n = typeof catName === 'string' ? catName.trim().slice(0, 32) : '';
  return n ? `${GIVE_URL}?cat=${encodeURIComponent(n)}` : GIVE_URL;
}
