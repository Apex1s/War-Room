# Demo video script (draft, 3:00)

Rules from the hackathon: 3 minutes or less, public on YouTube, in English. Criteria 3 (Impact) and 4 (Idea) are judged largely from this video, so the first 20 seconds must make the problem obvious.

**Setup before recording**
- Record on the Gemini Nano laptop, Chrome only, one window at 1280 x 800 (browser zoom 110% helps legibility), bookmarks bar hidden, notifications off.
- Close the code editor and other heavy apps first. Press "Download model" days before, and let the warm-up run (open the app one minute before recording).
- Clear old games, then use the startup demo brief.
- On-device steps take tens of seconds on this laptop. Record them in full, then speed them up in the edit with an on-screen tag "sped up 4x". Never cut a badge or a latency number out of the frame.
- Have the Firebase console open in a second tab on Remote Config, `routing_table` parameter.
- Voiceover: about 400 words. Speak at a calm pace; record it separately from the screen and lay it over.

---

## 0:00 to 0:20. The problem

**Screen:** a text editor with the real Kestrel Labs brief (names, ARR, launch date). A chatbot box beside it, cursor blinking. Cut to the War Room home screen.

**Voice:**
> This is a real plan: a company name, our revenue, a launch date. I want the toughest feedback I can get before I commit. But I can't paste this into a cloud chatbot. These are my secrets.
> War Room is a war game for plans like this. The cloud does the thinking. The device keeps the secrets.

**Caption:** WAR ROOM. Firebase AI Logic, hybrid inference.

## 0:20 to 0:55. Sealed on-device

**Screen:** Startup Idea Stress Test, Load demo brief, Seal brief in privacy firewall. The ON-DEVICE badge with its latency (sped up 4x tag). Firewall review: orange-underlined secrets on the left, mint placeholder chips on the right. Hover one chip. Open the Egress inspector, empty.

**Voice:**
> I paste the brief and seal it. Gemini Nano runs right here in Chrome through Firebase AI Logic. It finds every company, person, product and place, and code swaps them for placeholders. Money, dates, emails too.
> On the left, what stays on my laptop. On the right, the only thing the cloud will ever see. Nothing leaves until I approve. And the egress inspector proves it: every cloud call, word for word.

## 0:55 to 1:50. The war game

**Screen:** Approve and send. Type the round 1 move slowly so the live coaching tip appears (ON-DEVICE badge). Seal move. The three General cards arrive with CLOUD badges and latencies, threat meters filling in orange. Scroll right column: referee verdict and crowd wall with ON-DEVICE badges. Round 2, quicker. Show one "N items masked" chip on a move.

**Voice:**
> Three opponents attack my plan from the cloud: a skeptical investor, a copycat competitor and the market itself. Each has its own goals and things it knows that I don't.
> While I write my next move, the referee coaches me on-device, because my draft is still raw. My move gets sealed exactly like the brief.
> The Generals reply in parallel, in the cloud. The crowd and the referee react on-device. Every badge shows where the model really ran, and how long it took.

## 1:50 to 2:15. The verdict, with real names back

**Screen:** Generate final verdict report. Verdict line and top three risks. Toggle "Real names (local re-hydration)" off and on: placeholders, then Kestrel Labs. Scroll to "What your opponents knew".

**Voice:**
> After three rounds, the final report: the verdict, my top three risks, three counter-strategies. The cloud only ever saw placeholders. My device puts the real names back, here, on my screen.
> And then the reveal: what each opponent secretly knew.

## 2:15 to 2:40. Hybrid you can see and steer

**Screen:** Hybrid telemetry panel: share of calls on-device, cloud calls avoided. Switch to the Firebase console tab, edit `routing_table`, set crowd to `only_in_cloud`, publish. Back in the app, play a quick round: crowd badges now say CLOUD.

**Voice:**
> FILL: real share, for example "Half of this game ran on my laptop." Those are cloud calls I didn't pay for and data that never left.
> The routing lives in Remote Config. One change in the console, and the crowd moves to the cloud, live. The raw-text tasks can't move. That lock is in the code.

## 2:40 to 2:55. Offline and everywhere

**Screen:** Turn Wi-Fi off (show the system icon). Replay, round 2, edit the move, Run offline what-if: new crowd and referee with ON-DEVICE badges. Cut to the Chrome extension: select text on a web page, right-click "Stress-test selection in War Room", the side panel opens with the brief filled in.

**Voice:**
> Network off, I can still replay the game and test a different move, fully on-device. And the same app runs as a Chrome side panel: select any text, right-click, stress-test it.

## 2:55 to 3:00. Close

**Screen:** Home screen, `WAR ROOM_` cursor blinking. Text on screen: war-room-hybrid.web.app. github.com/Apex1s/War-Room.

**Voice:**
> War Room. The cloud does the thinking. The device keeps the secrets.

---

**Word count check:** voiceover above is about 350 words, roughly 2 minutes 30 at a calm pace, which leaves room for pauses. Read it aloud with a timer before recording; if a section runs long, cut words, not screen time on badges.
