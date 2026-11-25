# Daisy Chess Apple Beta Checklist

Date: November 25, 2026  
Destination: Private iPhone beta through TestFlight  
Related scope: [iPhone beta scope](SCOPE.md)

## 1 Confirm accounts and membership

- [ ] Sign in at https://developer.apple.com/account/ using the personal Apple Account intended to own Daisy Chess.
- [ ] Check Membership details for an active Apple Developer Program membership and its expiration date. If multiple teams appear, check which team is selected; access to an employer's team is separate from a personal membership.
- [ ] If not enrolled, enroll as an individual for this personal project. If membership has expired, renew it. If enrollment is pending, complete Apple's remaining steps.
- [ ] Enable two-factor authentication and complete Apple's identity verification and agreements as requested.
- [ ] Create a personal Expo account for the app's cloud builds.

Signing in to the developer website does not by itself establish paid program membership. The program currently costs USD 99 per year in the US. Individual enrollment lists the developer's legal name as the seller on a future public App Store listing. Paid membership is required for TestFlight; it is not required to begin writing the app.

Sources: [Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment/), [membership details and renewal](https://developer.apple.com/help/account/membership/renewal/).

## 2 Add the mobile application

- [ ] Add an Expo React Native app with TypeScript to the existing repository.
- [ ] Configure shared imports for the TypeScript engine while keeping the browser app working.
- [ ] Extract shared match state and transitions from the browser interface.

## 3 Configure app identity

- [ ] Set the display name to Daisy Chess.
- [ ] Choose a stable bundle identifier, provisionally com.photocurio.daisychess, subject to availability.
- [ ] Select the supported iOS versions, iPhone device support, and orientation.
- [ ] Set the app version and build number.
- [ ] Add the icon and launch screen.

## 4 Prove the engine on a physical iPhone

- [ ] Install a development build and implement a plain playable board.
- [ ] Choose and benchmark an AI execution approach that keeps controls responsive.
- [ ] Complete games as either side on Easy and Hard.
- [ ] Prove backgrounding, resume, and restoration after relaunch before visual polish.

## 5 Complete mobile gameplay

- [ ] Implement selection, legal-move highlights, check and last-move feedback, promotion, and match results.
- [ ] Add Resign, Offer draw, New game, and rules.
- [ ] Persist the current match, including repetition history and terminal results.
- [ ] Ignore stale AI results after interruption, resignation, or a new game.
- [ ] Add accessibility labels and announcements.
- [ ] Correct the remaining Food Fight browser heading as scoped.

## 6 Validate the beta candidate

- [ ] Run engine tests, TypeScript checks, and the browser production build.
- [ ] Test all victory and draw conditions, draw offers, resignation, and promotion.
- [ ] Test interruptions on both human and computer turns and during promotion.
- [ ] Check offline operation, layouts, piece rendering, and performance in a release-like physical-device build.

## 7 Configure signing and distribution builds

- [ ] Link the Expo project to the personal Apple developer team.
- [ ] Register the bundle identifier.
- [ ] Configure distribution signing certificates and provisioning profiles; Expo can manage these.
- [ ] Configure a store-distribution build suitable for TestFlight.

Hosted Expo builds can avoid a full local Xcode installation. An on-device development build and a TestFlight distribution build use different build profiles.

Source: [Expo iOS submission](https://docs.expo.dev/submit/ios/).

## 8 Upload to App Store Connect

- [ ] Create the Daisy Chess app record with the matching bundle identifier.
- [ ] Produce and upload a signed iOS build through Expo.
- [ ] Wait for Apple to process the build and resolve upload issues.
- [ ] Complete required beta information, feedback and review contacts, and review notes.
- [ ] Answer export-compliance questions based on the actual app and dependencies.

Sources: [Expo TestFlight distribution](https://docs.expo.dev/submit/testflight/), [Apple beta export compliance](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-export-compliance-information-for-beta-builds/).

## 9 Invite private testers

- [ ] Test the processed build as an internal tester first.
- [ ] Create an external testing group for friends rather than giving them App Store Connect team access.
- [ ] Submit the first external build for TestFlight review and resolve any feedback from Apple.
- [ ] Invite the selected testers privately by email after approval.
- [ ] Have testers install TestFlight and then Daisy Chess.
- [ ] Provide What to Test notes and a feedback route.

Source: [Apple TestFlight](https://developer.apple.com/testflight/).

## 10 Maintain the beta

- [ ] Review feedback and crashes.
- [ ] Increment the build number, rebuild, and upload fixes.
- [ ] Replace builds before their 90-day TestFlight availability expires.

Public App Store release, monetization, and Android remain later work.

Source: [Apple build statuses](https://developer.apple.com/help/app-store-connect/reference/app-uploads/app-build-statuses/).
