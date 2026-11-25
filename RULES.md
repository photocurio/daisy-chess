# Daisy Chess Rules

Status: Working draft 0.1

## Objective

Win by either:

- Checkmating the opposing king.
- Legally moving your king to the central `c3` square.

Central-square victory is available throughout the game. The king may not enter `c3` while that square is attacked, just as it may not make any other move into check. Reaching `c3` ends the game immediately.

## Board

Daisy Chess is played on a 5×5 board with files `a` through `e` and ranks `1` through `5`.

## Starting armies

Light begins with a king and queen on its first rank and three pawns on its second rank.

Dark begins with a king, rook, two bishops, and knight filling its first rank. Dark has no pawns. Their order is randomized for each game, with the bishops required to begin on opposite-colored squares. This produces 36 legal Dark formations.

Using conventional values—queen 9, rook 5, bishop 3, knight 3, and pawn 1—Light begins with 12 points of material and Dark with 14. Whether that difference matters on a 5×5 board is a playtest question.

One legal formation is:

```text
5   r  b  k  n  b
4   ·  ·  ·  ·  ·
3   ·  ·  ·  ·  ·
2   ·  P  P  P  ·
1   ·  Q  ·  K  ·
    a  b  c  d  e
```

The Light arrangement remains a playtest parameter.

Light moves first. The human player may choose either army before play begins.

## Movement

Unless stated otherwise, pieces move, capture, give check, and deliver checkmate as they do in orthodox chess.

## Simplifications

- No castling.
- No en passant.
- Pawns do not have an initial two-square move.
- A pawn promotes to a queen, rook, bishop, or knight upon reaching the opposite back rank.

## Draws

- Stalemate is a draw.
- A third repetition is a draw.
- A player may offer the house a draw. The house accepts only when an exhaustive legal-continuation check proves that it has no possible route to checkmate or the center. An inconclusive check is declined.
- Batch playtests use a configurable maximum game length as a safety limit; this is not yet a game rule.

## Decisions still required

- Whether Light's starting squares should also vary.
- Whether the current draw rules should be retained.
- Whether any orthodox insufficient-material rules apply.

These decisions should be treated as testable balance parameters rather than finalized by convention.
