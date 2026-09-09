# Food Fight

**Two uneven armies. One tiny board.**

Food Fight is an experimental asymmetric chess variant played on a 5×5 board. Light has a queen and three pawns; Dark has a rook, two bishops, and a knight. Both sides have a king.

A player wins by either checkmating the opposing king or safely moving their own king onto `c3`, the central square.

## Current rules

- Light starts with its queen on `b1`, king on `d1`, and pawns on `b2`, `c2`, and `d2`.
- Dark's five pieces fill rank 5 in a randomized order.
- Dark's bishops must start on opposite-colored squares, producing 36 legal formations.
- Light moves first; the player may choose either army.
- Pieces otherwise move and give check as in orthodox chess.
- There is no castling, en passant, or initial two-square pawn move.
- Pawns may promote to a queen, rook, bishop, or knight.
- Stalemate, threefold repetition, and accepted draw offers are draws in the current prototype. The house accepts an offer only when it can prove that it has no possible winning continuation.

One possible opening position is:

```text
5   r  b  k  n  b
4   ·  ·  ·  ·  ·
3   ·  ·  ·  ·  ·
2   ·  P  P  P  ·
1   ·  Q  ·  K  ·
    a  b  c  d  e
```

See [RULES.md](RULES.md) for the working specification and unresolved decisions.

## Play in the browser

The pitch-ready browser demo runs the game engine in a Web Worker, keeping search off the interface thread.

```sh
npm install
npm run dev
```

Leave Hard mode unchecked for an easier opponent, or enable it for the original engine strength. Then choose Light or Dark, click a piece, and click a highlighted destination. The dark formation is randomized for every new round. The easier opponent searches two plies ahead; Hard uses the original six-ply search settings.

## Play in the terminal

Requires Node.js 22 or later.

```sh
npm install
npm run play
```

The default game gives the player Light. Enter moves in compact coordinate notation such as `c2c3`; enter `moves` to list legal choices or `quit` to stop.

```sh
# Play Dark instead
npm run play -- --side=dark

# Replay a particular randomized formation
npm run play -- --side=dark --seed=20260907

# Watch a quick engine-versus-engine game
npm run selfplay
```

The printed formation code lists Dark's pieces from `a5` through `e5`. For example, `rbknb` means rook–bishop–king–knight–bishop.

## Engine and playtesting

The dependency-light TypeScript engine provides:

- Legal move generation and king-safety validation on a 5×5 board
- Checkmate, stalemate, repetition, and central-square victory handling
- Iterative-deepening alpha–beta search
- Root-move analysis, perft, seeded self-play, and formation tournaments
- JSON and CSV tournament reports in `results/`

Useful commands:

```sh
npm test
npm run typecheck
npm run build
npm run analyze
npm run tournament
npm run test-formations
```

`npm run tournament` runs 100 reproducible games sampled from the valid formations. `npm run test-formations` runs ten games from each of the 36 formations. Move selection is weighted among engine-ranked alternatives to avoid producing the same deterministic game repeatedly.

The latest 360-game formation test produced 187 Light wins, 163 Dark wins, and 10 draws, with an average length of 24.2 plies. This is evidence for continued human testing, not proof of balance: the current search and evaluation are intentionally modest.

## Project status

The rules core, playtest engine, interactive terminal game, and batch tournament runner are working. The next milestone is human playtesting before committing to a browser widget or a final ruleset.
