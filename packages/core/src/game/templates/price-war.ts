import type { GameTemplate } from '../types';

export const priceWarTemplate: GameTemplate = {
  id: 'price-war',
  title: 'Price War Simulation',
  subtitle: 'Incumbent Leader · Low-Cost Challenger · Procurement Coalition',
  situation:
    'An operator is preparing a pricing or bundling move in a contested B2B market and stress-testing how rivals and buyers will retaliate.',
  objectivePlaceholder:
    'e.g. Defend 22% gross margin in Madrid and Barcelona while growing net revenue 30%',
  briefPlaceholder:
    'Paste your pricing plan: current contract values, proposed discount or bundle, key accounts, competitor pricing and margin floor...',
  demoObjective:
    'Defend 22% gross margin for Veridian Pay in Madrid and Barcelona while growing net revenue 30%',
  demoBrief:
    'Veridian Pay processes €18.5M in cross-border invoices for 420 exporters in Madrid and Barcelona. Rival Finova Corp just cut FX spreads by 35% after raising $12M from Northstar Ventures. CEO Elena Rostova proposes bundling free treasury accounts via Project Mercury at €290 per month on 2027-01-15 (contact: elena@veridianpay.eu, https://veridianpay.eu) to retain anchor client Iberia Freight while holding a 22% margin floor.',
  openingMove: 'Announce the new pricing structure as described in the brief.',
  generals: [
    {
      id: 'incumbent',
      name: 'Incumbent Leader',
      role: 'the VP of Commercial Strategy at the category leader with 45% market share',
      persona:
        'You control the largest installed base in the sector. Your customers use three of your modules and face high switching costs. You rarely cut list price across the board; instead, you weaponize multi-year renewals, bundled rebates and selective surgical discounts on accounts that threaten to defect.',
      goal: 'Protect enterprise net retention and starve the player of reference accounts without repricing your own back-book.',
      hiddenInfo:
        'Your board has tied executive bonuses to holding gross margin above 68% this fiscal year, so an across-the-board price cut is off the table. However, you have a discretionary retention pool equal to 4% of ARR reserved solely to match offers on your top 50 accounts.',
      style:
        'Measured, executive, territorial. Speaks in renewal cliffs, bundle rebates and total cost of ownership.',
      color: '#10B981',
    },
    {
      id: 'challenger',
      name: 'Low-Cost Challenger',
      role: 'the aggressive founder of a lean rival undercutting the market by 40%',
      persona:
        'You have low overhead, automated onboarding and nothing to lose. Every time an established vendor raises prices or adds packaging complexity, you run targeted campaigns offering flat-rate buyouts of remaining contract terms. You treat price transparency as a wedge.',
      goal: 'Turn the category into a commodity comparison and capture high-volume mid-market logos while forcing the player into margin compression.',
      hiddenInfo:
        'Your unit economics only work when customers self-serve; any account requiring custom SLA terms or heavy migration support loses money for eighteen months. You also have only nine months of runway left before your Series A check.',
      style:
        'Blunt, scrappy, confrontational. Calls out hidden fees and challenges any premium that cannot be proven in thirty days.',
      color: '#F97316',
    },
    {
      id: 'coalition',
      name: 'Procurement Coalition',
      role: 'the collective voice of CFOs, sourcing leads and renewal committees across your target accounts',
      persona:
        'You benchmark every quote against peer contracts. You have mandates to consolidate vendors and cut software and supply spend by 15% this year. When a vendor changes packaging, you use the transition to reopen terms, demand price caps and play all three suppliers against each other.',
      goal: 'Extract maximum concession on unit price, remove auto-renewal escalators and preserve flexibility to switch without penalty.',
      hiddenInfo:
        'Half of the buyers in this cohort have frozen new vendor onboarding until next quarter, meaning incumbents win by default unless a challenger absorbs switching costs. Two anchor customers share pricing benchmarks in a private peer group.',
      style:
        'Cold, analytical, contractual. Talks in budget cycles, benchmark percentiles, termination clauses and payback periods.',
      color: '#10B981',
    },
  ],
  crowd: [
    {
      id: 'p1',
      label: 'Enterprise sourcing director',
      outlook: 'Demands three competing bids and strips out any bundled shelfware.',
    },
    {
      id: 'p2',
      label: 'Mid-market CFO watching cash flow',
      outlook: 'Prefers predictable monthly billing over annual prepay discounts.',
    },
    {
      id: 'p3',
      label: 'Operations manager who runs the tool daily',
      outlook: 'Dreads migrating data and will fight procurement to stay put unless prices spike.',
    },
    {
      id: 'p4',
      label: 'Regional channel reseller',
      outlook: 'Pushes whichever vendor protects partner margin and deal registration.',
    },
    {
      id: 'p5',
      label: 'Account executive on the player sales team',
      outlook: 'Worried that complex new tiers will stall end-of-quarter renewals.',
    },
    {
      id: 'p6',
      label: 'Cost-cutting private equity operating partner',
      outlook: 'Mandates a 20% vendor spend reduction across all portfolio companies.',
    },
    {
      id: 'p7',
      label: 'High-volume power customer',
      outlook: 'Expects steep volume tiers and threatens to build in-house if usage fees climb.',
    },
    {
      id: 'p8',
      label: 'Small regional account on legacy pricing',
      outlook: 'Feels betrayed by grandfathering sunset clauses and vocalizes complaints online.',
    },
    {
      id: 'p9',
      label: 'Category analyst tracking net retention',
      outlook: 'Watches whether discounting buys real expansion or just pulls forward churn.',
    },
    {
      id: 'p10',
      label: 'Compliance and legal reviewer',
      outlook: 'Blocks any contract modification that introduces uncapped usage overages.',
    },
  ],
};
