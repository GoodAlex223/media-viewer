# Paired comparisons against the app today (f64+clip-b32-q8, app logistic)

## Few-shot like model, held-out AUC difference (40 trials each)

| taste | n | features | learner | mean AUC | diff vs app | 95% CI | trials won |
|---|---|---|---|---|---|---|---|
| 2/16 | 3 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.602 | | | |
| 2/16 | 3 | siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.754 | +0.152 | +0.130 to +0.174 | 98% |
| 2/16 | 3 | siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.754 | +0.152 | +0.129 to +0.174 | 98% |
| 2/16 | 3 | f64+siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.751 | +0.148 | +0.128 to +0.169 | 98% |
| 2/16 | 3 | siglip2-b16-224-fp32 | app logistic (raw) | 0.750 | +0.148 | +0.123 to +0.173 | 95% |
| 2/16 | 3 | f64+siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.750 | +0.148 | +0.127 to +0.168 | 100% |
| 2/16 | 3 | siglip2-b16-224-fp32 | kNN-3 | 0.750 | +0.148 | +0.125 to +0.171 | 100% |
| 2/16 | 10 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.650 | | | |
| 2/16 | 10 | siglip2-b16-224-fp32 | kNN-3 | 0.833 | +0.183 | +0.157 to +0.209 | 98% |
| 2/16 | 10 | f64+siglip2-b16-224-fp32 | kNN-3 | 0.830 | +0.180 | +0.154 to +0.205 | 98% |
| 2/16 | 10 | siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.826 | +0.176 | +0.151 to +0.202 | 98% |
| 2/16 | 10 | siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.822 | +0.172 | +0.147 to +0.197 | 100% |
| 2/16 | 10 | f64+siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.822 | +0.172 | +0.147 to +0.196 | 98% |
| 2/16 | 10 | f64+siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.819 | +0.169 | +0.145 to +0.194 | 98% |
| 2/16 | 30 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.753 | | | |
| 2/16 | 30 | siglip2-b16-224-fp32 | kNN-3 | 0.926 | +0.173 | +0.149 to +0.198 | 98% |
| 2/16 | 30 | f64+siglip2-b16-224-fp32 | kNN-3 | 0.924 | +0.171 | +0.147 to +0.195 | 98% |
| 2/16 | 30 | siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.922 | +0.169 | +0.144 to +0.193 | 100% |
| 2/16 | 30 | f64+siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.919 | +0.166 | +0.142 to +0.191 | 100% |
| 2/16 | 30 | clip-b32-q8 | kNN-3 | 0.918 | +0.165 | +0.139 to +0.191 | 95% |
| 2/16 | 30 | clip-b32-fp32 | kNN-3 | 0.914 | +0.161 | +0.135 to +0.187 | 98% |
| 5/16 | 3 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.562 | | | |
| 5/16 | 3 | siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.638 | +0.076 | +0.060 to +0.091 | 98% |
| 5/16 | 3 | siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.635 | +0.072 | +0.056 to +0.088 | 95% |
| 5/16 | 3 | f64+siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.635 | +0.072 | +0.057 to +0.087 | 98% |
| 5/16 | 3 | f64+siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.632 | +0.070 | +0.056 to +0.085 | 98% |
| 5/16 | 3 | siglip2-b16-224-fp32 | centroid | 0.630 | +0.068 | +0.051 to +0.084 | 95% |
| 5/16 | 3 | siglip2-b16-224-fp32 | app logistic (raw) | 0.629 | +0.066 | +0.049 to +0.084 | 93% |
| 5/16 | 10 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.599 | | | |
| 5/16 | 10 | siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.753 | +0.154 | +0.131 to +0.176 | 100% |
| 5/16 | 10 | f64+siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.750 | +0.151 | +0.129 to +0.173 | 100% |
| 5/16 | 10 | siglip2-b16-224-fp32 | kNN-3 | 0.750 | +0.151 | +0.129 to +0.173 | 100% |
| 5/16 | 10 | f64+siglip2-b16-224-fp32 | kNN-3 | 0.747 | +0.148 | +0.127 to +0.170 | 100% |
| 5/16 | 10 | siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.747 | +0.148 | +0.126 to +0.170 | 100% |
| 5/16 | 10 | f64+siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0.746 | +0.147 | +0.126 to +0.168 | 100% |
| 5/16 | 30 | f64+clip-b32-q8 | app logistic (raw) (app today) | 0.658 | | | |
| 5/16 | 30 | siglip2-b16-224-fp32 | kNN-3 | 0.857 | +0.199 | +0.183 to +0.216 | 100% |
| 5/16 | 30 | siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.856 | +0.199 | +0.182 to +0.216 | 100% |
| 5/16 | 30 | f64+siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.855 | +0.197 | +0.181 to +0.213 | 100% |
| 5/16 | 30 | dinov2reg-s-fp32 | kNN-3 | 0.854 | +0.196 | +0.182 to +0.211 | 100% |
| 5/16 | 30 | f64+siglip2-b16-224-fp32 | kNN-3 | 0.852 | +0.194 | +0.178 to +0.210 | 100% |
| 5/16 | 30 | clip-b32-q8 | kNN-3 | 0.850 | +0.192 | +0.177 to +0.208 | 100% |

