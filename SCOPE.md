# Daisy Chess iPhone Beta Scope

Status: Draft for review  
Date: November 25, 2026  
Project: https://github.com/photocurio/daisy-chess

## Purpose

Build an offline iPhone version of Daisy Chess for the owner and a small group of private testers. The beta will establish whether the game is enjoyable on a phone, whether the computer opponent feels appropriate at each difficulty, and whether matches remain reliable through everyday interruptions.

The first release targets iPhone. Android follows later, beginning with the owner's Pixel. Keep the existing browser game working and share game logic across platforms.

## Agreed scope

- A React Native app using Expo and TypeScript.
- Single player against the existing computer opponent, entirely offline after installation.
- Choice of Light or Dark and Easy or Hard difficulty before starting a game.
- A randomized legal Dark formation for each new match.
- A board operated by tapping a piece and then a highlighted destination.
- Clear selection, legal moves, last move, check, side to move, and computer-thinking feedback.
- Pawn promotion with a choice of queen, rook, bishop, or knight.
- Resign, Offer draw, and New game controls.
- Automatic saving and resuming of the current match.
- A concise explanation of the rules and both ways to win.
- Basic accessibility, including meaningful board-square labels and understandable turn and result announcements.
- A private installable beta for the owner and a few testers.

## Rules and draw behavior

Retain the existing 5 by 5 rules: Light moves first; the armies are asymmetric; Dark has 36 legal starting formations with bishops on opposite-colored squares. A player wins by checkmate or by legally moving their king to c3. There is no castling, en passant, or initial two-square pawn move.

Retain stalemate and threefold repetition as automatic draws under the current rules. Retain the Offer draw control. Do not end a match automatically because the engine evaluates it as drawn or predicts a draw with optimal play. Players may continue such positions, and Easy mode may make mistakes.

For the initial port, preserve the existing draw-offer acceptance behavior: the computer accepts only when a bounded analysis proves that it has no possible winning continuation. Inconclusive analysis declines the offer. This is the implementation baseline; whether that policy is enjoyable remains a playtest decision. It is different from detecting a draw under best play.

## Technical approach

Reuse the TypeScript board, position, move-generation, rule, search, and draw-assessment modules. Extract match state and transitions currently embedded in the browser interface into shared code, including repetition tracking, resignation, accepted draws, and match results. Keep the existing engine tests and add focused coverage for shared match behavior and restoration.

Build a native React Native interface. Keep platform-specific rendering, storage, lifecycle handling, and engine execution outside the shared rules. Avoid a broad repository restructure beyond what sharing these modules requires.

The browser currently runs synchronous AI search in a Web Worker. The mobile version needs an execution strategy that keeps touches and React updates responsive. Milestone 1 will compare a separate execution runtime with an interruptible search that yields regularly. A promise or timer around the current synchronous search is not sufficient by itself.

Save enough information to restore the position, chosen side, difficulty, formation, move and repetition history, and terminal result. After interruption, resume or restart pending analysis safely. Ignore stale engine results after a new game or resignation.

## Milestones and acceptance criteria

| Milestone | Deliverable | Acceptance criteria |
| --- | --- | --- |
| 1. iPhone feasibility | A deliberately plain playable build on the owner's physical iPhone | Complete games as either side; exercise both difficulties; controls remain responsive during AI search; background and resume safely; restore a saved match after relaunch. Record the engine execution choice and measured behavior. |
| 2. Complete gameplay | Native interface and shared match controller | Selection, legal moves, promotion, both victory conditions, stalemate, repetition, resignation, draw offers, and new games work. Existing browser gameplay remains functional. |
| 3. Reliability and usability | A complete beta candidate | Restore matches without lost or duplicate moves; discard stale AI results; handle interruptions during search and promotion; provide clear rules, accessibility labels, and readable layouts on the agreed iPhone sizes. |
| 4. Private testing | Installable beta and brief tester instructions | Owner and selected testers can install and launch the build, play offline, and report issues with an app version and reproduction steps. |

Milestone 1 is the decision point before investing in visual polish. Persistent AI responsiveness or lifecycle problems may change the implementation approach and remaining estimate.

## Validation

Run existing engine tests, TypeScript checks, and the browser production build as shared code changes. Test the mobile app on physical hardware, including a release-like build for performance assessment.

Exercise checkmate, center victory, promotion, stalemate, repetition, accepted and declined draw offers, resignation, and starting over. Test backgrounding and relaunching on both human and computer turns, during promotion, and after the match ends. A restored game must preserve repetition behavior as well as the visible board.

## Deferred work

Android builds and Pixel validation; public App Store release; iPad-specific layouts; online or pass-and-play multiplayer; accounts; rankings; purchases; ads; analytics; push notifications; puzzles; cloud saves; browsing completed games; and major changes to the rules or AI strength.

Android remains a future target. Avoid unnecessary iPhone-specific dependencies, but do not treat Android as tested until a later milestone validates it on the Pixel.

## Dependencies and open decisions

- Confirm the owner's iPhone model and iOS version, then choose the minimum supported iOS version and tester device range.
- Confirm Expo and Apple developer account availability and choose private distribution through TestFlight or registered-device builds.
- Select and benchmark the mobile engine execution approach in milestone 1.
- Decide the final app icon, splash screen, and visual treatment before distributing the beta.
- Review the existing draw-offer acceptance policy after playtesting; retain it for the initial port unless explicitly changed.

Hosted Expo builds can reduce local native-toolchain setup. The beta requires no game backend or hosted match service. Build, signing, and distribution setup are separate from game infrastructure.

## Effort and completion

Use approximately 2 to 4 weeks of focused developer effort as an initial planning range, with additional learning time if React Native is new. This is not a delivery commitment. Re-estimate after milestone 1; AI execution, device compatibility, and signing or distribution setup are the largest uncertainties. Android and any public release are estimated separately.

The beta is complete when the agreed iPhone testers can install it and reliably finish offline matches, save and resume without changing game state, understand the two victory conditions, and provide actionable feedback. The browser version must continue to build and pass its existing checks.

## Related cleanup

Correct the browser's visible heading, which still uses separate Food and Fight spans and was missed during the rename. Include this as a small branding correction without changing gameplay.
