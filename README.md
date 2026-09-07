# Barroom Brawl

**Two uneven armies. One tiny board.**

Barroom Brawl is an experimental asymmetric chess variant played on a 5×5 board. One side fields a queen behind a row of five pawns. The other fields a rook, two bishops, and a knight, with no pawns. Both sides have a king, and checkmate wins.

The project is currently a rules-and-balance experiment. Before building a player-facing widget, the plan is to define the rules precisely, implement a reusable rules core, and use engine self-play plus human testing to evaluate starting positions and balance.

## Design goals

- Preserve the recognizable objective and movement of chess.
- Replace symmetric armies with two distinct strategic identities.
- Keep the board, move choices, and game length approachable.
- Avoid opening-theory prerequisites.
- Make the rules core reusable by both playtesting tools and a future browser widget.

## Armies

### Light: Queen and Pawns

- King
- Queen
- Five pawns

### Dark: The Minor Army

- King
- Rook
- Two bishops
- Knight
- No pawns

Each army has a nominal material value of 14 points before counting its king. Actual values on a 5×5 board must be established through playtesting.

## Project status

See [RULES.md](RULES.md) for the working rules and unresolved decisions.

