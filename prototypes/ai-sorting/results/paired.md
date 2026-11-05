# Paired comparisons against the app today (f64+clip-b32-q8, app logistic)

## Few-shot like model, held-out AUC difference (40 trials each)

| taste | n | features | learner | mean AUC | diff vs app | 95% CI | trials won |
|---|---|---|---|---|---|---|---|
| 2/16 | 3 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.656 | | | |
| 2/16 | 3 | siglip2-b16-224-bnb4 | ridge (standardised, LOO lambda) | 0.833 | +0.176 | +0.145 to +0.208 | 98% |
| 2/16 | 3 | siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 0.831 | +0.175 | +0.143 to +0.207 | 98% |
| 2/16 | 3 | clip-b32-bnb4 | ridge (standardised, LOO lambda) | 0.829 | +0.173 | +0.140 to +0.205 | 100% |
| 2/16 | 3 | clip-b32-bnb4 | logistic (standardised, C=1) | 0.829 | +0.173 | +0.141 to +0.205 | 100% |
| 2/16 | 3 | f64+siglip2-b16-224-bnb4 | ridge (standardised, LOO lambda) | 0.828 | +0.172 | +0.142 to +0.202 | 95% |
| 2/16 | 3 | f64+siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 0.828 | +0.171 | +0.141 to +0.202 | 98% |
| 2/16 | 10 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.725 | | | |
| 2/16 | 10 | siglip2-b16-224-bnb4 | kNN-3 | 0.961 | +0.236 | +0.210 to +0.261 | 100% |
| 2/16 | 10 | siglip2-b16-224-fp32 | kNN-3 | 0.958 | +0.233 | +0.208 to +0.258 | 100% |
| 2/16 | 10 | f64+siglip2-b16-224-bnb4 | kNN-3 | 0.958 | +0.232 | +0.208 to +0.257 | 100% |
| 2/16 | 10 | clip-b32-fp32 | kNN-3 | 0.956 | +0.231 | +0.206 to +0.257 | 100% |
| 2/16 | 10 | siglip2-b32-256-fp32 | kNN-3 | 0.955 | +0.230 | +0.205 to +0.255 | 100% |
| 2/16 | 10 | f64+siglip2-b16-224-fp32 | kNN-3 | 0.955 | +0.229 | +0.205 to +0.254 | 100% |
| 2/16 | 30 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.862 | | | |
| 2/16 | 30 | siglip2-b16-224-bnb4 | kNN-3 | 0.988 | +0.126 | +0.107 to +0.144 | 100% |
| 2/16 | 30 | siglip2-b16-224-fp32 | kNN-3 | 0.987 | +0.125 | +0.107 to +0.143 | 100% |
| 2/16 | 30 | f64+siglip2-b16-224-bnb4 | kNN-3 | 0.987 | +0.125 | +0.107 to +0.142 | 100% |
| 2/16 | 30 | clip-b32-q8 | kNN-3 | 0.986 | +0.124 | +0.105 to +0.142 | 100% |
| 2/16 | 30 | f64+siglip2-b16-224-fp32 | kNN-3 | 0.985 | +0.123 | +0.105 to +0.141 | 100% |
| 2/16 | 30 | siglip2-b32-256-fp32 | kNN-3 | 0.984 | +0.122 | +0.104 to +0.140 | 100% |
| 5/16 | 3 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.574 | | | |
| 5/16 | 3 | clip-b32-q8 | logistic (standardised, C=1) | 0.701 | +0.127 | +0.106 to +0.149 | 98% |
| 5/16 | 3 | siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 0.700 | +0.127 | +0.103 to +0.150 | 95% |
| 5/16 | 3 | siglip2-b16-224-bnb4 | ridge (standardised, LOO lambda) | 0.700 | +0.126 | +0.103 to +0.150 | 95% |
| 5/16 | 3 | siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0.700 | +0.126 | +0.103 to +0.149 | 93% |
| 5/16 | 3 | clip-b16-fp32 | logistic (standardised, C=1) | 0.700 | +0.126 | +0.104 to +0.147 | 98% |
| 5/16 | 3 | siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 0.699 | +0.126 | +0.103 to +0.148 | 93% |
| 5/16 | 10 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.640 | | | |
| 5/16 | 10 | siglip2-b16-224-bnb4 | kNN-3 | 0.882 | +0.242 | +0.220 to +0.264 | 100% |
| 5/16 | 10 | clip-b32-fp32 | kNN-3 | 0.880 | +0.240 | +0.217 to +0.263 | 100% |
| 5/16 | 10 | siglip2-b16-224-fp32 | kNN-3 | 0.879 | +0.239 | +0.217 to +0.261 | 100% |
| 5/16 | 10 | f64+siglip2-b16-224-bnb4 | kNN-3 | 0.878 | +0.238 | +0.216 to +0.259 | 100% |
| 5/16 | 10 | clip-b16-fp32 | kNN-3 | 0.878 | +0.238 | +0.215 to +0.261 | 100% |
| 5/16 | 10 | clip-b32-q8 | kNN-3 | 0.877 | +0.236 | +0.213 to +0.260 | 100% |
| 5/16 | 30 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.715 | | | |
| 5/16 | 30 | siglip2-b16-224-bnb4 | kNN-3 | 0.964 | +0.249 | +0.228 to +0.271 | 100% |
| 5/16 | 30 | clip-b16-fp32 | kNN-3 | 0.961 | +0.246 | +0.225 to +0.267 | 100% |
| 5/16 | 30 | siglip2-b16-224-fp32 | kNN-3 | 0.961 | +0.246 | +0.225 to +0.267 | 100% |
| 5/16 | 30 | clip-b32-q8 | kNN-3 | 0.961 | +0.246 | +0.225 to +0.267 | 100% |
| 5/16 | 30 | f64+siglip2-b16-224-bnb4 | kNN-3 | 0.961 | +0.246 | +0.225 to +0.267 | 100% |
| 5/16 | 30 | clip-b32-fp32 | kNN-3 | 0.960 | +0.245 | +0.224 to +0.266 | 100% |

