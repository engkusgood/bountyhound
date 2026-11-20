// BountyHound — built-in samples.
//
// Fictional, realistic-style listings taken verbatim from
// docs/demo-video-script.md. They are labelled "Sample" in the UI and are
// NOT real bounties — no invented claims about real programmes.

export interface Sample {
  id: string;
  label: string;
  shortLabel: string;
  kind: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'hackathon',
    label: 'Sample 1 — Hackathon',
    shortLabel: 'Hackathon',
    kind: 'Devpost-style hackathon',
    text: `BuildHybrid AI Challenge — $30,000 in prizes. Build a Gen AI app using Firebase AI Logic and at least one other Firebase product. Submissions close November 30, 2026. Open to solo developers and teams worldwide. Judging: technological implementation, design, potential impact, and quality of the idea. Winners announced December 21, 2026.`,
  },
  {
    id: 'bug-bounty',
    label: 'Sample 2 — Bug bounty',
    shortLabel: 'Bug bounty',
    kind: 'Smart-contract audit bounty',
    text: `Critical smart-contract audit bounty — $5,000 reward for a verified reentrancy flaw in a DeFi lending protocol. Submit a proof of concept with a mainnet-fork test. Reports reviewed within 7 business days.`,
  },
  {
    id: 'scammy',
    label: 'Sample 3 — Suspicious listing',
    shortLabel: 'Suspicious listing',
    kind: 'Too-good-to-be-true listing',
    text: `URGENT!!! Earn $10,000 per week working from home! No experience needed! Just send 0.05 ETH "activation fee" to unlock your account and start earning today. Limited spots!!!`,
  },
];
