# Chart patterns — how they are found

The **Patterns** button on the chart runs [`src/patterns.js`](../src/patterns.js) on the candles you are looking at. It is a fixed set of rules, not an AI model — the same chart always gives the same result.

![Chart patterns](img/chart-patterns.png)

## Patterns

Symmetrical / ascending / descending triangle · rising / falling wedge · rising / falling channel · range · double top / bottom · triple top / bottom · head and shoulders · inverse head and shoulders.

## Method

1. **Swing highs and lows (zigzag).** A high is confirmed when price pulls back by *k × ATR(14)* from it, and a low likewise. This runs at three sensitivities, *k* = 1.6, 2.3 and 3.2, so both small and large structures are found.
2. **Fit two lines.** For each window of the last 4–7 swing points, a least-squares line is fitted through the highs and another through the lows. The fit is kept only if at least 90% of candles stay inside the lines.
3. **Classify by shape.** The slopes of the two lines and how the gap between them changes decide the kind: both converging with opposite slopes → symmetrical triangle; flat top and rising bottom → ascending triangle; both rising and converging → rising wedge; parallel → channel or range. Double/triple tops and bottoms and head-and-shoulders are matched on the swing points themselves (similar peak heights, a neckline between them).
4. **Merge and score.** The same pattern found at several sensitivities is merged; agreement across levels raises the score. The score (0–100) mainly measures how cleanly candles respect the lines.
5. **Only what is current.** Patterns that ended long ago are dropped. Each result has a status: *forming*, *broke up* or *broke down*.

## Levels shown

| Level | Meaning |
|---|---|
| Upper / lower line | Where the two lines are at the latest bar (or at the break, if price already broke out). |
| Invalid | The price that would cancel the pattern. |
| Target | **Textbook reference only:** the break price plus or minus the pattern's height. It is not a forecast — many patterns never get there. After a breakout only the target in the breakout direction is kept. |

## Limits

Patterns are subjective: two people can draw the same chart differently. The detector picks one consistent way of drawing and shows its score and invalidation level so you can judge it. Use it as a second pair of eyes, not as a trading signal.

## Try it

```bash
node examples/find-patterns.mjs BTCUSDT 4h
node examples/find-patterns.mjs ETHUSDT 1d
```