## Quality taste, held-out AUC difference

| n | features | learner | mean AUC | diff vs app | 95% CI | trials won |
|---|---|---|---|---|---|---|
| 5 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.527 | | | |
| 5 | f64+clip-b16-fp32 | logistic (standardised, C=1) | 0.585 | +0.059 | +0.040 to +0.078 | 80% |
| 5 | clip-b16-fp32 | logistic (standardised, C=1) | 0.583 | +0.056 | +0.036 to +0.077 | 78% |
| 5 | f64+clip-b16-fp32 | ridge (standardised, LOO lambda) | 0.577 | +0.051 | +0.032 to +0.069 | 75% |
| 5 | f64+clip-b16-fp32 | centroid | 0.576 | +0.050 | +0.031 to +0.068 | 75% |
| 5 | clip-b16-fp32 | ridge (standardised, LOO lambda) | 0.576 | +0.049 | +0.028 to +0.070 | 70% |
| 5 | clip-b32-q8 | LAION aesthetic v1 head, no labels | 0.574 | +0.048 | +0.032 to +0.064 | 83% |
| 10 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.556 | | | |
| 10 | f64+clip-b16-fp32 | logistic (standardised, C=1) | 0.637 | +0.080 | +0.059 to +0.102 | 85% |
| 10 | clip-b16-fp32 | logistic (standardised, C=1) | 0.632 | +0.076 | +0.054 to +0.098 | 80% |
| 10 | f64+clip-b16-fp32 | app logistic (standardised) | 0.628 | +0.071 | +0.049 to +0.094 | 85% |
| 10 | f64+clip-b16-fp32 | ridge (standardised, LOO lambda) | 0.627 | +0.071 | +0.050 to +0.091 | 83% |
| 10 | clip-b16-fp32 | ridge (standardised, LOO lambda) | 0.623 | +0.067 | +0.045 to +0.089 | 80% |
| 10 | f64+clip-b16-fp32 | app logistic (train-standardised) | 0.621 | +0.064 | +0.038 to +0.090 | 85% |
| 20 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.572 | | | |
| 20 | f64+clip-b16-fp32 | logistic (standardised, C=1) | 0.681 | +0.108 | +0.090 to +0.127 | 98% |
| 20 | clip-b16-fp32 | logistic (standardised, C=1) | 0.675 | +0.103 | +0.082 to +0.123 | 98% |
| 20 | f64+clip-b16-fp32 | ridge (standardised, LOO lambda) | 0.668 | +0.096 | +0.078 to +0.113 | 98% |
| 20 | f64+clip-b32-fp32 | logistic (standardised, C=1) | 0.667 | +0.095 | +0.076 to +0.114 | 98% |
| 20 | clip-b32-fp32 | logistic (standardised, C=1) | 0.663 | +0.091 | +0.070 to +0.112 | 93% |
| 20 | clip-b16-fp32 | ridge (standardised, LOO lambda) | 0.662 | +0.090 | +0.070 to +0.110 | 98% |

