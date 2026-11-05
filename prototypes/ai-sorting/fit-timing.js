'use strict';
// Wall time of one learner fit at the app's dimensions (random data), behind the report's fit-cost figures.
// Usage: node fit-timing.js

const C = require('./common');
const { logisticFit, ridgeFit, appLogisticFit } = require('./bench');

const random = C.mulberry32(3);
for (const [n, d] of [
    [20, 576],
    [60, 576],
    [200, 832],
    [500, 832],
]) {
    const X = Array.from({ length: n }, () => Float32Array.from({ length: d }, () => random() * 2 - 1));
    const y = X.map((_, i) => (i % 2 ? 1 : -1));
    const w = y.map(() => 1);
    for (const [name, fit] of [
        ['logistic (dual Newton)', logisticFit],
        ['ridge (LOO lambda)', ridgeFit],
        ['app SGD (ml-model.js)', appLogisticFit],
    ]) {
        const reps = n > 100 ? 1 : 5;
        const t0 = performance.now();
        for (let r = 0; r < reps; r++) {
            fit(X, y, w);
        }
        console.log(`n=${n} d=${d} ${name}: ${((performance.now() - t0) / reps).toFixed(1)} ms per fit`);
    }
}