## Like-or-skip: likes found in 60 shown, difference vs ignoring skips (same features, learner, miss rate)

| features | learner | liked files passed | strategy | likes found | diff vs ignore | 95% CI | held-out AUC diff |
|---|---|---|---|---|---|---|---|
| clip-b32-fp32 | app logistic (raw) | 0% | skips as dislikes | 25.7 | +6.9 | +5.3 to +8.5 | +0.129 +/- 0.035 |
| clip-b32-fp32 | app logistic (raw) | 20% | skips as dislikes | 20.5 | +5.7 | +4.4 to +6.9 | +0.124 +/- 0.035 |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 27.3 | +3.2 | +1.5 to +4.9 | +0.056 +/- 0.043 |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 19.9 | +1.3 | -0.3 to +2.8 | +0.044 +/- 0.044 |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 27.9 | +3.8 | +2.5 to +5.1 | +0.084 +/- 0.031 |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 21.1 | +2.5 | +1.4 to +3.6 | +0.064 +/- 0.030 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0% | skips as dislikes | 26.0 | +2.1 | +0.2 to +4.1 | +0.059 +/- 0.039 |
| clip-b32-fp32 | logistic (standardised, C=1) | 20% | skips as dislikes | 16.3 | -2.1 | -3.7 to -0.5 | -0.009 +/- 0.039 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 27.1 | +3.3 | +1.2 to +5.4 | +0.060 +/- 0.039 |
| clip-b32-fp32 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 17.5 | -0.9 | -2.5 to +0.6 | +0.023 +/- 0.040 |
| clip-b32-q8 | app logistic (raw) | 0% | skips as dislikes | 26.3 | +7.0 | +5.0 to +9.0 | +0.126 +/- 0.036 |
| clip-b32-q8 | app logistic (raw) | 20% | skips as dislikes | 20.7 | +5.4 | +3.6 to +7.2 | +0.134 +/- 0.035 |
| clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 27.8 | +3.1 | +1.0 to +5.1 | +0.062 +/- 0.035 |
| clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 21.4 | +2.2 | +0.5 to +4.0 | +0.043 +/- 0.046 |
| clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 28.1 | +3.4 | +2.1 to +4.8 | +0.070 +/- 0.034 |
| clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 21.6 | +2.5 | +1.2 to +3.7 | +0.049 +/- 0.030 |
| clip-b32-q8 | logistic (standardised, C=1) | 0% | skips as dislikes | 26.4 | +2.2 | +0.3 to +4.1 | +0.053 +/- 0.036 |
| clip-b32-q8 | logistic (standardised, C=1) | 20% | skips as dislikes | 17.1 | -1.8 | -3.4 to -0.1 | -0.011 +/- 0.042 |
| clip-b32-q8 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 27.1 | +2.9 | +1.1 to +4.6 | +0.063 +/- 0.037 |
| clip-b32-q8 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 18.5 | -0.4 | -2.0 to +1.2 | +0.004 +/- 0.038 |
| f64+clip-b32-q8 | app logistic (raw) | 0% | skips as dislikes | 20.3 | +6.2 | +5.1 to +7.2 | +0.134 +/- 0.028 |
| f64+clip-b32-q8 | app logistic (raw) | 20% | skips as dislikes | 15.4 | +4.4 | +3.6 to +5.2 | +0.127 +/- 0.027 |
| f64+clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 27.3 | +3.1 | +1.1 to +5.1 | +0.057 +/- 0.035 |
| f64+clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 20.4 | +1.7 | -0.0 to +3.4 | +0.051 +/- 0.039 |
| f64+clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 28.3 | +4.2 | +2.5 to +5.8 | +0.072 +/- 0.033 |
| f64+clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 21.5 | +2.8 | +1.5 to +4.1 | +0.052 +/- 0.037 |
| f64+clip-b32-q8 | logistic (standardised, C=1) | 0% | skips as dislikes | 26.1 | +2.5 | +0.5 to +4.4 | +0.068 +/- 0.040 |
| f64+clip-b32-q8 | logistic (standardised, C=1) | 20% | skips as dislikes | 17.1 | -1.6 | -3.3 to +0.1 | -0.011 +/- 0.040 |
| f64+clip-b32-q8 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 27.5 | +3.9 | +1.8 to +5.9 | +0.079 +/- 0.040 |
| f64+clip-b32-q8 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 18.0 | -0.8 | -2.3 to +0.8 | +0.028 +/- 0.040 |
| dinov2reg-s-fp32 | app logistic (raw) | 0% | skips as dislikes | 26.9 | +5.3 | +3.5 to +7.1 | +0.118 +/- 0.036 |
| dinov2reg-s-fp32 | app logistic (raw) | 20% | skips as dislikes | 20.9 | +4.0 | +2.5 to +5.5 | +0.109 +/- 0.037 |
| dinov2reg-s-fp32 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 27.4 | +3.1 | +1.2 to +5.1 | +0.054 +/- 0.035 |
| dinov2reg-s-fp32 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 19.7 | +0.9 | -0.7 to +2.4 | +0.037 +/- 0.038 |
| dinov2reg-s-fp32 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 28.1 | +3.8 | +2.2 to +5.4 | +0.060 +/- 0.029 |
| dinov2reg-s-fp32 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 20.7 | +1.9 | +0.6 to +3.1 | +0.057 +/- 0.025 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0% | skips as dislikes | 24.8 | +0.7 | -1.3 to +2.7 | +0.053 +/- 0.041 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 20% | skips as dislikes | 16.0 | -2.7 | -4.1 to -1.3 | -0.021 +/- 0.037 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 25.3 | +1.3 | -0.7 to +3.2 | +0.065 +/- 0.036 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 17.1 | -1.6 | -3.0 to -0.1 | -0.008 +/- 0.036 |
| dinov2reg-s-q8 | app logistic (raw) | 0% | skips as dislikes | 25.9 | +5.6 | +3.7 to +7.5 | +0.118 +/- 0.031 |
| dinov2reg-s-q8 | app logistic (raw) | 20% | skips as dislikes | 19.6 | +3.5 | +2.0 to +5.0 | +0.107 +/- 0.030 |
| dinov2reg-s-q8 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 25.1 | +2.2 | +0.6 to +3.8 | +0.046 +/- 0.031 |
| dinov2reg-s-q8 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 18.4 | +0.5 | -1.0 to +2.0 | +0.004 +/- 0.034 |
| dinov2reg-s-q8 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 26.1 | +3.3 | +2.1 to +4.5 | +0.062 +/- 0.024 |
| dinov2reg-s-q8 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 20.0 | +2.1 | +1.0 to +3.2 | +0.055 +/- 0.029 |
| dinov2reg-s-q8 | logistic (standardised, C=1) | 0% | skips as dislikes | 23.4 | +0.7 | -1.1 to +2.5 | +0.023 +/- 0.035 |
| dinov2reg-s-q8 | logistic (standardised, C=1) | 20% | skips as dislikes | 15.2 | -2.2 | -3.7 to -0.6 | -0.030 +/- 0.033 |
| dinov2reg-s-q8 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 23.8 | +1.1 | -0.6 to +2.8 | +0.048 +/- 0.032 |
| dinov2reg-s-q8 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 15.8 | -1.6 | -3.1 to +0.0 | -0.008 +/- 0.036 |
| siglip2-b16-224-fp32 | app logistic (raw) | 0% | skips as dislikes | 27.9 | +7.2 | +5.4 to +8.9 | +0.146 +/- 0.033 |
| siglip2-b16-224-fp32 | app logistic (raw) | 20% | skips as dislikes | 21.8 | +5.7 | +4.0 to +7.3 | +0.119 +/- 0.039 |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 29.2 | +4.0 | +1.8 to +6.1 | +0.083 +/- 0.033 |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 21.7 | +1.8 | +0.2 to +3.4 | +0.019 +/- 0.045 |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 29.6 | +4.3 | +2.8 to +5.9 | +0.091 +/- 0.030 |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 22.8 | +2.9 | +1.4 to +4.3 | +0.063 +/- 0.031 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0% | skips as dislikes | 28.1 | +2.9 | +1.0 to +4.7 | +0.071 +/- 0.035 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 20% | skips as dislikes | 17.7 | -1.6 | -3.5 to +0.2 | -0.006 +/- 0.036 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 29.5 | +4.3 | +2.5 to +6.1 | +0.093 +/- 0.031 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 18.6 | -0.8 | -2.4 to +0.9 | +0.010 +/- 0.040 |
| siglip2-b16-224-q8 | app logistic (raw) | 0% | skips as dislikes | 23.0 | +5.4 | +3.9 to +6.9 | +0.103 +/- 0.034 |
| siglip2-b16-224-q8 | app logistic (raw) | 20% | skips as dislikes | 17.9 | +4.2 | +3.0 to +5.5 | +0.081 +/- 0.038 |
| siglip2-b16-224-q8 | ridge (standardised, LOO lambda) | 0% | skips as dislikes | 23.9 | +3.0 | +1.3 to +4.7 | +0.060 +/- 0.036 |
| siglip2-b16-224-q8 | ridge (standardised, LOO lambda) | 20% | skips as dislikes | 18.0 | +2.2 | +0.7 to +3.8 | +0.039 +/- 0.045 |
| siglip2-b16-224-q8 | ridge (standardised, LOO lambda) | 0% | skips as weak dislikes (0.3) | 23.9 | +2.9 | +1.7 to +4.1 | +0.056 +/- 0.026 |
| siglip2-b16-224-q8 | ridge (standardised, LOO lambda) | 20% | skips as weak dislikes (0.3) | 18.9 | +3.2 | +2.1 to +4.3 | +0.063 +/- 0.027 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 0% | skips as dislikes | 21.4 | +0.4 | -1.3 to +2.2 | +0.031 +/- 0.037 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 20% | skips as dislikes | 14.9 | -0.9 | -2.6 to +0.7 | -0.013 +/- 0.039 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 0% | skips as weak dislikes (0.3) | 21.8 | +0.8 | -1.0 to +2.6 | +0.041 +/- 0.039 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 20% | skips as weak dislikes (0.3) | 15.3 | -0.5 | -2.1 to +1.1 | +0.001 +/- 0.039 |