## Like-or-skip: likes found in 60 shown, difference vs ignoring skips (same features, learner, miss rate)

| features | learner | liked files passed | strategy | likes found | diff vs ignore | 95% CI | held-out AUC diff |
|---|---|---|---|---|---|---|---|
| clip-b16-fp32 | app logistic (raw) | 0% | skips as dislikes | 31.5 | +9.1 | +7.1 to +11.1 | +0.130 +/- 0.035 |
| clip-b16-fp32 | app logistic (raw) | 20% | skips as dislikes | 25.4 | +7.4 | +6.0 to +8.8 | +0.123 +/- 0.038 |
| clip-b16-fp32 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 37.3 | +2.6 | +1.0 to +4.2 | +0.025 +/- 0.016 |
| clip-b16-fp32 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 27.4 | +0.1 | -0.8 to +1.1 | -0.012 +/- 0.022 |
| clip-b16-fp32 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 37.7 | +3.0 | +1.7 to +4.3 | +0.032 +/- 0.018 |
| clip-b16-fp32 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 29.0 | +1.8 | +0.7 to +2.8 | +0.029 +/- 0.016 |
| clip-b16-fp32 | logistic (standardised, C=1) | 0% | skips as dislikes | 35.5 | +1.5 | -0.1 to +3.1 | +0.015 +/- 0.020 |
| clip-b16-fp32 | logistic (standardised, C=1) | 20% | skips as dislikes | 22.8 | -4.6 | -6.5 to -2.7 | -0.076 +/- 0.030 |
| clip-b16-fp32 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 36.9 | +2.9 | +1.2 to +4.6 | +0.027 +/- 0.022 |
| clip-b16-fp32 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 24.0 | -3.4 | -5.3 to -1.5 | -0.045 +/- 0.027 |
| clip-b32-bnb4 | app logistic (raw) | 0% | skips as dislikes | 31.6 | +8.6 | +6.7 to +10.5 | +0.129 +/- 0.031 |
| clip-b32-bnb4 | app logistic (raw) | 20% | skips as dislikes | 25.4 | +7.1 | +5.6 to +8.6 | +0.134 +/- 0.032 |
| clip-b32-bnb4 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 36.5 | +2.6 | +1.0 to +4.2 | +0.034 +/- 0.025 |
| clip-b32-bnb4 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 26.4 | -0.7 | -2.0 to +0.7 | -0.018 +/- 0.031 |
| clip-b32-bnb4 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 37.1 | +3.2 | +1.9 to +4.5 | +0.043 +/- 0.016 |
| clip-b32-bnb4 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 28.3 | +1.2 | +0.0 to +2.4 | +0.025 +/- 0.022 |
| clip-b32-bnb4 | logistic (standardised, C=1) | 0% | skips as dislikes | 35.0 | +1.9 | +0.5 to +3.3 | +0.026 +/- 0.025 |
| clip-b32-bnb4 | logistic (standardised, C=1) | 20% | skips as dislikes | 21.9 | -4.5 | -6.4 to -2.7 | -0.074 +/- 0.034 |
| clip-b32-bnb4 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 36.0 | +2.9 | +1.5 to +4.3 | +0.043 +/- 0.023 |
| clip-b32-bnb4 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 23.6 | -2.9 | -4.6 to -1.1 | -0.047 +/- 0.027 |
| clip-b32-fp32 | app logistic (raw) | 0% | skips as dislikes | 31.7 | +8.6 | +6.6 to +10.5 | +0.128 +/- 0.032 |
| clip-b32-fp32 | app logistic (raw) | 20% | skips as dislikes | 25.9 | +7.7 | +6.3 to +9.0 | +0.127 +/- 0.033 |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 37.0 | +2.1 | +0.7 to +3.6 | +0.035 +/- 0.024 |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 26.8 | -1.3 | -2.6 to +0.1 | -0.018 +/- 0.028 |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 37.1 | +2.3 | +1.1 to +3.5 | +0.043 +/- 0.016 |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 28.9 | +0.8 | -0.2 to +1.8 | +0.028 +/- 0.022 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0% | skips as dislikes | 36.5 | +2.6 | +1.1 to +4.1 | +0.037 +/- 0.025 |
| clip-b32-fp32 | logistic (standardised, C=1) | 20% | skips as dislikes | 22.1 | -5.2 | -6.9 to -3.4 | -0.076 +/- 0.031 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 37.2 | +3.3 | +1.7 to +4.8 | +0.044 +/- 0.023 |
| clip-b32-fp32 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 23.8 | -3.5 | -5.2 to -1.9 | -0.043 +/- 0.028 |
| clip-b32-q8 | app logistic (raw) | 0% | skips as dislikes | 31.5 | +8.0 | +6.2 to +9.9 | +0.123 +/- 0.032 |
| clip-b32-q8 | app logistic (raw) | 20% | skips as dislikes | 25.7 | +6.7 | +5.2 to +8.2 | +0.122 +/- 0.032 |
| clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 36.5 | +2.2 | +1.1 to +3.3 | +0.033 +/- 0.020 |
| clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 27.7 | +0.3 | -0.8 to +1.5 | +0.006 +/- 0.025 |
| clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 37.1 | +2.8 | +1.6 to +4.0 | +0.038 +/- 0.014 |
| clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 29.1 | +1.7 | +0.6 to +2.8 | +0.031 +/- 0.020 |
| clip-b32-q8 | logistic (standardised, C=1) | 0% | skips as dislikes | 35.8 | +2.1 | +0.6 to +3.7 | +0.030 +/- 0.023 |
| clip-b32-q8 | logistic (standardised, C=1) | 20% | skips as dislikes | 22.2 | -5.0 | -6.5 to -3.4 | -0.068 +/- 0.033 |
| clip-b32-q8 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 36.9 | +3.3 | +1.5 to +5.0 | +0.042 +/- 0.022 |
| clip-b32-q8 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 23.9 | -3.3 | -4.8 to -1.7 | -0.035 +/- 0.028 |
| f64+clip-b32-q8 | app logistic (raw) | 0% | skips as dislikes | 25.3 | +8.5 | +6.9 to +10.1 | +0.164 +/- 0.029 |
| f64+clip-b32-q8 | app logistic (raw) | 20% | skips as dislikes | 19.1 | +5.7 | +4.5 to +6.9 | +0.135 +/- 0.029 |
| f64+clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 36.8 | +2.9 | +1.2 to +4.5 | +0.037 +/- 0.023 |
| f64+clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 26.9 | -0.1 | -1.6 to +1.3 | +0.012 +/- 0.027 |
| f64+clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 37.0 | +3.0 | +1.4 to +4.7 | +0.044 +/- 0.020 |
| f64+clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 28.8 | +1.7 | +0.4 to +3.1 | +0.035 +/- 0.019 |
| f64+clip-b32-q8 | logistic (standardised, C=1) | 0% | skips as dislikes | 35.7 | +2.3 | +0.3 to +4.2 | +0.038 +/- 0.024 |
| f64+clip-b32-q8 | logistic (standardised, C=1) | 20% | skips as dislikes | 22.8 | -3.9 | -5.6 to -2.1 | -0.063 +/- 0.033 |
| f64+clip-b32-q8 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 36.6 | +3.3 | +1.5 to +5.0 | +0.041 +/- 0.021 |
| f64+clip-b32-q8 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 24.8 | -1.9 | -3.6 to -0.1 | -0.029 +/- 0.030 |
| dinov2reg-s-fp32 | app logistic (raw) | 0% | skips as dislikes | 31.9 | +4.2 | +3.0 to +5.4 | +0.104 +/- 0.019 |
| dinov2reg-s-fp32 | app logistic (raw) | 20% | skips as dislikes | 25.1 | +2.7 | +1.4 to +4.0 | +0.086 +/- 0.023 |
| dinov2reg-s-fp32 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 33.5 | +0.8 | -0.4 to +2.1 | +0.021 +/- 0.017 |
| dinov2reg-s-fp32 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 24.6 | -1.5 | -2.7 to -0.3 | -0.014 +/- 0.022 |
| dinov2reg-s-fp32 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 34.6 | +1.9 | +0.6 to +3.1 | +0.033 +/- 0.017 |
| dinov2reg-s-fp32 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 25.9 | -0.2 | -1.1 to +0.7 | +0.008 +/- 0.016 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0% | skips as dislikes | 32.4 | -1.0 | -2.4 to +0.4 | +0.005 +/- 0.024 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 20% | skips as dislikes | 20.7 | -5.2 | -6.7 to -3.6 | -0.088 +/- 0.027 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 33.3 | -0.1 | -1.4 to +1.2 | +0.017 +/- 0.021 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 21.9 | -4.0 | -5.4 to -2.6 | -0.064 +/- 0.024 |
| siglip2-b16-224-bnb4 | app logistic (raw) | 0% | skips as dislikes | 33.5 | +8.7 | +7.0 to +10.4 | +0.127 +/- 0.029 |
| siglip2-b16-224-bnb4 | app logistic (raw) | 20% | skips as dislikes | 26.6 | +6.6 | +5.0 to +8.2 | +0.109 +/- 0.028 |
| siglip2-b16-224-bnb4 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 38.0 | +3.3 | +1.5 to +5.1 | +0.036 +/- 0.022 |
| siglip2-b16-224-bnb4 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 28.1 | +0.3 | -0.9 to +1.6 | +0.004 +/- 0.023 |
| siglip2-b16-224-bnb4 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 37.7 | +2.9 | +1.5 to +4.4 | +0.039 +/- 0.017 |
| siglip2-b16-224-bnb4 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 28.6 | +0.8 | -0.3 to +2.0 | +0.018 +/- 0.018 |
| siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 0% | skips as dislikes | 36.2 | +2.7 | +0.9 to +4.5 | +0.035 +/- 0.019 |
| siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 20% | skips as dislikes | 22.8 | -4.5 | -6.4 to -2.5 | -0.099 +/- 0.028 |
| siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 37.4 | +3.9 | +2.1 to +5.6 | +0.048 +/- 0.019 |
| siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 23.7 | -3.5 | -5.4 to -1.6 | -0.065 +/- 0.027 |
| siglip2-b16-224-fp32 | app logistic (raw) | 0% | skips as dislikes | 32.9 | +8.9 | +6.9 to +10.9 | +0.120 +/- 0.028 |
| siglip2-b16-224-fp32 | app logistic (raw) | 20% | skips as dislikes | 26.4 | +6.5 | +5.0 to +8.1 | +0.108 +/- 0.031 |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 37.0 | +1.7 | +0.2 to +3.3 | +0.029 +/- 0.021 |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 27.0 | -1.1 | -2.7 to +0.4 | -0.001 +/- 0.025 |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 38.0 | +2.7 | +1.4 to +4.0 | +0.035 +/- 0.017 |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 29.0 | +0.8 | -0.2 to +1.8 | +0.018 +/- 0.017 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0% | skips as dislikes | 35.9 | +1.1 | -0.4 to +2.5 | +0.024 +/- 0.020 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 20% | skips as dislikes | 22.1 | -5.7 | -7.7 to -3.7 | -0.098 +/- 0.034 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 37.0 | +2.2 | +0.7 to +3.7 | +0.034 +/- 0.022 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 23.8 | -4.1 | -6.0 to -2.2 | -0.076 +/- 0.027 |
| siglip2-b16-224-q8 | app logistic (raw) | 0% | skips as dislikes | 28.2 | +7.0 | +5.2 to +8.8 | +0.118 +/- 0.030 |
| siglip2-b16-224-q8 | app logistic (raw) | 20% | skips as dislikes | 23.0 | +5.9 | +4.4 to +7.4 | +0.111 +/- 0.032 |
| siglip2-b16-224-q8 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 31.0 | +3.5 | +1.7 to +5.3 | +0.048 +/- 0.028 |
| siglip2-b16-224-q8 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 22.9 | +1.4 | -0.1 to +3.0 | +0.008 +/- 0.031 |
| siglip2-b16-224-q8 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 32.4 | +4.8 | +3.1 to +6.5 | +0.066 +/- 0.026 |
| siglip2-b16-224-q8 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 24.6 | +3.1 | +1.8 to +4.5 | +0.045 +/- 0.022 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 0% | skips as dislikes | 28.6 | +2.0 | -0.0 to +4.0 | +0.043 +/- 0.028 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 20% | skips as dislikes | 19.1 | -2.3 | -3.9 to -0.8 | -0.048 +/- 0.031 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 30.2 | +3.6 | +1.6 to +5.5 | +0.050 +/- 0.027 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 20.5 | -1.0 | -2.5 to +0.5 | -0.021 +/- 0.033 |
| siglip2-b32-256-fp32 | app logistic (raw) | 0% | skips as dislikes | 32.2 | +7.8 | +6.1 to +9.6 | +0.112 +/- 0.029 |
| siglip2-b32-256-fp32 | app logistic (raw) | 20% | skips as dislikes | 25.6 | +5.7 | +3.9 to +7.6 | +0.104 +/- 0.028 |
| siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 37.9 | +3.5 | +1.8 to +5.3 | +0.039 +/- 0.019 |
| siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 26.2 | -1.4 | -3.0 to +0.3 | -0.005 +/- 0.021 |
| siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 37.7 | +3.4 | +1.9 to +4.8 | +0.038 +/- 0.018 |
| siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 28.6 | +1.1 | -0.3 to +2.4 | +0.023 +/- 0.020 |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0% | skips as dislikes | 35.3 | +1.2 | -0.6 to +3.1 | +0.017 +/- 0.023 |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 20% | skips as dislikes | 21.4 | -5.8 | -7.8 to -3.8 | -0.103 +/- 0.031 |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 36.9 | +2.8 | +1.2 to +4.5 | +0.035 +/- 0.020 |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 23.1 | -4.0 | -5.8 to -2.3 | -0.055 +/- 0.027 |
